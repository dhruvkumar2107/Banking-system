# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Digital Pigmee Admin — production image (Next.js 14).
# Build context MUST be the monorepo root:
#
#   docker build -f apps/admin/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api \
#     -t pigmee-admin .
#
# NEXT_PUBLIC_API_BASE_URL is baked into the client bundle at BUILD time (it is a
# NEXT_PUBLIC_* var), so it must be supplied as a build-arg, not just at runtime.
# ─────────────────────────────────────────────────────────────────────────────

# ---- Stage 1: build ----
FROM node:20-alpine AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/admin/package.json ./apps/admin/package.json
RUN npm ci

COPY apps/admin ./apps/admin

# The public API URL the browser will call. Defaults to the local compose API.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN npm run build --workspace @pigmee/admin

# ---- Stage 2: runtime (prod deps only; `next start` serves the prebuilt app) ----
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/admin/package.json ./apps/admin/package.json
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /repo/apps/admin/.next ./apps/admin/.next
COPY --from=builder /repo/apps/admin/next.config.mjs ./apps/admin/next.config.mjs

# `next start` writes to .next/cache at runtime — hand the app dir to the
# non-root user so it can do so.
RUN chown -R node:node /repo/apps/admin

WORKDIR /repo/apps/admin
EXPOSE 3000
USER node

CMD ["npm", "run", "start"]
