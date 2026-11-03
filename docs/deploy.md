# Deployment And Operations (VPS Guide)

This guide covers deploying Price Getter on a public VPS (Ubuntu/Debian) using Docker Compose with user management and role-based access control.

It runs the web application and API container (`app`) using the prebuilt image `ghanad/chanchand:latest` on port `8000` (Node.js 22 runtime). Periodic price collection is triggered via OS cron using the `/api/trigger-run` endpoint.

---

## 1. VPS Prerequisites

On your VPS (e.g. Ubuntu 22.04 or 24.04 LTS):

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker Engine and Git
sudo apt install -y git curl ca-certificates
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Log out and back in, or run `newgrp docker` to apply docker group permissions.

### Firewall Configuration (UFW)

Ensure SSH, HTTP, and HTTPS ports are open:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 2. Clone Repository & Setup Directories

Clone your repository to `/opt/price_getter` (or home directory):

```bash
git clone <your-repo-url> /opt/price_getter
cd /opt/price_getter

# Create persistent storage directory
mkdir -p data
touch data/price_getter.db
```

The `./data` directory is mounted to `/data` in containers, so SQLite records, config, and state persist across container updates.

---

## 3. Configuration & Environment Variables

### A. Price Collection Config

Copy the example configuration to `data/config.yml`:

```bash
cp config/example.yml data/config.yml
```

Edit `data/config.yml` with your desired target URLs, sources, and alert thresholds.

### B. Secrets & Environment File (`.env`)

Create `.env` in the repository root (or copy from `.env.example`):

```bash
cat > .env <<'EOF'
# Public web port (80 for standard HTTP, or custom port behind reverse proxy)
PRICE_GETTER_PUBLIC_PORT=80

# Security & Authentication (IMPORTANT: Use strong random values on a public VPS!)
JWT_SECRET=change_this_to_a_random_32_character_secret_string_now
ADMIN_USERNAME=admin
ADMIN_INITIAL_PASSWORD=YourStrongPasswordHere!

# OS Cron / Scheduler Secret Key
TRIGGER_API_KEY=your_secure_random_trigger_key_here

# API keys for market sources
brsapi_api=your_brsapi_key_here
SERVIX_API_KEY=your_servix_key_here
EOF
```

> [!IMPORTANT]
> Change `JWT_SECRET` and `ADMIN_INITIAL_PASSWORD` before starting services on a public IP.

---

## 4. Pull Image and Start Services

Pull the latest Docker image:

```bash
docker compose pull
```

Start services in detached background mode:

```bash
docker compose up -d
```

Verify service status:

```bash
docker compose ps
docker compose logs -f app
```

---

## 5. User Management via CLI (On Server)

In addition to the web UI at `/admin/users`, you can manage users directly on the VPS command line:

### List registered users:
```bash
docker compose run --rm app npm run cli -- user list
```

### Create a new user:
```bash
# Create an admin user:
docker compose run --rm app npm run cli -- user create -u manager -p StrongPass123! -r admin

# Create a viewer (read-only) user:
docker compose run --rm app npm run cli -- user create -u viewer1 -p ViewerPass123! -r viewer
```

### Reset a forgotten password:
```bash
docker compose run --rm app npm run cli -- user reset-password -u admin -p NewSecretPass123!
```

### Delete a user:
```bash
docker compose run --rm app npm run cli -- user delete -u old_user
```

---

## 6. Securing with SSL (Let's Encrypt / HTTPS)

When hosting on a public VPS, HTTPS is essential to protect login credentials and session tokens over the public internet.

### Option A: Using Certbot & Nginx on Host

