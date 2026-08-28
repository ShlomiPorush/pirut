FROM node:24.20.0-trixie-slim AS build
WORKDIR /app
ENV CI=true
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY config ./config
COPY src ./src
RUN pnpm run build

FROM node:24.20.0-trixie-slim AS deps
WORKDIR /app
ENV CI=true
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:24.20.0-trixie-slim AS runtime
ENV NODE_ENV=production \
    PIRUT_HOST=0.0.0.0 \
    PIRUT_PORT=4610 \
    PIRUT_STATIC_ROOT=/app/dist/web
WORKDIR /app

# Dedicated non-root runtime identity. The base image's node user is intentionally not reused.
RUN groupadd --system --gid 10001 pirut \
    && useradd --system --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin pirut

COPY --chown=root:root --from=deps /app/node_modules ./node_modules
COPY --chown=root:root --from=build /app/dist ./dist
COPY --chown=root:root --from=build /app/package.json ./package.json
COPY --chown=root:root db/migrations ./db/migrations

USER 10001:10001
EXPOSE 4610

# The application owns its readiness contract; the endpoint also verifies database connectivity.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PIRUT_PORT??'4610')+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/index.js"]
