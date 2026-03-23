# Hostinger VPS Deployment Guide
### CP Panel (ParticleProductions) · Docker + Git + SSH

> Last verified: March 2026 (v0.1.0)

---

## Project & Server Reference

| Key | Value |
|-----|-------|
| Server IP | `76.13.2.74` |
| SSH user | `root` |
| Domain (pending) | `particlepdio.particleformen.com` |
| Project directory | `/var/www/particleproductionsio` |
| Git remote | `https://github.com/denisbparticle/particle-productions-io.git` |
| Production compose file | `docker-compose.prod.yml` |
| nginx container port | `127.0.0.1:8080:80` |
| Database name | `cpanel` |

SSH: `ssh root@76.13.2.74`

---

## VPS Directory Structure (multi-project layout)

```
/var/www/
├── particleproductionsio/    ← this project
├── <next-project>/           ← future projects go here
└── <another-project>/
```

All projects live under `/var/www/`. Each project binds its Docker containers to a unique `127.0.0.1:<port>` and has its own nginx site config in `/etc/nginx/sites-available/`.

---

## Safety Rules

- **Never run `docker compose down -v`** — deletes the database volume.
- All Docker ports must stay bound to `127.0.0.1` to avoid conflicts with other server projects.
- Always back up the database before deploying if data exists.
- `.env` is not in git — never overwrite it.

---

## Backup

```bash
mkdir -p /root/backups
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U cpanel cpanel \
  > /root/backups/particleproductionsio_$(date +%Y%m%d_%H%M%S).sql
```

**Restore:**
```bash
docker compose -f docker-compose.prod.yml stop app api
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U cpanel cpanel < /root/backups/particleproductionsio_YYYYMMDD_HHMMSS.sql
docker compose -f docker-compose.prod.yml start app api
```

---

## First-Time Deploy

### 1. Check for conflicts

```bash
ss -tlnp | grep -E ':(80|443|8080) '
ls /etc/nginx/sites-enabled/
docker ps -a
```

### 2. Install dependencies

```bash
apt-get update && apt-get upgrade -y
apt-get install -y git docker.io docker-compose-plugin nginx certbot python3-certbot-nginx curl
```

### 3. Clone the repo

```bash
mkdir -p /var/www/particleproductionsio
cd /var/www/particleproductionsio
git clone https://github.com/denisbparticle/particle-productions-io.git .
```

### 4. Create .env

```bash
nano /var/www/particleproductionsio/.env
```

Paste and fill in:

```env
DB_USER=cpanel
DB_PASSWORD=<strong password — e.g. openssl rand -base64 24>
DB_NAME=cpanel

JWT_SECRET=<64+ char secret — generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_EXPIRES_IN=7d

PORT=3001
```

### 5. Set up host nginx

```bash
cp /var/www/particleproductionsio/deploy/nginx.conf /etc/nginx/sites-available/particleproductionsio
ln -sf /etc/nginx/sites-available/particleproductionsio /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 6. Build and start

```bash
cd /var/www/particleproductionsio
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f --tail=50
```

### 7. Restore database (if you have a backup)

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U cpanel cpanel < /root/backups/<your-backup>.sql
```

If starting fresh with no backup, the schema from `db/init.sql` is applied automatically on first startup.

### 8. Verify

```bash
docker compose -f docker-compose.prod.yml ps
curl http://76.13.2.74/api/health
# Expected: {"status":"ok"}
```

Open `http://76.13.2.74` in your browser.
Default login: `admin@demo.com` / `demo1234`

---

## Connect Domain + SSL (when subdomain is ready)

Once the DNS A record for `particlepdio.particleformen.com` points to `76.13.2.74`:

```bash
# Update nginx site config
nano /etc/nginx/sites-available/particleproductionsio
# Change: server_name 76.13.2.74;
# To:     server_name particlepdio.particleformen.com;
nginx -t && systemctl reload nginx

# Issue SSL certificate
certbot --nginx -d particlepdio.particleformen.com \
  --non-interactive --agree-tos --email admin@particleformen.com --redirect
systemctl reload nginx
```

---

## Routine Deploy

```bash
ssh root@76.13.2.74
cd /var/www/particleproductionsio

# 1. Backup
mkdir -p /root/backups
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U cpanel cpanel \
  > /root/backups/particleproductionsio_$(date +%Y%m%d_%H%M%S).sql

# 2. Pull latest code (includes pre-built dist/)
git pull origin main

# 3. Rebuild and restart
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# 4. Verify
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=20
```

---

## Frontend-Only Deploy (no backend changes)

When only `dist/` changed (frontend was rebuilt and committed):

```bash
cd /var/www/particleproductionsio
git pull origin main
docker compose -f docker-compose.prod.yml restart app
```

No rebuild needed — nginx picks up the updated `./dist` folder immediately.

---

## Rollback

### Code only

```bash
git log --oneline -10
git checkout <hash>
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

### Full (code + DB restore)

```bash
docker compose -f docker-compose.prod.yml stop app api
docker compose -f docker-compose.prod.yml exec -T db psql -U cpanel -c "DROP DATABASE cpanel;"
docker compose -f docker-compose.prod.yml exec -T db psql -U cpanel -c "CREATE DATABASE cpanel;"
docker compose -f docker-compose.prod.yml exec -T db psql -U cpanel cpanel \
  < /root/backups/<file>.sql
git checkout <hash>
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

---

## Service Management

```bash
cd /var/www/particleproductionsio

docker compose -f docker-compose.prod.yml ps                   # status
docker compose -f docker-compose.prod.yml logs -f api          # api logs
docker compose -f docker-compose.prod.yml logs -f app          # nginx logs
docker compose -f docker-compose.prod.yml restart api          # restart api
docker compose -f docker-compose.prod.yml restart app          # restart nginx
docker compose -f docker-compose.prod.yml down                 # stop all (safe)
docker compose -f docker-compose.prod.yml up -d                # start all
docker compose -f docker-compose.prod.yml exec db psql -U cpanel cpanel  # DB shell

nginx -t && systemctl reload nginx                             # reload host nginx
certbot renew --dry-run                                        # test SSL renewal
certbot certificates                                           # list SSL certs
```

---

## Troubleshooting

| Symptom | Check | Fix |
|---------|-------|-----|
| 502 Bad Gateway | `docker compose ps` | Container is down — `restart api` or `restart app` |
| Can't reach port 80 | `ss -tlnp \| grep 80` | nginx not running — `systemctl start nginx` |
| API crash loop | `logs api --tail=100` | Missing `.env` var — check JWT_SECRET and DB_PASSWORD |
| Old frontend after deploy | — | `docker compose restart app` |
| nginx syntax error | `nginx -t` | Check error — usually missing semicolon |
| Port 8080 conflict | `ss -tlnp \| grep 8080` | Another project on 8080 — change to 8081 in `docker-compose.prod.yml` and `deploy/nginx.conf` |
