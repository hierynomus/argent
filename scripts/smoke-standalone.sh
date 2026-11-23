#!/usr/bin/env bash
# Starts the standalone executable on a throw-away config/data directory and checks that it serves the web
# app and the API without a login, keeps its data across a restart, and shuts down cleanly.
#   bun run --cwd packages/backend build:standalone && scripts/smoke-standalone.sh [path/to/argent]
set -euo pipefail

bin="${1:-packages/backend/dist/argent}"
tmp="$(mktemp -d)"
port=47990
export ARGENT_CONFIG_DIR="$tmp/config" ARGENT_DATA_DIR="$tmp/data"
pid=""
cleanup() { [ -n "$pid" ] && kill "$pid" 2>/dev/null || true; rm -rf "$tmp"; }
trap cleanup EXIT
fail() { echo "FAIL: $*" >&2; cat "$tmp/log" >&2 || true; exit 1; }

start() {
  "$bin" --no-open --port "$port" >"$tmp/log" 2>&1 &
  pid=$!
  for _ in $(seq 60); do curl -fs "localhost:$port/health" >/dev/null 2>&1 && return 0; sleep 0.5; done
  fail "did not start"
}
stop() {
  kill -TERM "$pid"
  for _ in $(seq 40); do kill -0 "$pid" 2>/dev/null || { pid=""; return 0; }; sleep 0.25; done
  fail "did not stop on SIGTERM"
}

start
curl -fs "localhost:$port/" | grep -q '<div id="app">' || fail "web app not served"
curl -fs "localhost:$port/some/client/route" | grep -q '<div id="app">' || fail "SPA fallback missing"
curl -fs "localhost:$port/env-config.js" | grep -q '"VITE_AUTH_MODE":"local"' || fail "runtime config missing"
curl -fs "localhost:$port/api/me" | grep -q '"isAdmin":true' || fail "API needs no login in local mode"
[ "$(curl -s -o /dev/null -w '%{http_code}' "localhost:$port/assets/missing.js")" = 404 ] || fail "missing asset should be 404"
[ -f "$tmp/config/config.json" ] || fail "config.json not created"
second="$("$bin" --no-open --port "$port")" || fail "second start should exit 0"
echo "$second" | grep -q "already running" || fail "second instance not refused"
curl -fs -X POST "localhost:$port/api/categories" -H 'content-type: application/json' -d '{"name":"Smoke","color":"#112233"}' >/dev/null || fail "create"
stop
[ ! -e "$tmp/data/argent.lock" ] || fail "lock left behind"

start
curl -fs "localhost:$port/api/categories" | grep -q '"Smoke"' || fail "data lost across restart"
stop
echo "standalone OK"
