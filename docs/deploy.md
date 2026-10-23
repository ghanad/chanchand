# Deployment And Operations (VPS Guide)

This guide covers deploying Price Getter on a public VPS (Ubuntu/Debian) using Docker Compose with user management and role-based access control.

It runs two isolated container services:
- `app`: Next.js web application and API on port `8000` (Node.js 22 runtime).
- `scheduler`: background worker that runs price collection periodically.

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

Create `.env` in the repository root:

```bash
cat > .env <<'EOF'
# API keys
brsapi_api=your_brsapi_key_here

# Scheduler interval in seconds (default: 3600 = 1 hour)
PRICE_GETTER_RUN_INTERVAL_SECONDS=3600

# Public web port (80 for standard HTTP, or custom port behind reverse proxy)
PRICE_GETTER_PUBLIC_PORT=80

# Security & Authentication (IMPORTANT: Use strong random values on a public VPS!)
JWT_SECRET=change_this_to_a_random_32_character_secret_string_now
ADMIN_USERNAME=admin
ADMIN_INITIAL_PASSWORD=YourStrongPasswordHere!
EOF
```

> [!IMPORTANT]
> Change `JWT_SECRET` and `ADMIN_INITIAL_PASSWORD` before starting services on a public IP.

---

## 4. Build and Start Services

Build container images:

```bash
docker compose build
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
