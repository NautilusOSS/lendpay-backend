import { createHash } from "crypto";
import { config } from "../config";
import { HttpError } from "../errors";
import type { KeeperHubWorkflowCallBody } from "../types/workflow";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function workflowCallUrl(base: string, listedSlug: string): string {
  return `${normalizeBaseUrl(base)}/api/mcp/workflows/${encodeURIComponent(listedSlug)}/call`;
}

type CatalogRow = { id: string; listedSlug: string };

type ListResponse = {
  items?: unknown[];
  total?: number;
  page?: number;
  limit?: number;
};

const CATALOG_TTL_MS = 60_000;
let catalogCache: {
  fp: string;
  expiry: number;
  rows: CatalogRow[];
} | null = null;

function fingerprintApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey.trim()).digest("hex");
}

function catalogRowFromItem(raw: unknown): CatalogRow | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const slugRaw =
    (typeof o.listedSlug === "string" && o.listedSlug) ||
    (typeof o.slug === "string" && o.slug) ||
    "";
  if (!slugRaw) {
    return null;
  }
  const idRaw =
    (typeof o.id === "string" && o.id) ||
    (typeof o.workflowId === "string" && o.workflowId) ||
    slugRaw;
  return { id: idRaw, listedSlug: slugRaw };
}

async function fetchWorkflowCatalogRows(apiKey: string): Promise<CatalogRow[]> {
  const base = normalizeBaseUrl(config.keeperHubBaseUrl.trim());
  const fp = fingerprintApiKey(apiKey);
  const now = Date.now();
  if (catalogCache && catalogCache.fp === fp && catalogCache.expiry > now) {
    return catalogCache.rows;
  }

  const rows: CatalogRow[] = [];
  let page = 1;
  const limit = 50;
  let hadSuccessfulPage = false;

  for (;;) {
    const url = `${base}/api/mcp/workflows?page=${page}&limit=${limit}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
    });
    if (!res.ok) {
      break;
    }
    hadSuccessfulPage = true;
    const data = (await res.json()) as ListResponse;
    const items = Array.isArray(data.items) ? data.items : [];
    for (const raw of items) {
      const row = catalogRowFromItem(raw);
      if (row) {
        rows.push(row);
      }
    }
    const total = typeof data.total === "number" ? data.total : rows.length;
    if (items.length < limit || page * limit >= total) {
      break;
    }
    page += 1;
  }

  if (hadSuccessfulPage) {
    catalogCache = { fp, expiry: now + CATALOG_TTL_MS, rows };
  }
  return rows;
}

/**
 * The MCP HTTP `…/workflows/{segment}/call` route expects **`listedSlug`**. Dashboard **`id`** (e.g.
 * `pbkb9kru29wuddz5qasck`) is not accepted as the path segment — resolve it using the catalog.
 */
export async function resolveMcpCallListedSlug(
  ref: string,
  keeperHubApiKey: string
): Promise<string> {
  const r = ref.trim();
  if (!r) {
    throw new HttpError(
      503,
      "KeeperHub workflow reference is empty (set the matching KEEPERHUB_*_WORKFLOW_ID or KEEPERHUB_*_WORKFLOW_SLUG env for this gateway workflow).",
      "MISCONFIGURED"
    );
  }

  const key = keeperHubApiKey.trim();
  if (!key) {
    return r;
  }

  try {
    const rows = await fetchWorkflowCatalogRows(key);
    const hit = rows.find((row) => row.id === r || row.listedSlug === r);
    if (hit) {
      return hit.listedSlug;
    }
  } catch {
    /* unlisted / network — fall through to use ref as slug */
  }

  return r;
}

/**
 * POST `/api/mcp/workflows/{listedSlug}/call` — see KeeperHub OpenAPI (`/openapi.json`).
 * `workflowRef` may be internal `id` or `listedSlug`; it is resolved when the catalog is available.
 */
export async function executeKeeperHubWorkflow(
  workflowRef: string,
  body: KeeperHubWorkflowCallBody,
  keeperHubApiKey: string
): Promise<{ executionId: string }> {
  const base = config.keeperHubBaseUrl.trim();
  if (!base) {
    throw new HttpError(
      503,
      "KeeperHub base URL is not configured.",
      "MISCONFIGURED"
    );
  }
  if (!keeperHubApiKey.trim()) {
    throw new HttpError(
      401,
      "KeeperHub API key is missing.",
      "UNAUTHORIZED"
    );
  }

  const listedSlug = await resolveMcpCallListedSlug(
    workflowRef,
    keeperHubApiKey
  );

  const url = workflowCallUrl(base, listedSlug);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${keeperHubApiKey.trim()}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (res.status === 402) {
    throw new HttpError(
      502,
      "KeeperHub returned 402: this workflow is paid on KeeperHub as well. Use a free/read workflow, org billing, or forward x402 to KeeperHub per their paid-workflows docs.",
      "KEEPERHUB_PAYMENT_REQUIRED"
    );
  }

  if (!res.ok) {
    let msg = extractErrorMessage(json, text, res.status);
    if (msg.toLowerCase().includes("workflow not found")) {
      msg +=
        " — That slug is not listed for this KeeperHub API key. Create or list the workflow on KeeperHub, then set the matching KEEPERHUB_*_WORKFLOW_SLUG (or _WORKFLOW_ID, resolved via GET /api/mcp/workflows) for this gateway route.";
    }
    throw new HttpError(
      res.status >= 400 && res.status < 500 ? res.status : 502,
      `KeeperHub workflow call failed: ${msg}`,
      "KEEPERHUB_REQUEST_FAILED"
    );
  }

  if (!json || typeof json !== "object") {
    throw new HttpError(
      502,
      "KeeperHub returned an empty or invalid JSON body.",
      "KEEPERHUB_INVALID_RESPONSE"
    );
  }

  const o = json as Record<string, unknown>;
  if (o.type === "calldata") {
    throw new HttpError(
      501,
      "This workflow returns unsigned calldata (write path). The gateway only supports executions that return an executionId.",
      "KEEPERHUB_CALLDATA_NOT_SUPPORTED"
    );
  }

  const executionId = o.executionId;
  if (typeof executionId !== "string" || !executionId) {
    throw new HttpError(
      502,
      "KeeperHub response did not include a string executionId.",
      "KEEPERHUB_INVALID_RESPONSE"
    );
  }

  return { executionId };
}

function extractErrorMessage(
  json: unknown,
  text: string,
  status: number
): string {
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    const err = o.error ?? o.message;
    if (typeof err === "string" && err.trim()) {
      return err.trim();
    }
  }
  const t = text.trim();
  if (t.length > 0 && t.length <= 800) {
    return t;
  }
  if (t.length > 800) {
    return `${t.slice(0, 800)}…`;
  }
  return `HTTP ${status}`;
}
