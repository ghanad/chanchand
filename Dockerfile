# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PRICE_GETTER_CONFIG=/data/config.yml \
    PRICE_GETTER_DB_URL=sqlite:////data/price_getter.db \
    PRICE_GETTER_PORT=8000 \
    PORT=8000

RUN mkdir -p /data

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 8000

CMD ["npm", "start"]
