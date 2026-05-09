# LendPay Backend

Paid **workflow gateway** API: x402-style payment verification on Base (USDC), settlement, and **KeeperHub** workflow execution. Built with **Express**, **TypeScript**, and **Node 20+**.

## Quickstart

```bash
cp .env.example .env
# Edit .env — at minimum set X402_RECEIVING_ADDRESS and BASE_SETTLEMENT_PRIVATE_KEY for full execute flow.
npm ci
npm run dev
```

The server listens on `PORT` (default **3001**). See [`.env.example`](./.env.example) for all variables.

## Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Run with `tsx watch` (hot reload)    |
| `npm run lint`    | ESLint, type-aware (`tsconfig.eslint.json`) |
| `npm run build`   | Compile TypeScript to `dist/`        |
| `npm start`       | Run compiled `dist/index.js`         |
| `npm test`        | Run Vitest (HTTP tests via supertest)|
| `npm run test:watch` | Vitest watch mode                 |

## HTTP surface

| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/health` | Liveness JSON |
| `GET` | `/health/ready` | Readiness metadata (`checks` for key env) |
| `GET` | `/workflows` | Listed workflow definitions |
| `POST` | `/workflows/:workflowId/execute` | Validates body, x402 payment, settlement, KeeperHub call |

Full request/response notes: **[`docs/api-contract.md`](./docs/api-contract.md)**. Optional **`WORKFLOW_RATE_LIMIT_PER_MINUTE`** env applies a per-IP limit to **`POST /workflows/.../execute`** only.

Implementation lives under [`src/`](./src/) (`server.ts`, `routes/`, `services/`).

## Lint

`npm run lint` uses **ESLint 9** flat config (`eslint.config.mjs`) with **`typescript-eslint` `recommendedTypeChecked`**, backed by [`tsconfig.eslint.json`](./tsconfig.eslint.json) (includes `src/`, `test/`, and `vitest.config.ts`). Production `tsc` still uses [`tsconfig.json`](./tsconfig.json) (`src/` only).

## Deployment and ops

Hosted deployment guides (Docker, Ubuntu, AWS App Runner) live in **[`docs/`](./docs/index.md)** — start with the [deployment index](./docs/index.md).

## CI

Pull requests and pushes to `main` run **`npm ci`**, **`npm run lint`**, **`npm run build`**, and **`npm test`** via [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

## Related

- [lendpay-app](https://github.com/NautilusOSS/lendpay-app) — repay wizard UI  
- [lendpay-gateway-algorand-dorkfi](https://github.com/NautilusOSS/lendpay-gateway-algorand-dorkfi) — on-chain execution path  
- [lendpay-index](https://github.com/NautilusOSS/lendpay-index) — repo map (`docs/cross-repo.md`)  
