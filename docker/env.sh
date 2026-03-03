#!/bin/sh
# Runs as an nginx entrypoint hook to inject runtime env vars into the SPA
# without requiring a rebuild. Values are read from container environment.
set -e

cat > /usr/share/nginx/html/env-config.js <<EOF
window.__ENV__ = {
  VITE_AUTHENTIK_AUTHORITY: "${VITE_AUTHENTIK_AUTHORITY:-}",
  VITE_AUTHENTIK_CLIENT_ID: "${VITE_AUTHENTIK_CLIENT_ID:-}"
};
EOF

echo "env-config.js written"
