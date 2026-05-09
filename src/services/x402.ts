import { decodePaymentSignatureHeader } from "@x402/core/http";
import { getAddress, verifyTypedData } from "viem";
import { parseUsdAmountToMicroUnits } from "../util/usdcAmount";

/** Matches `@x402/evm` EIP-3009 typed data for Circle USDC on Base. */
const AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export type ValidatePaymentContext = {
  /** Expected USDC amount in token min units (string integer), e.g. `250000` for $0.25 */
  expectedAmountMinUnits: string;
  /**
   * Raw JSON body `amount` string — must parse to the same min units as {@link expectedAmountMinUnits}
   * so the signed payment matches the execute payload.
   */
  bodyAmountField?: string;
  /** Required payee — must match `authorization.to` */
  payTo: string;
  /** ERC-20 contract — must match requirements / verifyingContract */
  asset: string;
  /** Challenge `resource.url` — must match payment payload when present */
  resourceUrl: string;
};

/** Fields needed for on-chain `transferWithAuthorization` after verification. */
export type VerifiedSettlement = {
  asset: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: `0x${string}`;
  signature: `0x${string}`;
  /** Dedup key — call {@link recordSettlementNonce} after a successful chain settlement */
  nonceKey: string;
};

function safeDecodeHeader(header: string): unknown {
  try {
    return decodePaymentSignatureHeader(header.trim());
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function decimalString(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v).toString();
  if (typeof v === "string") return v.trim();
  if (v === null || v === undefined) return "";
  return "";
}

/** Nonces consumed after successful on-chain settlement (or call {@link recordSettlementNonce}). */
const settledNonceKeys = new Set<string>();

export function recordSettlementNonce(nonceKey: string): void {
  settledNonceKeys.add(nonceKey);
}

/**
 * Verifies x402 v2 **exact** / EIP-3009 payment encoded in `X-PAYMENT` (base64 JSON).
 * Returns structured data for USDC settlement; does **not** submit a transaction.
 */
export async function validateX402Payment(
  paymentHeader: string,
  ctx: ValidatePaymentContext
): Promise<{ ok: true; verified: VerifiedSettlement } | { ok: false; message: string }> {
  const trimmed = paymentHeader.trim();
  if (!trimmed) {
    return { ok: false, message: "X-PAYMENT header is empty" };
  }

  const decoded = safeDecodeHeader(trimmed);
  if (!decoded || !isRecord(decoded)) {
    return { ok: false, message: "Invalid X-PAYMENT (could not decode)" };
  }

  const x402Version = decoded.x402Version;
  if (x402Version !== 2) {
    return { ok: false, message: `Unsupported x402 version: ${String(x402Version)}` };
  }

  const accepted = decoded.accepted;
  if (!isRecord(accepted)) {
    return { ok: false, message: "Payment payload missing accepted requirements" };
  }

  const scheme = accepted.scheme;
  if (scheme !== "exact") {
    return { ok: false, message: `Unsupported scheme: ${String(scheme)}` };
  }

  if (accepted.network !== "eip155:8453") {
    return { ok: false, message: "Payment must be for network eip155:8453 (Base mainnet)" };
  }

  try {
    if (getAddress(String(accepted.asset)) !== getAddress(ctx.asset)) {
      return { ok: false, message: "Payment asset does not match requirement" };
    }
    if (getAddress(String(accepted.payTo)) !== getAddress(ctx.payTo)) {
      return { ok: false, message: "Payment payTo does not match requirement" };
    }
  } catch {
    return { ok: false, message: "Invalid asset or payTo address in payment" };
  }

  const paidAmount = decimalString(accepted.amount);
  if (!/^\d+$/.test(paidAmount)) {
    return { ok: false, message: "Invalid accepted.amount" };
  }

  if (BigInt(paidAmount) !== BigInt(ctx.expectedAmountMinUnits)) {
    return {
      ok: false,
      message: `Payment amount mismatch (expected ${ctx.expectedAmountMinUnits} min units)`,
    };
  }

  if (ctx.bodyAmountField !== undefined) {
    const fromBody = parseUsdAmountToMicroUnits(ctx.bodyAmountField);
    if (!fromBody.ok || fromBody.microUnits !== ctx.expectedAmountMinUnits) {
      return {
        ok: false,
        message:
          "Request body amount does not match the payment amount — retry with the same amount you paid for",
      };
    }
  }

  const resource = decoded.resource;
  if (resource && isRecord(resource) && typeof resource.url === "string") {
    if (resource.url !== ctx.resourceUrl) {
      return {
        ok: false,
        message: "Payment resource URL does not match this execute request",
      };
    }
  }

  const inner = decoded.payload;
  if (!isRecord(inner)) {
    return { ok: false, message: "Missing EIP-3009 payload" };
  }

  const authorization = inner.authorization;
  const signature = inner.signature;
  if (!isRecord(authorization) || typeof signature !== "string") {
    return { ok: false, message: "Invalid EIP-3009 authorization or signature" };
  }

  const name = accepted.extra && isRecord(accepted.extra) ? accepted.extra.name : undefined;
  const version = accepted.extra && isRecord(accepted.extra) ? accepted.extra.version : undefined;
  if (typeof name !== "string" || typeof version !== "string") {
    return { ok: false, message: "Missing EIP-712 domain name/version in accepted.extra" };
  }

  const from = authorization.from;
  const to = authorization.to;
  const value = authorization.value;
  const validAfter = authorization.validAfter;
  const validBefore = authorization.validBefore;
  const nonce = authorization.nonce;
  if (typeof from !== "string" || typeof to !== "string" || typeof nonce !== "string") {
    return { ok: false, message: "Malformed authorization fields" };
  }

  const valueStr = decimalString(value);
  const validAfterStr = decimalString(validAfter);
  const validBeforeStr = decimalString(validBefore);
  if (!/^\d+$/.test(valueStr) || !/^\d+$/.test(validAfterStr) || !/^\d+$/.test(validBeforeStr)) {
    return { ok: false, message: "Malformed authorization numeric fields" };
  }

  try {
    if (getAddress(to) !== getAddress(ctx.payTo)) {
      return { ok: false, message: "authorization.to does not match payee" };
    }
  } catch {
    return { ok: false, message: "Invalid authorization.to" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const va = BigInt(validAfterStr);
  const vb = BigInt(validBeforeStr);
  if (BigInt(nowSec) < va || BigInt(nowSec) >= vb) {
    return { ok: false, message: "Authorization is outside validAfter / validBefore window" };
  }

  if (BigInt(valueStr) !== BigInt(ctx.expectedAmountMinUnits)) {
    return { ok: false, message: "authorization.value does not match price" };
  }

  const nonceKey = `base:${from.toLowerCase()}:${nonce}`;
  if (settledNonceKeys.has(nonceKey)) {
    return { ok: false, message: "Nonce already settled (replay)" };
  }

  const domain = {
    name,
    version,
    chainId: 8453,
    verifyingContract: getAddress(ctx.asset),
  };

  const message = {
    from: getAddress(from),
    to: getAddress(to),
    value: BigInt(valueStr),
    validAfter: BigInt(validAfterStr),
    validBefore: BigInt(validBeforeStr),
    nonce: nonce as `0x${string}`,
  };

  const okSig = await verifyTypedData({
    address: getAddress(from),
    domain,
    types: AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message,
    signature: signature as `0x${string}`,
  });

  if (!okSig) {
    return { ok: false, message: "EIP-712 signature verification failed" };
  }

  return {
    ok: true,
    verified: {
      asset: getAddress(ctx.asset),
      from: getAddress(from),
      to: getAddress(to),
      value: BigInt(valueStr),
      validAfter: BigInt(validAfterStr),
      validBefore: BigInt(validBeforeStr),
      nonce: nonce as `0x${string}`,
      signature: signature as `0x${string}`,
      nonceKey,
    },
  };
}
