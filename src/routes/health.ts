import { Router } from "express";
import { readiness } from "../config";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok", service: "paid-workflow-gateway" });
});

/**
 * Readiness for operators / App Runner: reports whether execute-path env is present.
 * Always returns **200**; use `checks` when deciding whether to route traffic or show warnings.
 */
healthRouter.get("/ready", (_req, res) => {
  res.json({
    status: "ready",
    service: "paid-workflow-gateway",
    checks: {
      x402PayeeConfigured: readiness.x402PayeeConfigured,
      settlementKeyConfigured: readiness.settlementKeyConfigured,
    },
  });
});
