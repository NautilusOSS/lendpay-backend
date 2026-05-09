# Deployment

Guides for hosting this **paid-workflow gateway** API.

| Doc | What it covers |
| --- | ---------------- |
| [Gateway deploy overview](gateway-deploy.md) | **`lendpay-backend`**: local build/run, Docker, hosting options, post-deploy checklist. |
| [HTTP API contract](api-contract.md) | **`GET /health`**, **`GET /health/ready`**, **`GET /workflows`**, **`POST /workflows/…/execute`** — request/response shapes and error codes. |
| [Cross-repo links](cross-repo.md) | How this service relates to **lendpay-app**, **lendpay-gateway-algorand-dorkfi**, and **lendpay-index**. |
| [Ubuntu install](ubuntu-install.md) | Node.js on Ubuntu, build/run, optional **systemd** and TLS notes. |
| [AWS App Runner (gateway)](aws-app-runner.md) | App Runner from **source** (`apprunner.yaml`) or **ECR** image; env vars, health check, custom domain. |
