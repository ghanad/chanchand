# Deployment And Operations

This guide covers the Docker Compose deployment used for a small VPS. It runs three services:

- `app`: Price Getter UI/API on port `8000` inside the Compose network.
- `scheduler`: repeated `price-getter run --config /data/config.yml` jobs.
- `nginx`: public HTTP entrypoint with read-only public routes and Basic Auth for admin routes.

## VPS Prerequisites

Install these on the VPS:

- Docker Engine with the `docker compose` plugin.
- Git, if you deploy from a repository checkout.
- Enough disk for `data/price_getter.db` and backups.
- Firewall rules that expose only the public HTTP/HTTPS port you intend to serve.

Clone or copy the project onto the VPS, then run the rest of these commands from the repository root.

## Persistent Data Directory

Create the host-mounted data directory and SQLite file:

```bash
mkdir -p data
touch data/price_getter.db
```

The Compose file mounts `./data` at `/data`, so files in this directory survive image rebuilds and container replacement.

## Config File

Place the production YAML config at `data/config.yml`:

```bash
cp config/example.yml data/config.yml
```

Edit `data/config.yml` for real sources, products, targets, and adapter settings. Validate it before starting long-running services:

```bash
docker compose run --rm app price-getter validate-config --config /data/config.yml
```

## Environment File

Create `.env` in the repository root for Compose-level settings and secrets:

```bash
cat > .env <<'EOF'
brsapi_api=your_brsapi_key
PRICE_GETTER_RUN_INTERVAL_SECONDS=3600
PRICE_GETTER_PUBLIC_PORT=80
EOF
```

`brsapi_api` is read by the BRSAPI adapter. `PRICE_GETTER_RUN_INTERVAL_SECONDS` controls the scheduler interval. `PRICE_GETTER_PUBLIC_PORT` controls the host port published by Nginx.

## Basic Auth Credentials

Create the htpasswd file that Nginx uses for `/admin` and `/admin/*`:

```bash
docker run --rm httpd:2.4-alpine htpasswd -nbB admin 'change-this-password' > data/.htpasswd-price-getter
```

Replace `admin` and `change-this-password` with production credentials. This file is mounted read-only into the Nginx container.

## Build And Start Services

Build images:

```bash
docker compose build
```

Start in the foreground for first boot:

```bash
docker compose up
```

Start in the background after smoke testing:

```bash
docker compose up -d
```

Check service state:

```bash
docker compose ps
```

## UI Route Model

Nginx exposes these routes:

- `GET /`: public dashboard.
- `GET /assets/*`: public built frontend assets.
- `GET` and `HEAD /api/*`: public read-only JSON APIs, including `/api/latest`, `/api/products`, `/api/history`, `/api/runs`, and `/api/errors`.
- `/admin` and `/admin/*`: Basic Auth protected admin UI and mutating endpoints, including `/admin/run-now` and `/admin/config/products...`.

Smoke-test the boundary before adding TLS:

```bash
curl -i http://localhost:${PRICE_GETTER_PUBLIC_PORT:-80}/
curl -i http://localhost:${PRICE_GETTER_PUBLIC_PORT:-80}/api/latest
curl -i http://localhost:${PRICE_GETTER_PUBLIC_PORT:-80}/admin
curl -i -X POST http://localhost:${PRICE_GETTER_PUBLIC_PORT:-80}/admin/run-now
curl -i -u admin:change-this-password http://localhost:${PRICE_GETTER_PUBLIC_PORT:-80}/admin
```

For TLS, either add HTTPS to the Nginx server with the same location rules or terminate TLS at an external proxy/load balancer and forward HTTP to this Compose Nginx service.

## Logs

Follow all service logs:

```bash
docker compose logs -f
```

Follow one service:

```bash
docker compose logs -f app
docker compose logs -f scheduler
docker compose logs -f nginx
```

The scheduler log shows each collection loop timestamp and the `price-getter run` result.

## Database Initialization And Migrations

Most runtime paths call `init_database`, so a fresh SQLite database is usually initialized automatically. To create tables explicitly:

```bash
docker compose run --rm app price-getter init-db --db-url sqlite:////data/price_getter.db
```

If a future release ships schema migrations, run them from a full repository checkout where `alembic.ini` and `migrations/` are present:

```bash
PRICE_GETTER_DB_URL=sqlite:///data/price_getter.db .venv/bin/alembic upgrade head
```

For the current Docker image, use the `price-getter init-db` command above for production initialization.

## Manual One-Off Collection

Run a collection against the same config and SQLite file used by the services:

```bash
docker compose run --rm app price-getter run --config /data/config.yml
```

Inspect latest results:

```bash
docker compose run --rm app price-getter latest --db-url sqlite:////data/price_getter.db
docker compose run --rm app price-getter errors --db-url sqlite:////data/price_getter.db
```

## Backup

Stop services before a simple file-level backup, or use SQLite's online backup command while services are running.

Offline backup:

```bash
docker compose stop app scheduler
mkdir -p backups
cp data/config.yml backups/config.yml.$(date +%Y%m%d%H%M%S)
cp data/price_getter.db backups/price_getter.db.$(date +%Y%m%d%H%M%S)
docker compose start app scheduler
```

Online SQLite backup:

```bash
mkdir -p backups
docker compose exec app python -c "import sqlite3; src=sqlite3.connect('/data/price_getter.db'); dst=sqlite3.connect('/data/price_getter.backup.db'); src.backup(dst); dst.close(); src.close()"
cp data/price_getter.backup.db backups/price_getter.db.$(date +%Y%m%d%H%M%S)
cp data/config.yml backups/config.yml.$(date +%Y%m%d%H%M%S)
```

Also back up `.env` and `data/.htpasswd-price-getter` in your server secret backup system. Do not commit production copies of these files.

## Restore

Stop services, replace the persistent files, then start services again:

```bash
docker compose stop app scheduler nginx
cp backups/config.yml.YYYYMMDDHHMMSS data/config.yml
cp backups/price_getter.db.YYYYMMDDHHMMSS data/price_getter.db
docker compose up -d
```

Validate after restore:

```bash
docker compose run --rm app price-getter validate-config --config /data/config.yml
docker compose run --rm app price-getter latest --db-url sqlite:////data/price_getter.db
```
