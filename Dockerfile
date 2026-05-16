# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS frontend

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PRICE_GETTER_CONFIG=/data/config.yml \
    PRICE_GETTER_DB_URL=sqlite:////data/price_getter.db \
    PRICE_GETTER_HOST=0.0.0.0 \
    PRICE_GETTER_PORT=8000

WORKDIR /app

RUN addgroup --system pricegetter \
    && adduser --system --ingroup pricegetter --home /home/pricegetter pricegetter \
    && mkdir -p /data \
    && chown -R pricegetter:pricegetter /data /home/pricegetter

COPY pyproject.toml README.md ./
COPY src ./src
COPY --from=frontend /app/src/price_getter/ui_dist ./src/price_getter/ui_dist

RUN pip install --no-cache-dir .

USER pricegetter

EXPOSE 8000

CMD ["price-getter", "ui", "--no-browser"]
