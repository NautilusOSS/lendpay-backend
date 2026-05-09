# Gateway HTTP API (contract)

Normative shapes for **`lendpay-backend`** consumers (`lendpay-app`, automation, etc.). Errors use JSON with at least **`error`** (string) and usually **`code`** (string).

Base path in production is typically the App Runner / reverse-proxy origin (no trailing slash).

## `GET /health`

**200** — liveness.

```json
{
  "status": "ok",
  "service": "paid-workflow-gateway"
}
```

## `GET /health/ready`

**200** — readiness metadata (always 200; inspect `checks` for configuration state).

```json
{
  "status": "ready",
  "service": "paid-workflow-gateway",
  "checks": {
    "x402PayeeConfigured": true,
    "settlementKeyConfigured": true
  }
}
```

- `x402PayeeConfigured`: `X402_RECEIVING_ADDRESS` matches `0x` + 40 hex.
- `settlementKeyConfigured`: `BASE_SETTLEMENT_PRIVATE_KEY` matches `0x` + 64 hex.

## `GET /workflows`

**200** — JSON array of workflow definitions (`id`, `name`, `description`, `paymentMinUsd`, `paymentMaxUsd`, `requiredFields`). Listed workflows include at least: `simple-workflow`, `og-beta-signup`, `og-paid-beta-signup`, `lendpay-paid-beta-signup`, `claimlayer-paid-claimall`.

## `POST /workflows/:workflowId/execute`

**Path:** `workflowId` must match a listed workflow `id` (see `GET /workflows`). **404** with `code: "WORKFLOW_NOT_FOUND"` if unknown.

**Headers**

- **`Content-Type: application/json`**
- **`X-PAYMENT`** or **`PAYMENT-SIGNATURE`**: x402 v2 payment payload when payment is required / supplied.
- **`Authorization`**: optional `Bearer <KeeperHub API key>` (else `DEFAULT_KEEPERHUB_API_KEY` from env for dev).

**Body / parameters** — depends on `workflowId`:

### `simple-workflow` (JSON body)

| Field | Type | Notes |
| ----- | ---- | ----- |
| `chain` | string | e.g. `algorand` |
| `protocol` | string | e.g. `dorkfi` |
| `action` | string | e.g. `repay` |
| `targetAddress` | string | EVM (`0x` + 40 hex) or 58-char Algorand |
| `benefactorAddress` | string | EVM (`0x` + 40 hex) or 58-char Algorand |
| `asset` | string | e.g. `USDC` |
| `amount` | string | USD decimal within workflow min/max |
| `triggerData` | object | `marketAppId`, `assetId`, `poolId` (positive ints); optional `underlyingAssetId` |

### `og-beta-signup` (JSON body)

| Field | Type | Notes |
| ----- | ---- | ----- |
| `email` | string | valid email |
| `discord` | string | required |
| `network` | string | required |
| `projectName` | string | required |
| `governanceToken` | string | required |
| `amount` | string | USD (fixed band for this workflow) |

### `og-paid-beta-signup` (URL query)

Pass **`email`**, **`discord`**, **`network`**, **`projectName`**, **`governanceToken`**, **`amount`** (USD) as query parameters so they bind to the x402 **`resource.url`**. JSON body is ignored; payer EVM address comes from the verified x402 payment.

### `lendpay-paid-beta-signup` (URL query)

Pass **`email`**, **`discord`**, **`telegram`**, **`baseAddress`** (`0x` + 40 hex), **`algorandAddress`** (58-char Algorand), **`amount`** (USD) as query parameters (same x402 `resource.url` pattern as `og-paid-beta-signup`).

### `claimlayer-paid-claimall`

**Hits**

- `GET /workflows` — workflow appears in the list (`id`: `claimlayer-paid-claimall`).
- `POST /workflows/claimlayer-paid-claimall/execute` — execute with JSON body and optional x402 payment headers (same rules as `POST /workflows/:workflowId/execute` above).

**x402 `resource.url`** (e.g. on **400** `PAYMENT_REQUIRED`): canonical payment resource is `https://<origin>/workflows/claimlayer-paid-claimall/execute` with **no** query string; parameters stay in the JSON body, not on the URL (unlike `og-paid-beta-signup` / `lendpay-paid-beta-signup`).

**JSON body**

| Field | Type | Notes |
| ----- | ---- | ----- |
| `paymentAddress` | string | EVM (`0x` + 40 hex) or 58-char Algorand |
| `address` | string | optional; EVM or 58-char Algorand — if present, sent to KeeperHub as `targetAddress` (preferred over body `targetAddress` when both are sent) |
| `targetAddress` | string | optional if `address` is set; EVM (`0x` + 40 hex) or 58-char Algorand |
| `chain` | string | chain id or label for the payment leg (e.g. `eip155:8453`) |
| `targetChain` | string | chain id or label for the claim target |
| `amount` | string | USD decimal within workflow min/max |
| `txid` | string | optional; ignored — gateway sets settlement `txid` after payment |

**Responses (selection)**

| Status | `code` (when present) | Meaning |
| ------ | -------------------- | ------- |
| 200 | — | `success`, `workflowId`, `executionId`, `status: "submitted"`, `settlement` |
| 404 | `WORKFLOW_NOT_FOUND` | Unknown `workflowId` |
| 400 | `VALIDATION_ERROR` | Body or query failed validation; `details.fieldErrors` |
| 400 | `AMOUNT_OUT_OF_RANGE` | `amount` outside USD bounds |
| 400 | `PAYMENT_REQUIRED` | Missing payment header; includes `x402Version`, `resource`, `accepts` |
| 402 | `PAYMENT_INVALID` | x402 verification failed |
| 503 | `MISCONFIGURED` | Missing/invalid x402 payee env |
| 503 | `SETTLEMENT_MISCONFIGURED` | Missing/invalid relayer key |
| 502 | `SETTLEMENT_FAILED` | On-chain settlement error |
| 5xx | `KEEPERHUB_*` / `INTERNAL_ERROR` | Downstream / unexpected |

---

← [Deployment index](index.md)
