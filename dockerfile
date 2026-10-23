# syntax=docker/dockerfile:1
#
# Single image for the whole pnpm monorepo. docker-compose runs it twice:
# once as the Socket.io server, once as the Next.js web app (same build, two
# commands). The game server runs TypeScript directly via tsx and the shared
# package is consumed as raw TS, so there is no separate build step for them —
# only `next build` produces an artifact.

FROM node:24-alpine AS base
# SWC (Next.js) needs the glibc-compat shim on alpine/musl.
RUN apk add --no-cache libc6-compat
# pnpm via corepack — pnpm 11 matches the CI (lockfileVersion 9.0).
RUN corepack enable && corepack prepare pnpm@11 --activate
WORKDIR /app

# ---- deps: install the full workspace (cached on manifests) ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# ---- build: copy sources and build the web app's .next ----
FROM deps AS build
COPY . .
# NEXT_PUBLIC_* vars are inlined at build time, so the server URL must be known
# here. With Caddy proxying /socket.io on the same domain, this is the public URL.
ARG NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
RUN pnpm --filter @gamble/web build

# ---- runtime: the built workspace; compose picks web or server at run time ----
FROM build AS runtime
ENV NODE_ENV=production
EXPOSE 3000 3001
# Default command runs the server; compose overrides it for the web service.
CMD ["pnpm", "--filter", "@gamble/server", "start"]