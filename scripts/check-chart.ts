/**
 * Checks the Helm chart without a cluster: lints it, renders it with every `charts/argent/ci/*-values.yaml`,
 * parses every rendered object and asserts the properties the chart promises (hardened pods, required settings,
 * wiring between the objects). Needs `helm` on the PATH.
 *
 *   bun run check:chart
 *
 * CI additionally validates the rendered objects against the Kubernetes schemas with kubeconform.
 */
import { readdirSync } from "node:fs"

const CHART = "charts/argent"
const CI = `${CHART}/ci`

async function helm(...args: string[]) {
  const proc = Bun.spawn(["helm", ...args], { stdout: "pipe", stderr: "pipe" })
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  return { code: await proc.exited, out, err }
}

type Obj = Record<string, any>
const parse = (rendered: string): Obj[] =>
  rendered
    .split(/^---\s*$/m)
    .map((d) => d.trim())
    .filter((d) => d && !/^(#.*\n?)*$/.test(d))
    .map((d) => Bun.YAML.parse(d) as Obj)

let failures = 0
const fail = (where: string, message: string) => {
  failures++
  console.error(`  ✗ ${where}: ${message}`)
}
const expect = (where: string, condition: unknown, message: string) => condition || fail(where, message)

const files = readdirSync(CI).filter((f) => f.endsWith("-values.yaml")).sort()

for (const file of files) {
  const where = file.replace("-values.yaml", "")
  console.log(`• ${where}`)

  const lint = await helm("lint", CHART, "-f", `${CI}/${file}`, "--strict")
  expect(where, lint.code === 0, `helm lint failed\n${lint.out}${lint.err}`)

  const render = await helm("template", "argent", CHART, "-f", `${CI}/${file}`, "--namespace", "argent")
  if (render.code !== 0) {
    fail(where, `helm template failed: ${render.err}`)
    continue
  }
  const objects = parse(render.out)
  const ofKind = (kind: string) => objects.filter((o) => o.kind === kind)
  const named = (kind: string, name: string) => ofKind(kind).find((o) => o.metadata.name === name)

  for (const o of objects) expect(where, o.apiVersion && o.kind && o.metadata?.name, `incomplete object ${JSON.stringify(o).slice(0, 80)}`)

  // ── every workload is hardened ──
  const deployments = ofKind("Deployment")
  expect(where, deployments.length === 2, `expected 2 deployments, got ${deployments.length}`)
  for (const d of deployments) {
    const pod = d.spec.template.spec
    const id = `${where}/${d.metadata.name}`
    expect(id, pod.securityContext?.runAsNonRoot === true, "pod must runAsNonRoot")
    expect(id, Number(pod.securityContext?.runAsUser) > 0, "pod must run as a numeric non-root user")
    expect(id, pod.securityContext?.seccompProfile?.type === "RuntimeDefault", "pod needs the RuntimeDefault seccomp profile")
    expect(id, pod.automountServiceAccountToken === false, "no service account token")
    for (const c of [...(pod.initContainers ?? []), ...pod.containers]) {
      const cid = `${id}/${c.name}`
      expect(cid, c.securityContext?.readOnlyRootFilesystem === true, "root file system must be read-only")
      expect(cid, c.securityContext?.allowPrivilegeEscalation === false, "no privilege escalation")
      expect(cid, c.securityContext?.capabilities?.drop?.includes("ALL"), "must drop all capabilities")
      expect(cid, c.resources?.requests?.memory && c.resources?.limits?.memory, "needs memory requests and limits")
      expect(cid, !/:latest$/.test(c.image), "the image must not be :latest")
    }
    for (const c of pod.containers) {
      expect(`${id}/${c.name}`, c.readinessProbe && c.livenessProbe, "needs readiness and liveness probes")
      const tmp = c.volumeMounts?.find((m: Obj) => m.mountPath === "/tmp")
      expect(`${id}/${c.name}`, tmp, "needs a writable /tmp (the root file system is read-only)")
    }
  }

  // ── wiring ──
  const backend = named("Deployment", "argent-backend")
  const frontend = named("Deployment", "argent-frontend")
  const env = (d: Obj | undefined, container: string) => Object.fromEntries((d?.spec.template.spec.containers.find((c: Obj) => c.name === container)?.env ?? []).map((e: Obj) => [e.name, e]))
  const be = env(backend, "backend")
  expect(where, be.DATABASE_URL?.valueFrom?.secretKeyRef?.name, "the API needs DATABASE_URL from a secret")
  expect(where, be.AUTHENTIK_ISSUER?.value && be.CORS_ORIGIN?.value && be.AUTHENTIK_ADMIN_GROUP?.value && be.AUTHENTIK_IMPORT_GROUP?.value, "the API needs its production settings")
  expect(where, backend?.spec.template.spec.initContainers?.[0]?.name === "migrate", "the API runs migrations in an init container")
  const fe = env(frontend, "frontend")
  expect(where, fe.VITE_AUTHENTIK_AUTHORITY?.value && fe.VITE_AUTHENTIK_CLIENT_ID?.value, "the SPA needs its sign-in settings")

  const services = Object.fromEntries(ofKind("Service").map((s) => [s.metadata.name, s]))
  expect(where, services["argent-backend"]?.spec.ports[0].port === backend?.spec.template.spec.containers[0].ports[0].containerPort, "the backend Service port must match the container port")
  expect(where, services["argent-frontend"]?.spec.ports[0].port === frontend?.spec.template.spec.containers[0].ports[0].containerPort, "the frontend Service port must match the container port")

  // every selector must match its pod template, and every Service must select one deployment
  for (const d of deployments) {
    const labels = d.spec.template.metadata.labels
    for (const [k, v] of Object.entries(d.spec.selector.matchLabels)) expect(`${where}/${d.metadata.name}`, labels[k] === v, `selector label ${k} is not on the pods`)
  }

  // the database secret the API reads exists (CloudNativePG generates it) or is the external one
  const dbSecret = be.DATABASE_URL?.valueFrom?.secretKeyRef
  if (ofKind("Cluster").length > 0) expect(where, dbSecret?.name === `${ofKind("Cluster")[0].metadata.name}-app` && dbSecret?.key === "uri", "the API must read the CloudNativePG-generated secret")
  else expect(where, dbSecret?.name === "argent-database", "the API must read the external database secret")

  // routing: /api to the backend, the rest to the SPA
  const routes = ofKind("IngressRoute").find((r) => r.metadata.name === "argent")
  const ingress = ofKind("Ingress")[0]
  if (routes) {
    const api = routes.spec.routes.find((r: Obj) => r.match.includes("/api"))
    const web = routes.spec.routes.find((r: Obj) => !r.match.includes("/api"))
    expect(where, api?.services[0].name === "argent-backend" && web?.services[0].name === "argent-frontend", "IngressRoute must route /api to the backend and the rest to the frontend")
    expect(where, routes.spec.tls?.secretName, "the IngressRoute needs TLS")
  } else if (ingress) {
    const paths = ingress.spec.rules[0].http.paths
    expect(where, paths.find((p: Obj) => p.path === "/api")?.backend.service.name === "argent-backend" && paths.find((p: Obj) => p.path === "/")?.backend.service.name === "argent-frontend", "Ingress must route /api to the backend and the rest to the frontend")
  } else fail(where, "no ingress rendered")

  for (const policy of ofKind("NetworkPolicy")) {
    expect(`${where}/${policy.metadata.name}`, policy.spec.policyTypes?.includes("Egress") && policy.spec.policyTypes?.includes("Ingress"), "policies must cover ingress and egress")
  }
}

// ── the required settings really are required ──
const requiredCases: Array<[string, string[]]> = [
  ["host", ["--set", "auth.issuer=https://a.example.com", "--set", "auth.clientId=c"]],
  ["auth.issuer", ["--set", "host=a.example.com", "--set", "auth.clientId=c"]],
  ["auth.clientId", ["--set", "host=a.example.com", "--set", "auth.issuer=https://a.example.com"]],
  ["database.external.existingSecret", ["-f", `${CI}/default-values.yaml`, "--set", "database.mode=external"]],
]
for (const [setting, args] of requiredCases) {
  const r = await helm("template", "argent", CHART, ...args)
  expect(`required ${setting}`, r.code !== 0 && r.err.includes(setting), `rendering without ${setting} must fail with a message naming it`)
}
const invalid = await helm("template", "argent", CHART, "-f", `${CI}/default-values.yaml`, "--set", "database.mode=sqlite")
expect("schema", invalid.code !== 0, "an unknown database.mode must be rejected by values.schema.json")

if (failures > 0) {
  console.error(`\n${failures} problem(s) in the chart`)
  process.exit(1)
}
console.log(`\nchart OK (${files.length} value sets)`)
