What Is CP Panel
CP Panel is an internal production management system for creative teams. It's a private web app — no public access, login required.

What it manages:

Productions — the main board. Every shoot/project lives here with status, dates, budget, stage, and type. Full table with filters, column config, drag reorder, and import from Excel.
Budget & Accounting — per-production line items (crew, equipment, catering, etc.), payment tracking, receipts, invoices, CC payments
Financial dashboard — yearly budget vs. actual spending charts across all productions, currency toggle (USD/ILS)
Weekly Reports — weekly production updates with curated comments, links, and approval workflow
Gantt / Timeline — production phase timelines
Call Sheets — crew and talent on-set sheets per production
Casting & Rights — cast management with contract types, expiry tracking, and risk alerts
Links & Contracts — per-production document links and contract lifecycle tracking
Suppliers — company-wide supplier/vendor directory with contact details
History — full audit trail of all changes across the system
Users & Roles — Admin / Editor / Viewer / Accounting roles with brand-level access control
Settings — editable dropdowns (stages, product types, crew roles, etc.), brand config, improvement tickets
Two brands: Particle and Blurr — each has its own theme, data, and user access. A brand switcher is visible on the login page and in the sidebar.

User roles:

Role Can do
Admin Everything — create/edit/delete + user management + settings
Editor Create and edit productions, budgets, content
Viewer Read-only across the app
Accounting Financial and accounting pages only
Tech Stack
Layer Tech
Frontend React 18 + Vite + Tailwind CSS
Backend Node.js + Express
Database PostgreSQL 16
Auth JWT (7-day tokens, bcrypt passwords)
Infrastructure Docker Compose (3 services: nginx + api + db)
The app runs as three Docker containers behind nginx:

nginx serves the built React SPA and proxies /api/\* → Node.js
api is the Express REST backend (port 3001, internal only)
db is PostgreSQL with persistent volume
Project Structure
cp-panel/
├── src/ ← React frontend source
│ ├── pages/ ← One file per page/route
│ ├── components/ ← Shared UI components
│ ├── context/ ← React contexts (Auth, Brand, Currency, Dark mode…)
│ └── lib/ ← Data service, API client, utilities
├── backend/
│ └── src/
│ ├── routes/ ← One file per API resource
│ ├── middleware/ ← JWT auth middleware
│ ├── app.js ← Express app setup
│ └── server.js ← Entry point
├── db/
│ └── init.sql ← Full schema + seed data (runs on first start)
├── dist/ ← Built frontend (already built, ready to serve)
├── nginx.conf ← Nginx config (SPA fallback + /api proxy)
├── docker-compose.yml ← Main orchestration
├── docker-compose.override.yml ← Mounts ./dist into nginx
└── .env.example ← Environment variable template

Important — how dev vs production mode works:
The frontend uses import.meta.env.DEV to switch data layers:

npm run dev (Vite dev server) → uses localStorage as the data layer, no backend needed. 23 mock productions are seeded automatically. Great for UI work.
npm run build → production build, switches to real API calls (/api/...). This is what runs via Docker.
First-Time Setup
Prerequisites
Docker Desktop installed (includes Compose): https://docs.docker.com/get-docker/
Node.js 20+ (only needed if editing frontend code): https://nodejs.org

1. Unzip the project
   unzip cp-panel-full.zip -d cp-panel
   cd cp-panel

2. Create your .env file
   cp .env.example .env

Open .env and fill in:

DB_USER=cpanel
DB_PASSWORD=your_strong_password_here
DB_NAME=cpanel

JWT_SECRET=paste_a_64_plus_character_random_string_here
JWT_EXPIRES_IN=7d

PORT=3001

To generate a secure JWT_SECRET run:

node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

3. Start the full stack
   docker compose up -d

4. Restore the database
   docker compose exec -T db psql -U cpanel cpanel < backup.sql

This loads all the real data. Run this once after the first docker compose up -d.

5. Verify everything is running
   docker compose ps

# All 3 services should show "Up"

curl http://localhost/api/health

# Should return: {"status":"ok"}

Login
URL: http://localhost
Email: admin@demo.com
Password: demo1234

Making Frontend Changes
Work is done in src/. The dev server uses localStorage — no Docker needed.

npm install # first time only
npm run dev # starts at http://localhost:5173

When ready to test against the real database or deploy:

npm run build # rebuilds dist/
docker compose restart app # nginx picks up the new dist/

Making Backend Changes
The API is in backend/src/. Routes follow REST conventions — one file per resource.

After any backend change:

docker compose build api # rebuilds the api image
docker compose up -d api # restarts only the api container

To view API logs:

docker compose logs -f api

To connect directly to the database:

docker compose exec db psql -U cpanel cpanel

Useful Commands

# Start everything

docker compose up -d

# Stop everything (data is preserved)

docker compose down

# View logs

docker compose logs -f

# Rebuild frontend and restart nginx

npm run build && docker compose restart app

# Rebuild backend

docker compose build api && docker compose up -d api

# Database shell

docker compose exec db psql -U cpanel cpanel

# Export database backup

docker compose exec db pg_dump -U cpanel cpanel --clean --if-exists > backup.sql

# Import a backup

docker compose exec -T db psql -U cpanel cpanel < backup.sql

Deploying to a Remote Server
On a fresh Linux server (Ubuntu 22.04 recommended):

# 1. Install Docker

curl -fsSL https://get.docker.com | sh

# 2. Copy project files to server

scp -r cp-panel/ user@SERVER_IP:/opt/cp-panel
scp backup.sql user@SERVER_IP:/opt/cp-panel/

# 3. SSH in and start

ssh user@SERVER_IP
cd /opt/cp-panel
cp .env.example .env # fill in passwords
docker compose up -d
docker compose exec -T db psql -U cpanel cpanel < backup.sql

# 4. Open port 80 in your server's firewall

The app will be live at http://SERVER_IP.

For a domain + HTTPS, point your domain's A record to the server IP, then:

apt install -y certbot
docker compose stop app
certbot certonly --standalone -d yourdomain.com

# Add SSL config to nginx.conf then:

docker compose start app
