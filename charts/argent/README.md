# argent Helm chart

Installs Argent, the self-hosted personal finance app: the web app (nginx), the API (Bun) and, by default, a
[CloudNativePG](https://cloudnative-pg.io) PostgreSQL cluster. It replaces the plain manifests that used to live in `k8s/`.

## What you need first

| Needed | Why |
| --- | --- |
| Kubernetes 1.27+ | |
| The **CloudNativePG operator** | for `database.mode=cnpg` (the default). Not needed with `database.mode=external`. `kubectl apply --server-side -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.25/releases/cnpg-1.25.0.yaml` |
| An ingress controller | Traefik (k3s/RKE2 default, `ingress.type=traefik`) or any controller with a standard Ingress (`ingress.type=ingress`) |
| **cert-manager** + a `ClusterIssuer` | for the TLS certificate (`ingress.tls.certManager`). Turn it off to bring your own secret |
| An **Authentik** OIDC application | a *public* client with redirect URI `https://<host>/auth/callback`; the `groups` scope must be in the token |
| Two container images | built from `docker/backend.Dockerfile` and `docker/frontend.Dockerfile` and pushed to your registry |

## Install

```sh
# 1. build and push the images (the tag defaults to the chart's appVersion)
docker build -f docker/backend.Dockerfile  -t registry.example.com/argent-backend:0.1.0  .
docker build -f docker/frontend.Dockerfile -t registry.example.com/argent-frontend:0.1.0 .
docker push registry.example.com/argent-backend:0.1.0 && docker push registry.example.com/argent-frontend:0.1.0

# 2. install
helm install argent ./charts/argent --namespace argent --create-namespace \
  --set host=argent.example.com \
  --set auth.issuer=https://authentik.example.com/application/o/argent \
  --set auth.clientId=<client id> \
  --set backend.image.repository=registry.example.com/argent-backend \
  --set frontend.image.repository=registry.example.com/argent-frontend

# 3. check
helm test argent --namespace argent
```

Keep your settings in a values file (`-f my-values.yaml`) rather than `--set`. `ci/*.yaml` has complete examples.
`host`, `auth.issuer` and `auth.clientId` are required; the chart refuses to render without them.

## How it is wired

* **Database.** With `database.mode=cnpg` the chart creates a `Cluster`; the operator generates the credentials in the
  Secret `<release>-postgres-app` and the API reads its connection string (`uri`) from there. No password is kept in
  values. With `database.mode=external` give a Secret that holds the connection string
  (`database.external.existingSecret`, key `DATABASE_URL`).
* **Migrations** run in an init container of the API pods (same image, `bun run src/db/migrate.ts`). It waits for the
  database to accept connections and holds a PostgreSQL advisory lock, so replicas that start together migrate one
  after the other.
* **Sign-in settings of the SPA** are not baked into the image: the frontend container writes `/env-config.js` at start
  from `VITE_AUTHENTIK_AUTHORITY` / `VITE_AUTHENTIK_CLIENT_ID` (set from `auth.*`).
* **Routing.** `/api` goes to the API, everything else to the SPA, on one host. HTTP is redirected to HTTPS.

## Security

Both images are built on SUSE's minimal base image (`bci-micro`: no package manager) and run as user 65532. The pods
run with `runAsNonRoot`, a read-only root file system (only `/tmp` is writable), all capabilities dropped, no
privilege escalation, the `RuntimeDefault` seccomp profile and no service account token. `networkPolicy.enabled=true`
adds policies: the SPA may only be reached by the ingress controller and has no egress; the API may only reach DNS,
the database and HTTPS (the OIDC issuer's JWKS and the price providers).
The chart installs no secrets of its own except the optional CoinGecko key (`coingecko.apiKey`, or reference an
existing Secret with `coingecko.existingSecret`).

## Values

| Key | Default | |
| --- | --- | --- |
| `host` | | **required** public host name |
| `auth.issuer` | | **required** OIDC issuer URL |
| `auth.clientId` | | **required** OIDC client id |
| `auth.authority` | `auth.issuer` | OIDC authority the SPA signs in at |
| `auth.adminGroup` / `auth.importGroup` | `argent-admin` / `argent-import` | Authentik groups for admin / import rights |
| `corsOrigin` | `https://<host>` | |
| `backend.image.*`, `frontend.image.*` | | `repository`, `tag` (default appVersion), `digest` (wins over the tag), `pullPolicy` |
| `backend.replicaCount`, `frontend.replicaCount` | `2` | |
| `backend.resources`, `frontend.resources` | small requests, memory limits | no CPU limit (it only causes throttling) |
| `backend.autoscaling.*`, `frontend.autoscaling.*` | off | HorizontalPodAutoscaler |
| `backend.podDisruptionBudget.*` | on, `minAvailable: 1` | only with more than one replica |
| `*.topologySpreadConstraints` | `auto` | soft spread over nodes; `[]` disables, or give your own |
| `database.mode` | `cnpg` | `cnpg` or `external` |
| `database.cnpg.instances` | `2` | |
| `database.cnpg.imageName` | `ghcr.io/cloudnative-pg/postgresql:16` | keep the major version of an existing database |
| `database.cnpg.storage.size` / `.storageClass` | `5Gi` / cluster default | |
| `database.cnpg.keepOnUninstall` | `true` | `helm uninstall` leaves the cluster and its data (`helm.sh/resource-policy: keep`) |
| `database.cnpg.backup.*` | off | `barmanObjectStore`, `retentionPolicy`, `schedule` (a daily `ScheduledBackup`) |
| `database.cnpg.extraSpec` | | merged into the `Cluster` spec |
| `coingecko.apiKey` / `.existingSecret` | | optional, raises the crypto price rate limit |
| `ingress.type` | `traefik` | `traefik` (IngressRoute CRDs) or `ingress` (standard Ingress) |
| `ingress.className`, `ingress.annotations` | | |
| `ingress.tls.enabled`, `.secretName`, `.certManager.*` | on, `<release>-tls`, `letsencrypt` ClusterIssuer | |
| `ingress.traefik.*` | `traefik.io/v1alpha1`, `web`/`websecure` | API version, entry points, HTTPS redirect, extra middlewares |
| `networkPolicy.*` | off | see Security |
| `podSecurityContext`, `containerSecurityContext` | hardened | |
| `imagePullSecrets`, `serviceAccount.*` | | |

## Upgrading and removing

```sh
helm upgrade argent ./charts/argent --namespace argent -f my-values.yaml
```

The API pods roll without downtime (`maxUnavailable: 0`); migrations run before the new API starts. A new CoinGecko
key rolls the pods. `helm uninstall` removes everything except the database cluster (see `keepOnUninstall`): delete
it deliberately with `kubectl delete cluster <release>-postgres` when the data is not needed any more.

## Developing the chart

```sh
helm lint charts/argent -f charts/argent/ci/full-values.yaml --strict
helm template argent charts/argent -f charts/argent/ci/default-values.yaml | kubeconform -strict -ignore-missing-schemas -
```

CI lints and renders the chart with every `ci/*-values.yaml` and validates the output against the Kubernetes schemas.
