/**
 * Parse a USD decimal string into USDC minimum units (6 decimals), without float drift.
 */
export type ParseUsdResult =
  | { ok: true; microUnits: string }
  | { ok: false; message: string };

export function parseUsdAmountToMicroUnits(raw: string): ParseUsdResult {
  const s = raw.trim().replace(/^\++/, "");
  if (!s) {
    return { ok: false, message: "amount is empty" };
  }
  if (s.startsWith("-")) {
    return { ok: false, message: "amount must be positive" };
  }
  const parts = s.split(".");
  let whole: string;
  let frac: string;
  if (parts.length === 1) {
    whole = parts[0];
    frac = "";
  } else if (parts.length === 2) {
    whole = parts[0];
    frac = parts[1];
  } else {
    return { ok: false, message: "amount must be a valid USD decimal" };
  }
  if (whole === "" || !/^\d+$/.test(whole)) {
    return { ok: false, message: "amount must be a valid USD decimal" };
  }
  if (!/^\d*$/.test(frac)) {
    return { ok: false, message: "amount must be a valid USD decimal" };
  }
  if (frac.length > 6) {
    return { ok: false, message: "amount supports at most 6 decimal places (USDC)" };
  }
  const fracPadded = (frac + "000000").slice(0, 6);
  try {
    const micro = BigInt(whole) * 1_000_000n + BigInt(fracPadded === "" ? "0" : fracPadded);
    if (micro <= 0n) {
      return { ok: false, message: "amount must be greater than zero" };
    }
    return { ok: true, microUnits: micro.toString() };
  } catch {
    return { ok: false, message: "amount is out of range" };
  }
}

export type WorkflowPaymentBounds = {
  paymentMinUsd: string;
  paymentMaxUsd: string;
};

export type ResolveGatewayPaymentResult =
  | { ok: true; microUnits: string }
  | { ok: false; message: string; code?: string };

/**
 * Parses body `amount`, ensures it lies within workflow min/max (USD strings), returns USDC min units.
 */
export function resolveGatewayPaymentAmount(
  amountField: string,
  bounds: WorkflowPaymentBounds
): ResolveGatewayPaymentResult {
  const parsed = parseUsdAmountToMicroUnits(amountField);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message, code: "INVALID_AMOUNT" };
  }
  const min = parseUsdAmountToMicroUnits(bounds.paymentMinUsd);
  const max = parseUsdAmountToMicroUnits(bounds.paymentMaxUsd);
  if (!min.ok || !max.ok) {
    return { ok: false, message: "Workflow payment bounds are misconfigured", code: "MISCONFIGURED" };
  }
  const v = BigInt(parsed.microUnits);
  const lo = BigInt(min.microUnits);
  const hi = BigInt(max.microUnits);
  if (lo > hi) {
    return { ok: false, message: "Workflow payment bounds are misconfigured", code: "MISCONFIGURED" };
  }
  if (v < lo || v > hi) {
    return {
      ok: false,
      message: `amount must be between ${bounds.paymentMinUsd} and ${bounds.paymentMaxUsd} USD for this workflow`,
      code: "AMOUNT_OUT_OF_RANGE",
    };
  }
  return { ok: true, microUnits: parsed.microUnits };
}
