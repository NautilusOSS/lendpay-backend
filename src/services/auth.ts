import { config } from "../config";
import { HttpError } from "../errors";

/**
 * Bearer token from `Authorization`, else `DEFAULT_KEEPERHUB_API_KEY`, else unset (no throw).
 */
export function keeperHubKeyFromRequest(
  authHeader: string | undefined
): string | undefined {
  const trimmed = authHeader?.trim();
  const bearerMatch = trimmed ? /^Bearer\s+(.+)$/i.exec(trimmed) : null;
  const token = bearerMatch?.[1]?.trim();
  if (token) {
    return token;
  }
  const fallback = config.defaultKeeperHubApiKey?.trim();
  return fallback || undefined;
}

/**
 * Resolve the KeeperHub API key for this request.
 *
 * TODO: Replace stub with real auth:
 * - Validate Bearer JWT/session with your identity provider.
 * - Map user or org to a stored KeeperHub API key (never use DEFAULT_KEEPERHUB_API_KEY in production).
 */
export function resolveKeeperHubApiKey(
  authHeader: string | undefined
): string {
  const key = keeperHubKeyFromRequest(authHeader);
  if (key) {
    return key;
  }

  throw new HttpError(
    401,
    "Authorization header must be `Bearer <token>` or configure DEFAULT_KEEPERHUB_API_KEY for local dev",
    "UNAUTHORIZED"
  );
}
