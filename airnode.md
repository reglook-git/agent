Perfect — let’s set up **airnode1 from absolute zero** on a fresh Ubuntu server (Hetzner or any VPS). I’ll assume:

* OS: **Ubuntu 22.04 / 24.04**
* This machine will be: **airnode1**
* You already have: **Master server running somewhere reachable**

---

# 🧱 PHASE 0 — SSH into airnode1

```bash
ssh root@AIRNODE1_IP
```

(Optional but recommended: create a non-root user later.)

---

# 🧱 PHASE 1 — System prep

```bash
apt update && apt upgrade -y
apt install -y curl git ca-certificates gnupg lsb-release
```

---

# 🐳 PHASE 2 — Install Docker Engine

```bash
curl -fsSL https://get.docker.com | sh
```

Enable Docker:

```bash
systemctl enable docker
systemctl start docker
```

Allow your user to run docker:

```bash
usermod -aG docker $USER
newgrp docker
```

Test:

```bash
docker run hello-world
```

---

# 🌐 PHASE 3 — Create Docker network for Traefik + apps

```bash
docker network create airnode || true
```

---

# 🚦 PHASE 4 — Install & Run Traefik

```bash
mkdir -p /opt/traefik
cd /opt/traefik
```

Create `docker-compose.yml`:

```yaml
version: "3.8"

services:
  traefik:
    image: traefik:v2.11
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
    ports:
      - "80:80"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - airnode
    restart: unless-stopped

networks:
  airnode:
    external: true
```

Start Traefik:

```bash
docker compose up -d
```

Check:

```bash
docker ps
```

Open in browser:

```
http://AIRNODE1_IP:8080
```

---

# 🧠 PHASE 5 — Install Node.js 20+

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
```

---

# 🤖 PHASE 6 — Install Airnode Agent

```bash
mkdir -p /opt/airnode-agent
cd /opt/airnode-agent
git clone <YOUR_AGENT_REPO_URL> .
```

Install deps:

```bash
npm ci
npm run build
```

---

# ⚙️ PHASE 7 — Configure Agent

```bash
cp .env.example .env
nano .env
```

## Example `.env` (IMPORTANT)

```env
AGENT_NAME=airnode1
AGENT_KEY=super-secret-key-from-master-db
MASTER_URL=http://MASTER_PUBLIC_IP:9100

POLL_INTERVAL_MS=2000
HEARTBEAT_INTERVAL_MS=5000

WORKDIR=/var/lib/airnode/work

DOCKER_NETWORK=airnode

TRAEFIK_ENTRYPOINTS=web
TRAEFIK_TLS=false

MAX_CONCURRENT_BUILDS=1
MAX_CONCURRENT_RUNTIMES=50

BUILD_TIMEOUT_MS=900000
HEALTHCHECK_TIMEOUT_MS=30000
```

---

# 🗄️ PHASE 8 — Create workdir

```bash
mkdir -p /var/lib/airnode/work
chmod -R 777 /var/lib/airnode
```

---

# 🧩 PHASE 9 — Register airnode1 in MASTER DB

In your **master database**, insert a node:

```sql
INSERT INTO airnode_nodes (
  id,
  name,
  agent_key_hash,
  base_domain,
  is_active
)
VALUES (
  gen_random_uuid(),
  'airnode1',
  '<HASH_OF_AGENT_KEY>',
  'airnode1.reglook.com',
  true
);
```

⚠️ The **AGENT_KEY** in `.env` must hash to `agent_key_hash`.

If your master hashes like:

```ts
sha256(AGENT_KEY)
```

Then store that hash.

---

# 🚀 PHASE 10 — Start agent manually (test)

```bash
npm start
```

You should see logs like:

```text
Starting Airnode Agent: airnode1
Heartbeat sent
Polling tasks...
```

---

# 🔁 PHASE 11 — Run as systemd service (production)

Create service:

```bash
nano /etc/systemd/system/airnode-agent.service
```

Paste:

```ini
[Unit]
Description=Airnode Agent
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/airnode-agent
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable & start:

```bash
systemctl daemon-reload
systemctl enable airnode-agent
systemctl start airnode-agent
```

Watch logs:

```bash
journalctl -u airnode-agent -f
```

---

# 🌍 PHASE 12 — DNS (IMPORTANT)

In your DNS provider:

```
*.airnode1.reglook.com  -> AIRNODE1_IP
```

Without this, URLs won’t resolve.

---

# ✅ PHASE 13 — Test connectivity

From airnode1:

```bash
curl http://MASTER_IP:9100/
```

From master:

```bash
curl -X POST http://AIRNODE1_IP:80
```

---

# 🧪 PHASE 14 — Test real deploy

From your PC:

```bash
cd my-next
airnode deploy
```

Then on airnode1:

```bash
journalctl -u airnode-agent -f
```

You should see:

* task picked
* source downloaded
* docker build
* container run
* traefik route created

Then open:

```
http://johndoe-my-next.airnode1.reglook.com
```

---

# 🧠 If something breaks

Paste:

* `journalctl -u airnode-agent -f`
* Output of:

```bash
curl -X POST http://MASTER_IP:9100/agent/tasks/poll \
  -H "X-Agent-Name: airnode1" \
  -H "X-Agent-Key: YOUR_KEY"
```

---

# 🏁 In one sentence

> This setup turns a blank Ubuntu VPS into a Vercel-like deployment node that builds Docker containers and routes them automatically via Traefik.

---

If you want, next I can give you:

* The **exact SQL** for your node tables
* The **hashing function** to use
* The **Traefik TLS + wildcard cert** setup
* Or a **checklist to production-harden this**.
