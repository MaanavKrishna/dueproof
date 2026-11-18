# syntax=docker/dockerfile:1.7
#
# The Dueproof app (Next.js standalone) for the self-hosted server.
# Build from the repository root:
#
#   docker build -f apps/app/Dockerfile -t dueproof-app .
#
# Usually built by infra/docker/compose.yaml. The image:
#   * runs as the unprivileged `node` user (uid 1000) and writes only to
#     /tmp, /app/apps/app/.next/cache and the storage volume, so it runs
#     with a read-only root filesystem;
#   * carries the Workflow DevKit Postgres World in /opt/workflow-world
#     (found through NODE_PATH, since the World is loaded by name at run
#     time) and bootstraps its schema on start;
#   * sends no telemetry (NEXT_TELEMETRY_DISABLED).

ARG NODE_IMAGE=node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54

# ---------------------------------------------------------------- base
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    npm_config_store_dir=/pnpm/store \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=1
RUN npm install --global --no-fund --no-audit --loglevel=error pnpm@10.28.0
WORKDIR /repo

# ---------------------------------------------------------------- deps
FROM base AS deps
# The lockfile alone decides what is downloaded, so this layer is cached
# until dependencies change.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=dueproof-pnpm,target=/pnpm/store \
    pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=dueproof-pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "@dueproof/app..."

# ---------------------------------------------------------------- build
FROM deps AS build
RUN pnpm --filter @dueproof/app build

# ---------------------------------------------------------------- workflow world
# The Postgres World is resolved by name at run time (WORKFLOW_TARGET_WORLD),
# so the standalone trace doesn't include it: install it on its own, from its
# committed lockfile (every package pinned with its integrity hash), with no
# install scripts.
FROM base AS workflow-world
WORKDIR /opt/workflow-world
COPY apps/app/docker/workflow-world/package.json apps/app/docker/workflow-world/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-fund --no-audit --loglevel=error
COPY apps/app/docker/bootstrap-workflow.mjs ./bootstrap.mjs

# ---------------------------------------------------------------- runtime
FROM ${NODE_IMAGE} AS runtime
ARG DUEPROOF_VERSION=0.1.0
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NODE_PATH=/opt/workflow-world/node_modules \
    DUEPROOF_VERSION=${DUEPROOF_VERSION} \
    STORAGE_LOCAL_DIR=/data/files
WORKDIR /app
COPY --from=workflow-world /opt/workflow-world /opt/workflow-world
COPY --from=build /repo/apps/app/.next/standalone ./
COPY --from=build /repo/apps/app/.next/static ./apps/app/.next/static
COPY --chmod=0755 apps/app/docker/entrypoint.sh /usr/local/bin/dueproof-entrypoint
# Writable places, owned by the runtime user; everything else stays root-owned.
RUN mkdir -p /data/files /app/apps/app/.next/cache \
 && chown -R node:node /data /app/apps/app/.next/cache
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"]
ENTRYPOINT ["/usr/local/bin/dueproof-entrypoint"]
CMD ["node", "apps/app/server.js"]
