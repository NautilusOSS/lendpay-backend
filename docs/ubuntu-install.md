# Ubuntu install (`lendpay-backend`)

Run the gateway on **Ubuntu 22.04 or 24.04 LTS** (or another recent release) with **Node.js 20 or newer**.

## 1. System packages

```bash
sudo apt update
sudo apt install -y curl ca-certificates git
```

If `npm ci` later fails compiling a native addon, install build tools and retry:

```bash
sudo apt install -y build-essential python3
```

## 2. Node.js 20+

**Option A — NodeSource (simple on a server)**

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x or higher
```

**Option B — [nvm](https://github.com/nvm-sh/nvm) (good for dev machines)**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# restart shell or: source ~/.bashrc
nvm install 20
nvm use 20
```

## 3. Application setup

```bash
git clone https://github.com/<org>/lendpay-backend.git
cd lendpay-backend
cp .env.example .env
nano .env   # set secrets and config; see .env.example
npm ci
npm run build
```

Run once in the foreground (default port **3001**):

```bash
npm start
```

Check: `curl -sS http://127.0.0.1:3001/health`

## 4. Production: `systemd` service

Use a dedicated Unix user, clone the repo on the server, build once, and keep secrets in **`.env`** (owned by that user, `chmod 600`). The app loads `.env` from its working directory via `dotenv`.

```bash
sudo useradd --system --home-dir /opt/lendpay-gateway --create-home lendpaygw
sudo chown lendpaygw:lendpaygw /opt/lendpay-gateway
sudo -u lendpaygw git clone https://github.com/<org>/lendpay-backend.git /opt/lendpay-gateway/lendpay-backend
sudo -u lendpaygw sh -c 'cd /opt/lendpay-gateway/lendpay-backend && cp .env.example .env && npm ci && npm run build'
sudo -u lendpaygw chmod 600 /opt/lendpay-gateway/lendpay-backend/.env
# edit secrets: sudo -u lendpaygw nano /opt/lendpay-gateway/lendpay-backend/.env
```

Service unit (Node from apt lives at `/usr/bin/node`; adjust if you use nvm — prefer a system-wide Node for servers):

```bash
sudo tee /etc/systemd/system/lendpay-gateway.service >/dev/null <<'EOF'
[Unit]
Description=LendPay paid-workflow gateway
After=network.target

[Service]
Type=simple
User=lendpaygw
Group=lendpaygw
WorkingDirectory=/opt/lendpay-gateway/lendpay-backend
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now lendpay-gateway
sudo systemctl status lendpay-gateway
```

After pulling new code: `sudo -u lendpaygw sh -c 'cd /opt/lendpay-gateway/lendpay-backend && git pull && npm ci && npm run build'` then `sudo systemctl restart lendpay-gateway`.

## 5. TLS and public HTTPS

Browsers need **HTTPS** for production. Typical pattern:

1. Put **Nginx** (or Caddy) on the host, terminate TLS with **Let’s Encrypt** ([Certbot](https://certbot.eff.org/instructions)).
2. Proxy `https://api.example.com` → `http://127.0.0.1:3001`.
3. Set **`CORS_ORIGIN`** to your real frontend origins (scheme + host, comma-separated).

Open the host firewall only for **80/443** if you use Nginx; keep **3001** bound to localhost unless you intentionally expose Node directly.

## 6. Firewall (optional)

```bash
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

← [Back to deployment docs](index.md) · [Gateway deploy overview](gateway-deploy.md)
