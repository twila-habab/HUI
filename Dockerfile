# --- Build: compile TypeScript ------------------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

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
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# The message index lives here. Mount a volume to keep it across restarts;
# without one, the bot just rescans the receipts channels on startup.
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
