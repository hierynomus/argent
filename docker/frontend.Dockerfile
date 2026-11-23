# Frontend image: the built SPA served by nginx, on SUSE's minimal BCI.
#
#   docker build -f docker/frontend.Dockerfile -t argent-frontend .
#
# Runs as an unprivileged user on port 8080 with a read-only root filesystem (mount an emptyDir on /tmp).
# The OIDC settings are not baked in: at start `docker/frontend-entrypoint.sh` writes /env-config.js from
# VITE_AUTHENTIK_AUTHORITY and VITE_AUTHENTIK_CLIENT_ID, so one image serves every environment.

ARG BUN_VERSION=1.3.13

# ── build the SPA ───────────────────────────────────────────────────────────────────────────────────
FROM docker.io/oven/bun:${BUN_VERSION} AS builder
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/desktop/package.json ./packages/desktop/
RUN bun install --frozen-lockfile --filter @argent/frontend
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
WORKDIR /app/packages/frontend
RUN bun run build

# ── nginx on bci-micro ──────────────────────────────────────────────────────────────────────────────
# bci-micro has no package manager. The documented way to add software is to install it into a copy of the
# micro root file system from a bci-base stage, then ship only that copy.
FROM registry.suse.com/bci/bci-micro:15.7 AS micro

FROM registry.suse.com/bci/bci-base:15.7 AS nginx
COPY --from=micro / /target
RUN zypper --non-interactive --installroot /target --gpg-auto-import-keys install --no-recommends nginx \
 && zypper --non-interactive --installroot /target clean --all \
 # the package ships a default site and logs we do not use; nginx logs to stdout/stderr here
 && rm -rf /target/etc/nginx/conf.d/* /target/var/log/* /target/usr/share/nginx/html/* /target/usr/share/doc /target/usr/share/man

FROM micro AS runtime
LABEL org.opencontainers.image.title="argent-frontend" \
      org.opencontainers.image.description="Argent personal finance web app" \
      org.opencontainers.image.source="https://github.com/hierynomus/finance"

COPY --from=nginx /target /
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/frontend-entrypoint.sh /usr/local/bin/frontend-entrypoint.sh
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html

# 65532: conventional "nonroot" id (Kubernetes' runAsNonRoot needs a numeric user)
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/frontend-entrypoint.sh"]
