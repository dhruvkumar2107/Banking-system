# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Digital Pigmee API — production image (NestJS + Drizzle).
# Build context MUST be the monorepo root (npm workspaces hoist to /repo):
#
#   docker build -f apps/api/Dockerfile -t pigmee-api .
#
# Migrations apply automatically on boot, so no separate migrate step is needed.
# ─────────────────────────────────────────────────────────────────────────────

# ---- Stage 1: build (needs dev deps: @nestjs/cli, typescript) ----
FROM node:20-alpine AS builder
WORKDIR /repo

# Install workspace deps against the lockfile. Copy only the manifests first so
# this layer is cached until a package.json / lockfile actually changes.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/admin/package.json ./apps/admin/package.json
RUN npm ci

# Compile the API to apps/api/dist.
COPY apps/api ./apps/api
RUN npm run build --workspace @pigmee/api

# ---- Stage 2: runtime (prod deps only) ----
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /repo

# Reinstall with dev deps omitted for a lean, deterministic runtime tree.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/admin/package.json ./apps/admin/package.json
RUN npm ci --omit=dev && npm cache clean --force

# Compiled output only.
COPY --from=builder /repo/apps/api/dist ./apps/api/dist

# Pre-create the KYC upload root. Docker seeds a named volume's ownership from
# the image path it covers, so this directory must exist and belong to `node`
# before the volume is mounted — otherwise it lands root-owned and the non-root
# process cannot write customer photos.
RUN mkdir -p /repo/apps/api/storage/uploads

# Hand the app dir to the non-root user (so a PGlite fallback can create .data/).
RUN chown -R node:node /repo/apps/api

WORKDIR /repo/apps/api
EXPOSE 4000

# Run as the built-in non-root user shipped with the node image.
USER node

CMD ["node", "dist/main.js"]
