# Gateway deploy overview (`lendpay-backend`)

**Static site hosts do not run this service.** The gateway is a long-lived **Node + Express** HTTP server; host it on a platform that runs containers or Node processes and gives you a stable **HTTPS URL** for the frontend’s **`VITE_GATEWAY_BASE_URL`**. The Vite app in **`lendpay-app`** is deployed separately; see that repo’s docs for client env vars.

## Build and run locally

- **Node ≥ 20**  
- `npm ci` → `npm run build` → `npm start` (listens on `PORT`, default `3001`)  
- **Health:** `GET /health` → `{ "status": "ok", ... }` · readiness metadata: `GET /health/ready` (see [API contract](api-contract.md))  
- Environment variables: see **`.env.example`**. Production needs at least `X402_RECEIVING_ADDRESS`, `BASE_SETTLEMENT_PRIVATE_KEY`, and either `DEFAULT_KEEPERHUB_API_KEY` or per-request Bearer auth, depending on how you gate KeeperHub.

## Ubuntu VM

Bare-metal or cloud **Ubuntu** install, optional **systemd**: [Ubuntu install](ubuntu-install.md).

## Docker

A **`Dockerfile`** is in the repo root. Build and run:

```bash
docker build -t lendpay-gateway .
docker run --rm -p 3001:3001 --env-file .env lendpay-gateway
```

Your platform must set **`PORT`** if it expects a non-default port inside the container. Many PaaS inject `PORT` automatically; the app reads `process.env.PORT`.

## AWS App Runner

Managed HTTPS and scaling on AWS: [AWS App Runner (this gateway)](aws-app-runner.md).

## Where to deploy (practical options)

| Approach | Why use it |
| -------- | ---------- |
| **[Fly.io](https://fly.io/)**, **[Railway](https://railway.app/)**, **[Render](https://render.com/)** | Fast path: connect the GitHub repo, set env vars and start command (`npm start` or Docker), get HTTPS. Good for demos and small production traffic. |
| **AWS App Runner** | Managed container or source deploy; see [AWS App Runner](aws-app-runner.md). |
| **AWS ECS Fargate** + ALB | More control and VPC networking; more setup (task definition, service, secrets in Secrets Manager). |
| **AWS Elastic Beanstalk** (Node) | Older but straightforward “upload app” model for Node on EC2. |

## Checklist after deploy

1. **`CORS_ORIGIN`** — Comma-separated list of browser origins (your production frontend URL, preview URLs, local dev). Omit only if you are fine with any origin.  
2. **`PORT`** — Match what the platform expects (often injected; do not hardcode `3001` in the platform if it assigns another port).  
3. **Secrets** — Set `BASE_SETTLEMENT_PRIVATE_KEY` and API keys in the host’s secret store, not in the image.  
4. **RPC** — Optionally set `BASE_RPC_URL` if the default public RPC is rate-limited.  
5. **Smoke test** — `curl -sS https://<your-api>/health` should return JSON `status: ok`.

---

← [Back to deployment docs](index.md)
