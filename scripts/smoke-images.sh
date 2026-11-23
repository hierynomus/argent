#!/usr/bin/env bash
# Smoke test of the two container images, run the way Kubernetes runs them: as an unprivileged user, with a
# read-only root file system, no capabilities and a writable /tmp only.
#
#   docker build -f docker/backend.Dockerfile  -t argent-backend:test .
#   docker build -f docker/frontend.Dockerfile -t argent-frontend:test .
#   scripts/smoke-images.sh            # CONTAINER_CLI=podman to use podman
set -euo pipefail

CLI=${CONTAINER_CLI:-docker}
BACKEND=${BACKEND_IMAGE:-argent-backend:test}
FRONTEND=${FRONTEND_IMAGE:-argent-frontend:test}
NET=argent-smoke-$$
HARDEN=(--read-only --tmpfs /tmp --cap-drop=ALL --security-opt=no-new-privileges --user 65532:65532)
failed=0

cleanup() {
  $CLI rm -f "$NET-pg" "$NET-be" "$NET-fe" >/dev/null 2>&1 || true
  $CLI network rm -f "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

ok() { echo "  ✓ $1"; }
bad() { echo "  ✗ $1"; failed=1; }

# one HTTP request, made from inside a running container (the images have no curl): prints the raw response
request() { # container port path
  $CLI exec "$1" bash -c "exec 3<>/dev/tcp/127.0.0.1/$2 && printf 'GET $3 HTTP/1.0\r\nHost: smoke\r\n\r\n' >&3 && cat <&3"
}
expect_in() { # description haystack needle
  if grep -qiF -- "$3" <<<"$2"; then ok "$1"; else bad "$1 (missing: $3)"; fi
}

$CLI network create "$NET" >/dev/null

echo "frontend"
$CLI run -d --name "$NET-fe" "${HARDEN[@]}" \
  -e VITE_AUTHENTIK_AUTHORITY='https://auth.example.com/application/o/argent' -e VITE_AUTHENTIK_CLIENT_ID='client"id' \
  "$FRONTEND" >/dev/null
sleep 2
home=$(request "$NET-fe" 8080 /)
expect_in "serves the SPA" "$home" "HTTP/1.1 200"
expect_in "does not cache index.html" "$home" "Cache-Control: no-cache"
expect_in "sends security headers" "$home" "X-Content-Type-Options: nosniff"
expect_in "hides the nginx version" "$(request "$NET-fe" 8080 /)" "Server: nginx"$'\r'
if grep -qE "Server: nginx/" <<<"$home"; then bad "leaks the nginx version"; else ok "does not leak the nginx version"; fi
config=$(request "$NET-fe" 8080 /env-config.js)
expect_in "writes the runtime config" "$config" 'VITE_AUTHENTIK_AUTHORITY: "https://auth.example.com/application/o/argent"'
expect_in "escapes quotes in the config" "$config" 'VITE_AUTHENTIK_CLIENT_ID: "client\"id"'
expect_in "never caches the config" "$config" "Cache-Control: no-store"
expect_in "falls back to the SPA for deep links" "$(request "$NET-fe" 8080 /accounts/1/deep)" "HTTP/1.1 200"
expect_in "answers the health check" "$(request "$NET-fe" 8080 /healthz)" "HTTP/1.1 200"
asset=$(grep -o '/assets/[^"]*\.js' <<<"$home" | head -1)
expect_in "caches fingerprinted assets for a year" "$(request "$NET-fe" 8080 "$asset")" "max-age=31536000"
expect_in "answers 404 for a missing asset" "$(request "$NET-fe" 8080 /assets/missing.js)" "HTTP/1.1 404"

echo "backend"
$CLI run -d --name "$NET-pg" --network "$NET" -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=argent docker.io/library/postgres:16 >/dev/null
for _ in $(seq 1 60); do $CLI exec "$NET-pg" pg_isready -U postgres -d argent >/dev/null 2>&1 && break; sleep 1; done
DB=postgres://postgres:pw@$NET-pg:5432/argent
# two migrators at once: the advisory lock lets them take turns
$CLI run -d --name "$NET-mig1" --network "$NET" "${HARDEN[@]}" -e DATABASE_URL=$DB "$BACKEND" run src/db/migrate.ts >/dev/null
if $CLI run --rm --network "$NET" "${HARDEN[@]}" -e DATABASE_URL=$DB "$BACKEND" run src/db/migrate.ts 2>&1 | grep -q "Migrations applied successfully"; then ok "applies the migrations"; else bad "migrations failed"; fi
[ "$($CLI wait "$NET-mig1")" = "0" ] && ok "a second migrator running at the same time also succeeds" || bad "the concurrent migrator failed"
$CLI rm -f "$NET-mig1" >/dev/null
tables=$($CLI exec "$NET-pg" psql -U postgres -d argent -tAc "select count(*) from information_schema.tables where table_name = 'accounts'")
[ "$tables" = "1" ] && ok "created the schema" || bad "schema missing"

$CLI run -d --name "$NET-be" --network "$NET" "${HARDEN[@]}" -e DATABASE_URL=$DB \
  -e AUTHENTIK_ISSUER=https://auth.example.com/application/o/argent -e CORS_ORIGIN=https://argent.example.com \
  -e AUTHENTIK_ADMIN_GROUP=argent-admin -e AUTHENTIK_IMPORT_GROUP=argent-import "$BACKEND" >/dev/null
sleep 5
expect_in "answers the health check" "$(request "$NET-be" 3000 /health)" '"status":"ok"'
expect_in "refuses requests without a token" "$(request "$NET-be" 3000 /api/me)" "HTTP/1.1 401"
user=$($CLI exec "$NET-be" bash -c 'id -u')
[ "$user" = "65532" ] && ok "runs as user 65532" || bad "runs as user $user"

[ "$failed" = 0 ] && echo "images OK" || { echo "images FAILED"; exit 1; }
