# AWS App Runner (this gateway)

[AWS App Runner](https://docs.aws.amazon.com/apprunner/latest/dg/what-is-apprunner.html) runs a managed container with HTTPS, autoscaling, and optional GitHub auto-deploy. Use it for this gateway **either** from a **container image in ECR** or from a **source code** connection (GitHub / Bitbucket / CodeCommit).

**Availability:** AWS [may restrict new App Runner customers](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html). If you cannot create a service, use another host from [Gateway deploy overview](gateway-deploy.md).

## Option A — Source repository (Node.js managed runtime)

1. In the AWS console, open **App Runner** → **Create service**.
2. **Repository type:** Source code repository → connect **GitHub** (or your provider) and authorize AWS.
3. Select the **`lendpay-backend`** repository and branch (for example `main`).
4. **Build settings:** choose **Use a configuration file** so App Runner reads **`apprunner.yaml`** from the repository root. That file runs `npm ci`, `npm run build`, starts with **`npm start`**, and listens on port **8080** (App Runner sets the **`PORT`** environment variable to match).
5. If you prefer the console instead of a file: **Runtime** = Node.js 22 (or the latest **Node.js 20+** available), **Build command** = `npm ci && npm run build`, **Start command** = `npm start`, **Port** = `8080`.
6. **Configure service:** pick CPU / memory, **auto deployments** on push if you want them, and a service name.
7. **Environment variables:** add everything your deployment needs from **`.env.example`** (see [Environment variables on App Runner](#environment-variables-on-app-runner)). For secrets (`BASE_SETTLEMENT_PRIVATE_KEY`, API keys), use **reference values** from [AWS Secrets Manager](https://docs.aws.amazon.com/apprunner/latest/dg/env-variable-secrets.html) or [SSM Parameter Store](https://docs.aws.amazon.com/apprunner/latest/dg/env-variable-ssm.html) rather than plain text.
8. **Health check:** set the path to **`/health`** (JSON `status: ok`) so unhealthy revisions fail fast. Optionally monitor **`GET /health/ready`** in your own dashboards: it always returns **200** with `checks` booleans for whether x402 payee and settlement private key **look** configured (operators can alert on `false` without failing the App Runner probe).
9. Create the service and wait for the first deployment. Copy the **default App Runner URL** (`https://xxxxx.us-east-1.awsapprunner.com/`) into **`VITE_GATEWAY_BASE_URL`** on the frontend (no trailing slash). Add that same URL’s **origin** (scheme + host, no path) to **`CORS_ORIGIN`** on the service if you use an allowlist.

## Option B — Container image (Amazon ECR)

1. **Create an ECR repository** (for example `lendpay-gateway`) in the same Region you plan to run App Runner.
2. Authenticate Docker, build the image from this repo, tag it, and push:

```bash
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
docker build -t lendpay-gateway .
docker tag lendpay-gateway:latest <account>.dkr.ecr.<region>.amazonaws.com/lendpay-gateway:latest
docker push <account>.dkr.ecr.<region>.amazonaws.com/lendpay-gateway:latest
```

3. **App Runner** → **Create service** → **Container registry** → **Amazon ECR** → pick the image. Create or reuse an **ECR access role** when prompted.
4. **Port:** set to **8080** (recommended) so App Runner injects **`PORT=8080`**; this app reads `process.env.PORT`. Alternatively set the port you configure here to any value **as long as `PORT` in the container matches** (App Runner sets `PORT` for you).
5. Add the same **environment variables**, **secrets**, and **health check** (`/health`) as in option A.
6. Optional: enable **continuous deployment** from ECR when the image tag updates.

## Environment variables on App Runner

Map names from **`.env.example`**. Common production set:

| Variable | Notes |
| -------- | ----- |
| `PORT` | Normally **do not** set manually; App Runner sets it from the configured port (for example **8080**). |
| `CORS_ORIGIN` | Comma-separated frontend origins (production URL, preview URLs, custom domain). |
| `X402_RECEIVING_ADDRESS` | Required for payment challenges. |
| `BASE_SETTLEMENT_PRIVATE_KEY` | Relayer key; use a secret reference. |
| `DEFAULT_KEEPERHUB_API_KEY` | Optional if every client sends Bearer auth. |
| `KEEPERHUB_*`, `BASE_RPC_URL`, `LOG_LEVEL` | As needed. |

## Custom domain

In App Runner: **Custom domains** → associate your domain and complete DNS validation. Put the **HTTPS origin** of that domain in **`CORS_ORIGIN`** and use the same base URL in **`VITE_GATEWAY_BASE_URL`**.

---

← [Back to deployment docs](index.md) · [Gateway deploy overview](gateway-deploy.md)
