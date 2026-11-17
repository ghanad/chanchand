# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder

ARG GIT_COMMIT=""
ARG BUILD_TIME=""

ENV APP_COMMIT=$GIT_COMMIT \
    APP_BUILT_AT=$BUILD_TIME \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
# `.next/cache` is only useful for incremental builds; dropping it here keeps
# hundreds of MB of webpack/SWC cache out of the runtime image.
RUN npm run build \
    && rm -rf .next/cache

# Runtime dependencies only. `tsx` lives in `dependencies` (not devDependencies)
# because the CLI is meant to run inside the container:
#   docker compose run --rm app npm run cli -- user list
FROM node:22-alpine AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner

ARG GIT_COMMIT=""
ARG BUILD_TIME=""

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PRICE_GETTER_CONFIG=/data/config.yml \
    PRICE_GETTER_DB_URL=sqlite:////data/price_getter.db \
    PRICE_GETTER_PORT=8000 \
    PORT=8000 \
    APP_COMMIT=$GIT_COMMIT \
    APP_BUILT_AT=$BUILD_TIME

RUN mkdir -p /data

COPY package*.json ./

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/next.config.mjs ./
COPY --from=deps /app/node_modules ./node_modules

EXPOSE 8000

CMD ["npm", "start"]
