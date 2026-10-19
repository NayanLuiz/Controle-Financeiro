# syntax=docker/dockerfile:1

# ==============================================================================
# Stage 1: Build client SPA (Vite) and server (TypeScript ESM)
# ==============================================================================
FROM node:24-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src

RUN npm run build && npm prune --omit=dev

# ==============================================================================
# Stage 2: Minimal production runtime (non-root, SQLite WAL persistent volume)
# ==============================================================================
FROM node:24-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/finance.db

# Create persistent SQLite directory with strict ownership for non-root user
RUN mkdir -p /data && chown -R node:node /data /app

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist

USER node

VOLUME ["/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server/server/index.js"]
