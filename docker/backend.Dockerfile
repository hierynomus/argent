FROM oven/bun:1.2-alpine AS base
WORKDIR /app

# Install dependencies (workspace-aware)
FROM base AS deps
COPY package.json bun.lockb* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
RUN bun install --frozen-lockfile --production

# Build/prepare (bun runs TS directly, no compile step needed)
FROM base AS runner
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
COPY package.json ./

# Run migrations then start the server
WORKDIR /app/packages/backend

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
