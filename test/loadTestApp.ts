import type { Express } from "express";
import { vi } from "vitest";

export async function loadTestApp(
  env: Record<string, string> = {},
): Promise<Express> {
  vi.resetModules();
  const merged = { LOG_LEVEL: "silent", ...env };
  for (const [key, value] of Object.entries(merged)) {
    process.env[key] = value;
  }
  const mod = await import("../src/server.js");
  return mod.app;
}

export async function loadTestAppWithServiceModules(
  env: Record<string, string> = {},
): Promise<{
  app: Express;
  x402: typeof import("../src/services/x402.js");
  usdcSettlement: typeof import("../src/services/usdcSettlement.js");
  keeperhub: typeof import("../src/services/keeperhub.js");
}> {
  vi.resetModules();
  const merged = { LOG_LEVEL: "silent", ...env };
  for (const [key, value] of Object.entries(merged)) {
    process.env[key] = value;
  }
  const { app } = await import("../src/server.js");
  const x402 = await import("../src/services/x402.js");
  const usdcSettlement = await import("../src/services/usdcSettlement.js");
  const keeperhub = await import("../src/services/keeperhub.js");
  return { app, x402, usdcSettlement, keeperhub };
}
