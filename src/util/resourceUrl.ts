import type { Request } from "express";

function pathOnlyFromOriginalUrl(originalUrl: string): string {
  const q = originalUrl.indexOf("?");
  return (q >= 0 ? originalUrl.slice(0, q) : originalUrl) || "";
}

/** Stable query string for x402 `resource.url` (sorted keys, deterministic order). */
export function sortedQuerySuffixFromOriginalUrl(originalUrl: string): string {
  const q = originalUrl.indexOf("?");
  if (q < 0) return "";
  const raw = originalUrl.slice(q + 1);
  if (!raw) return "";
  const entries = Array.from(new URLSearchParams(raw).entries()).sort((a, b) =>
    a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0]),
  );
  const sp = new URLSearchParams();
  for (const [k, v] of entries) {
    sp.append(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/**
 * Public URL the browser used for this request. Behind Vite’s `/gateway` proxy the host path is
 * `http://localhost:5173/gateway/workflows/...` while Express sees `/workflows/...` on port 3001 — use
 * forwarded headers + path prefix so x402 `resource.url` matches `fetch()`.
 *
 * When `includeSortedQuery` is true, the query string is appended in canonical form so PAYMENT_REQUIRED
 * and the client’s signed `resource.url` include the same signup parameters (e.g. og-paid-beta-signup).
 */
export function publicResourceUrlFromRequest(
  req: Request,
  options?: { includeSortedQuery?: boolean },
): string {
  const forwardedHost = req.get("x-forwarded-host");
  const forwardedProto =
    req.get("x-forwarded-proto") ?? req.protocol ?? "http";
  const pathPrefix = req.get("x-gateway-public-path-prefix") ?? "";
  const host = forwardedHost ?? req.get("host") ?? "localhost";
  const original = req.originalUrl ?? "";
  const path = pathOnlyFromOriginalUrl(original);
  const qs =
    options?.includeSortedQuery === true
      ? sortedQuerySuffixFromOriginalUrl(original)
      : "";
  return `${forwardedProto}://${host}${pathPrefix}${path}${qs}`;
}
