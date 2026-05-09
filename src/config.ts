import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const hex40 = /^0x[a-fA-F0-9]{40}$/;
const hex64 = /^0x[a-fA-F0-9]{64}$/;

const EnvSchema = z
  .object({
    PORT: z.string().optional(),
    CORS_ORIGIN: z.string().optional(),
    KEEPERHUB_BASE_URL: z.string().optional(),
    DEFAULT_KEEPERHUB_API_KEY: z.string().optional(),
    KEEPERHUB_SIMPLE_WORKFLOW_ID: z.string().optional(),
    KEEPERHUB_SIMPLE_WORKFLOW_SLUG: z.string().optional(),
    KEEPERHUB_OG_BETA_SIGNUP_WORKFLOW_ID: z.string().optional(),
    KEEPERHUB_OG_BETA_SIGNUP_WORKFLOW_SLUG: z.string().optional(),
    KEEPERHUB_OG_PAID_BETA_SIGNUP_WORKFLOW_ID: z.string().optional(),
    KEEPERHUB_OG_PAID_BETA_SIGNUP_WORKFLOW_SLUG: z.string().optional(),
    KEEPERHUB_LENDPAY_PAID_BETA_SIGNUP_WORKFLOW_ID: z.string().optional(),
    KEEPERHUB_LENDPAY_PAID_BETA_SIGNUP_WORKFLOW_SLUG: z.string().optional(),
    KEEPERHUB_CLAIMLAYER_PAID_CLAIMALL_WORKFLOW_ID: z.string().optional(),
    KEEPERHUB_CLAIMLAYER_PAID_CLAIMALL_WORKFLOW_SLUG: z.string().optional(),
    X402_RECEIVING_ADDRESS: z.string().optional(),
    X402_NETWORK: z.string().optional(),
    BASE_RPC_URL: z.string().optional(),
    BASE_SETTLEMENT_PRIVATE_KEY: z.string().optional(),
    WORKFLOW_RATE_LIMIT_PER_MINUTE: z.string().optional(),
    LOG_LEVEL: z.string().optional(),
  })
  .transform((e) => {
    const portRaw = e.PORT?.trim() ?? "";
    const portParsed = parseInt(portRaw, 10);
    const port =
      portRaw === "" || !Number.isFinite(portParsed) || portParsed <= 0
        ? 3001
        : portParsed;

    const corsOriginRaw = (e.CORS_ORIGIN ?? "").trim();
    const corsOriginParts = corsOriginRaw
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    const corsAllowedOrigins =
      corsOriginParts.length > 0 ? corsOriginParts : null;

    const keeperHubBaseUrl =
      (e.KEEPERHUB_BASE_URL ?? "").trim() || "https://app.keeperhub.com";

    const keeperHubSimpleWorkflowRef =
      (e.KEEPERHUB_SIMPLE_WORKFLOW_ID ?? "").trim() ||
      (e.KEEPERHUB_SIMPLE_WORKFLOW_SLUG ?? "").trim() ||
      "simple-workflow";

    const keeperHubOgBetaSignupWorkflowRef =
      (e.KEEPERHUB_OG_BETA_SIGNUP_WORKFLOW_ID ?? "").trim() ||
      (e.KEEPERHUB_OG_BETA_SIGNUP_WORKFLOW_SLUG ?? "").trim() ||
      "og-beta-signup";

    const keeperHubOgPaidBetaSignupWorkflowRef =
      (e.KEEPERHUB_OG_PAID_BETA_SIGNUP_WORKFLOW_ID ?? "").trim() ||
      (e.KEEPERHUB_OG_PAID_BETA_SIGNUP_WORKFLOW_SLUG ?? "").trim() ||
      "og-paid-beta-signup";

    const keeperHubLendpayPaidBetaSignupWorkflowRef =
      (e.KEEPERHUB_LENDPAY_PAID_BETA_SIGNUP_WORKFLOW_ID ?? "").trim() ||
      (e.KEEPERHUB_LENDPAY_PAID_BETA_SIGNUP_WORKFLOW_SLUG ?? "").trim() ||
      "lendpay-paid-beta-signup";

    const keeperHubClaimlayerPaidClaimallRef =
      (e.KEEPERHUB_CLAIMLAYER_PAID_CLAIMALL_WORKFLOW_ID ?? "").trim() ||
      (e.KEEPERHUB_CLAIMLAYER_PAID_CLAIMALL_WORKFLOW_SLUG ?? "").trim() ||
      "claimlayer-paid-claimall";

    const baseRpcUrl =
      (e.BASE_RPC_URL ?? "").trim() || "https://mainnet.base.org";

    const rateRaw = (e.WORKFLOW_RATE_LIMIT_PER_MINUTE ?? "").trim();
    const rateParsed = parseInt(rateRaw, 10);
    const workflowRateLimitPerMinute =
      rateRaw !== "" && Number.isFinite(rateParsed) && rateParsed > 0
        ? rateParsed
        : null;

    return {
      port,
      corsAllowedOrigins,
      keeperHubBaseUrl,
      defaultKeeperHubApiKey: e.DEFAULT_KEEPERHUB_API_KEY ?? "",
      keeperHubSimpleWorkflowRef,
      keeperHubOgBetaSignupWorkflowRef,
      keeperHubOgPaidBetaSignupWorkflowRef,
      keeperHubLendpayPaidBetaSignupWorkflowRef,
      keeperHubClaimlayerPaidClaimallRef,
      x402ReceivingAddress: e.X402_RECEIVING_ADDRESS ?? "",
      x402Network: (e.X402_NETWORK ?? "").trim() || "base",
      baseRpcUrl,
      baseSettlementPrivateKey: e.BASE_SETTLEMENT_PRIVATE_KEY ?? "",
      workflowRateLimitPerMinute,
      logLevel: (e.LOG_LEVEL ?? "").trim() || "info",
    };
  });

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten());
  process.exit(1);
}

const c = parsed.data;

/** True when x402 payee address is a valid 20-byte hex string (execute path can return PAYMENT_REQUIRED). */
const x402PayeeConfigured = hex40.test(c.x402ReceivingAddress.trim());

/** True when relayer key format is valid (execute path can attempt settlement). */
const settlementKeyConfigured = hex64.test(c.baseSettlementPrivateKey.trim());

export const config = {
  port: c.port,
  corsAllowedOrigins: c.corsAllowedOrigins,
  keeperHubBaseUrl: c.keeperHubBaseUrl,
  defaultKeeperHubApiKey: c.defaultKeeperHubApiKey,
  keeperHubSimpleWorkflowRef: c.keeperHubSimpleWorkflowRef,
  keeperHubOgBetaSignupWorkflowRef: c.keeperHubOgBetaSignupWorkflowRef,
  keeperHubOgPaidBetaSignupWorkflowRef: c.keeperHubOgPaidBetaSignupWorkflowRef,
  keeperHubLendpayPaidBetaSignupWorkflowRef: c.keeperHubLendpayPaidBetaSignupWorkflowRef,
  keeperHubClaimlayerPaidClaimallRef: c.keeperHubClaimlayerPaidClaimallRef,
  x402ReceivingAddress: c.x402ReceivingAddress,
  x402Network: c.x402Network,
  baseRpcUrl: c.baseRpcUrl,
  baseSettlementPrivateKey: c.baseSettlementPrivateKey,
  /** Max POST `/workflows/.../execute` requests per IP per minute; `null` = no limit. */
  workflowRateLimitPerMinute: c.workflowRateLimitPerMinute,
  logLevel: c.logLevel,
} as const;

export const readiness = {
  x402PayeeConfigured,
  settlementKeyConfigured,
} as const;
