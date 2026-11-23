#!/bin/bash
# Writes the runtime configuration of the SPA (served as /env-config.js) from the environment, then starts nginx.
# It writes to /tmp so the root file system can stay read-only. (bci-micro has bash but not sed.)
set -eu

# a value inside a JavaScript string: escape backslashes and double quotes, drop newlines
js() {
  local value=${1//$'\r'/}
  value=${value//$'\n'/}
  value=${value//\\/\\\\}
  printf '%s' "${value//\"/\\\"}"
}

cat > /tmp/env-config.js <<CONFIG
window.__ENV__ = {
  VITE_AUTHENTIK_AUTHORITY: "$(js "${VITE_AUTHENTIK_AUTHORITY:-}")",
  VITE_AUTHENTIK_CLIENT_ID: "$(js "${VITE_AUTHENTIK_CLIENT_ID:-}")"
};
CONFIG

echo "env-config.js written" >&2
# -e: nginx opens a compiled-in log path before it reads the configuration; point it at stderr
exec nginx -e /dev/stderr -g 'daemon off;'
