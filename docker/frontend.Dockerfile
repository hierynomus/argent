FROM oven/bun:1.2-alpine AS builder
WORKDIR /app

COPY package.json bun.lockb* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/
RUN bun install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
COPY tsconfig.json ./

WORKDIR /app/packages/frontend
# Build args become VITE_ env vars at build time (baked into JS bundle).
# For runtime config we use window.__ENV__ instead — see env.sh below.
RUN bun run build

# Serve with nginx
FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/env.sh /docker-entrypoint.d/40-env.sh
RUN chmod +x /docker-entrypoint.d/40-env.sh

EXPOSE 80