If your VPS has a public domain (e.g., `prices.example.com` pointing to your server's IP):

1. Install Certbot on the host:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d prices.example.com
   ```
2. Configure host Nginx to proxy traffic to `http://127.0.0.1:8000`.

### Option B: Cloudflare Proxied DNS (Recommended & Easiest)

1. Add your domain to Cloudflare.
2. Create an `A` record pointing to your VPS IP with the orange cloud (Proxy enabled).
3. Set SSL/TLS encryption mode to **Full** in Cloudflare Dashboard.
4. Cloudflare automatically handles SSL termination, DDoS protection, and Iranian network caching.

---

## 7. Backups and Maintenance

### Backup Database & Config
```bash
mkdir -p backups
docker compose exec app sqlite3 /data/price_getter.db ".backup '/data/backup.db'"
cp data/backup.db backups/price_getter_$(date +%Y%m%d%H%M%S).db
cp data/config.yml backups/config_$(date +%Y%m%d%H%M%S).yml
```

### Update Project to Latest Version
```bash
git pull origin main
docker compose build
docker compose up -d
```

---

## 8. Automated Price Collection & OS Scheduling (Crontab / API Trigger)

Price Getter provides a dedicated, synchronous API endpoint (`/api/trigger-run`) designed specifically for operating system task schedulers (Linux `crontab`, macOS `launchd`, Windows Task Scheduler, or external webhooks like cron-job.org).

The endpoint waits for all active targets to complete and returns a full JSON summary with execution time and results.

### 8.1 Configure the Trigger API Key

In your `.env` file, configure `TRIGGER_API_KEY`:

```bash
# Security key for automated external triggers / OS cron
TRIGGER_API_KEY=your_secure_random_trigger_key_here
```

### 8.2 Calling the API with curl

You can trigger the price collection using `curl` with a Bearer token or `x-api-key` header:

```bash
# Trigger staggered collection (runs hourly batch of non-market items + all market items):
curl -s -X POST http://localhost:8000/api/trigger-run \
  -H "Authorization: Bearer your_secure_random_trigger_key_here"

# Alternative using custom batch limit:
curl -s -X POST "http://localhost:8000/api/trigger-run?limit=25" \
  -H "Authorization: Bearer your_secure_random_trigger_key_here"

# Alternative using x-api-key header:
curl -s -X POST http://localhost:8000/api/trigger-run \
  -H "x-api-key: your_secure_random_trigger_key_here"

# Trigger collection for a specific product key:
curl -s -X POST http://localhost:8000/api/trigger-run \
  -H "Authorization: Bearer your_secure_random_trigger_key_here" \
  -H "Content-Type: application/json" \
  -d '{"product_key": "gold-18k"}'
```

#### Successful JSON Response:
```json
{
  "ok": true,
  "run_id": 42,
  "status": "success",
  "trigger_source": "cron",
  "target_count": 43,
  "success_count": 43,
  "error_count": 0,
  "batch_size": 42,
  "total_eligible_today": 958,
  "remaining_today": 916,
  "total_managed_targets": 1001,
  "duration_ms": 3450,
  "started_at": "2026-10-31T21:55:00.000Z",
  "finished_at": "2026-10-31T21:55:03.450Z",
  "force": false
}
```

If another collection is already in progress, the API safely returns HTTP `409 Conflict`:
```json
{
  "error": "فرآیند دیگری در حال حاضر در حال اجراست.",
  "status": "running",
  "active_run_id": 41,
  "active_target_count": 8
}
```

### 8.3 Setting up Linux / macOS Crontab

Open the crontab editor on your server:

```bash
crontab -e
```

Add your desired schedule:

```cron
# Hourly cron (Recommended):
# Automatically collects public products every hour between 08:00 and 23:00,
# while checking market currencies (gold/USD) and staggering private products across the 24 hours of the day:
0 * * * * curl -s -X POST http://localhost:8000/api/trigger-run -H "Authorization: Bearer your_secure_random_trigger_key_here" >> /var/log/price-getter-cron.log 2>&1
```

### 8.4 Alternative: Direct CLI Cron

If your crontab runs on the same machine where Price Getter is installed and you prefer running directly without HTTP:

```cron
# Run directly via npm CLI:
0 * * * * cd /opt/price_getter && npm run run >> /var/log/price-getter.log 2>&1
```

---

## 9. CI/CD: Automated Docker Hub Publishing on Git Tag

A GitHub Actions workflow (`.github/workflows/ci.yml`) is configured to automatically test, build, and publish the Docker image to Docker Hub whenever a new tag is pushed.

### 9.1 Required GitHub Repository Secrets

In your GitHub repository, navigate to **Settings** > **Secrets and variables** > **Actions** and add the following repository secrets:

- `DOCKERHUB_USERNAME`: Your Docker Hub account username.
- `DOCKERHUB_TOKEN`: Your Docker Hub Personal Access Token (or password).
- `DOCKERHUB_REPO` *(optional)*: Custom repository name on Docker Hub (defaults to `<DOCKERHUB_USERNAME>/chanchand`).

### 9.2 Triggering a Release

To release a new Docker image, create and push a git tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow will:
1. Run automated tests, type checking, and linting.
2. Build the Next.js application.
3. Authenticate with Docker Hub using your credentials.
4. Automatically tag the image with the version (e.g. `1.0.0`, `1.0`, `v1.0.0`) and `latest`.
5. Push the image to Docker Hub with GitHub Actions layer caching enabled.

