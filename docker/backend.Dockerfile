# Backend image: Bun running the TypeScript sources, on SUSE's minimal BCI (no shell tools, no package manager).
#
#   docker build -f docker/backend.Dockerfile -t argent-backend .
#
# Runs as an unprivileged user and needs no writable root filesystem (mount an emptyDir on /tmp).
# The same image runs the migrations: `bun run src/db/migrate.ts` (the chart does this in an init container).

ARG BUN_VERSION=1.3.13

# The Bun runtime binary comes from the official image, pinned to the version CI tests with.
FROM docker.io/oven/bun:${BUN_VERSION} AS bun

# ── install the production dependencies (workspace-aware) ──────────────────────────────────────────
FROM docker.io/oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
# the frontend is a workspace too; its manifest is needed to resolve the lockfile, its dependencies are not installed
COPY packages/frontend/package.json ./packages/frontend/
RUN bun install --frozen-lockfile --production --filter @argent/backend --filter @argent/shared

# ── runtime ─────────────────────────────────────────────────────────────────────────────────────────
FROM registry.suse.com/bci/bci-micro:15.7 AS runtime
LABEL org.opencontainers.image.title="argent-backend" \
      org.opencontainers.image.description="Argent personal finance API" \
      org.opencontainers.image.source="https://github.com/hierynomus/finance"

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
# a filtered install keeps the packages in a store (/app/node_modules/.bun) and links them from the workspace
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY package.json tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/backend/drizzle ./packages/backend/drizzle
COPY packages/backend/src ./packages/backend/src
COPY packages/backend/tsconfig.json ./packages/backend/tsconfig.json

WORKDIR /app/packages/backend
ENV NODE_ENV=production \
    PORT=3000 \
    # a read-only root filesystem: no transpiler cache on disk
    BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 \
    # nobody has a home directory here
    HOME=/tmp

# 65532 is the conventional "nonroot" id; Kubernetes' runAsNonRoot needs a numeric user
USER 65532:65532
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/bun"]
CMD ["run", "src/index.ts"]
