# syntax=docker/dockerfile:1

# Both build stages run on the builder's own platform. CI builds an arm64 image
# under QEMU emulation, which is several times slower than native, so only the
# final stage (which runs no npm or tsc) is emulated.

# --- Build: compile TypeScript ------------------------------------------------
# The compiled JS is the same on every platform, so compile it once, natively.
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Production dependencies for the target platform --------------------------
# npm picks each native package (e.g. @napi-rs/canvas) by --os/--cpu/--libc, so
# it can install the arm64 binaries without running on arm64. No production
# dependency has an install script, so nothing here needs to execute on the
# target.
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS deps
ARG TARGETARCH
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    case "$TARGETARCH" in amd64) cpu=x64 ;; *) cpu="$TARGETARCH" ;; esac \
  && npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
       --os=linux --cpu="$cpu" --libc=glibc

# --- Runtime: production dependencies and compiled JS only --------------------
FROM node:24-bookworm-slim
# tini forwards SIGTERM to node, so the bot saves its message index and exits
# promptly when the container is stopped.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    DATA_DIR=/data
WORKDIR /app

# The message index lives here. Mount a volume to keep it across restarts;
# without one, the bot just rescans the receipts channels on startup.
RUN mkdir /data && chown node:node /data
VOLUME /data

COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
