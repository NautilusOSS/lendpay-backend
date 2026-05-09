# Cross-repo links (LendPay)

This gateway is one piece of the LendPay stack. Keep human-facing maps in sync:

| Repo | Role |
| ---- | ---- |
| **[lendpay-app](https://github.com/NautilusOSS/lendpay-app)** | Repay wizard UI; calls this gateway for x402 + workflows. |
| **[lendpay-gateway-algorand-dorkfi](https://github.com/NautilusOSS/lendpay-gateway-algorand-dorkfi)** | On-chain Algorand execution path (DorkFi); KeeperHub triggers land here after settlement. |
| **[lendpay-index](https://github.com/NautilusOSS/lendpay-index)** | Repo index / architecture table — add or update rows so `repos.md` (or `data/repos.json`) points at this service and the gateway above. |
| **[Gateway deploy](gateway-deploy.md)** | How to run and host **`lendpay-backend`**. |

**Maintainers:** when you change deploy assumptions (ports, health paths, env vars), update **this repo’s** `docs/` and, where applicable, **`lendpay-index`** so the umbrella README and tables stay accurate.

---

← [Deployment index](index.md)
