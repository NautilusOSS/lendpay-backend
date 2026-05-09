import { Router } from "express";
import { getAddress } from "viem";
import { config } from "../config";
import {
  claimlayerPaidClaimallBodySchema,
  executeWorkflowBodySchema,
  lendpayPaidBetaSignupQuerySchema,
  ogBetaSignupExecuteBodySchema,
  ogPaidBetaSignupQuerySchema,
} from "../schemas/workflow";
import {
  recordSettlementNonce,
  validateX402Payment,
} from "../services/x402";
import { settleUsdcTransfer } from "../services/usdcSettlement";
import { resolveKeeperHubApiKey } from "../services/auth";
import { executeKeeperHubWorkflow } from "../services/keeperhub";
import type {
  ClaimlayerPaidClaimallBodyInput,
  ExecuteWorkflowBodyInput,
  LendpayPaidBetaSignupQueryInput,
  OgBetaSignupExecuteBodyInput,
  OgPaidBetaSignupQueryInput,
} from "../schemas/workflow";
import type {
  ClaimlayerClaimAllExecuteBody,
  ExecuteWorkflowBody,
  LendpayPaidBetaSignupExecuteBody,
  OgBetaSignupExecuteBody,
  OgPaidBetaSignupExecuteBody,
  WorkflowDefinition,
} from "../types/workflow";
import { publicResourceUrlFromRequest } from "../util/resourceUrl";
import { resolveGatewayPaymentAmount } from "../util/usdcAmount";

/** Base mainnet USDC — must match x402 `ExactEvmScheme` / client (`eip155:8453`). */
const BASE_MAINNET_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/**
 * EIP-712 domain for Circle USDC `transferWithAuthorization` (EIP-3009). Required by `@x402/evm`
 * `ExactEvmScheme` in `accepts[].extra` — see `signEIP3009Authorization`.
 */
const USDC_EIP712_DOMAIN = {
  name: "USD Coin",
  version: "2",
} as const;

const SIMPLE_WORKFLOW: WorkflowDefinition = {
  id: "simple-workflow",
  name: "Simple Workflow",
  description:
    "Listed slug on KeeperHub. The gateway POST body uses `triggerData` with settlement `txid`, paid `amount` (USDC micro units), timestamps, addresses, and DorkFi ids from the client `triggerData` subset.",
  paymentMinUsd: "0.01",
  paymentMaxUsd: "1.00",
  requiredFields: [
    "chain",
    "protocol",
    "action",
    "targetAddress",
    "benefactorAddress",
    "asset",
    "amount",
    "triggerData",
  ],
};

const OG_BETA_SIGNUP_WORKFLOW: WorkflowDefinition = {
  id: "og-beta-signup",
  name: "OG Beta Signup",
  description:
    "KeeperHub signup workflow. POST body: `email`, `discord`, `network`, `projectName`, `governanceToken`, and `amount` (USD for x402). Settlement merges into `triggerData`.",
  paymentMinUsd: "0.01",
  paymentMaxUsd: "0.01",
  requiredFields: [
    "email",
    "discord",
    "network",
    "projectName",
    "governanceToken",
    "amount",
  ],
};

const OG_PAID_BETA_SIGNUP_WORKFLOW: WorkflowDefinition = {
  id: "og-paid-beta-signup",
  name: "OG Paid Beta Signup",
  description:
    "KeeperHub signup workflow (variable USDC x402). Pass `email`, `discord`, `network`, `projectName`, `governanceToken`, and `amount` (USD) as **URL query** parameters so they bind to the x402 `resource.url`. The payer’s EVM address comes from the verified x402 payment (`authorization.from`). JSON body is ignored.",
  paymentMinUsd: "0.01",
  paymentMaxUsd: "1.00",
  requiredFields: [
    "email (query)",
    "discord (query)",
    "network (query)",
    "projectName (query)",
    "governanceToken (query)",
    "amount (query, USD)",
  ],
};

const LENDPAY_PAID_BETA_SIGNUP_WORKFLOW: WorkflowDefinition = {
  id: "lendpay-paid-beta-signup",
  name: "Lendpay Paid Beta Signup",
  description:
    "KeeperHub signup workflow (variable USDC x402 on Base). Pass `email`, `discord`, `telegram`, `baseAddress`, `algorandAddress`, and `amount` (USD) as **URL query** parameters so they bind to the x402 `resource.url`. The payer’s EVM address comes from the verified x402 payment (`authorization.from`). JSON body is ignored.",
  paymentMinUsd: "0.01",
  paymentMaxUsd: "1.00",
  requiredFields: [
    "email (query)",
    "discord (query)",
    "telegram (query)",
    "baseAddress (query)",
    "algorandAddress (query)",
    "amount (query, USD)",
  ],
};

const CLAIMLAYER_PAID_CLAIMALL_WORKFLOW: WorkflowDefinition = {
  id: "claimlayer-paid-claimall",
  name: "Claimlayer Paid Claim All",
  description:
    "KeeperHub listed workflow `claimlayer-paid-claimall`. Gateway JSON body: `paymentAddress`, `chain`, `targetChain`, and `amount` (USD decimal within bounds). Pass recipient as `address` (e.g. Algorand) and/or `targetAddress` (EVM or Algorand); if `address` is set it is sent to KeeperHub as `targetAddress`. Gateway merges settlement `txid` and USDC micro units into the KeeperHub payload.",
  paymentMinUsd: "0.01",
  paymentMaxUsd: "1.00",
  requiredFields: [
    "paymentAddress",
    "address or targetAddress",
    "chain",
    "targetChain",
    "amount",
  ],
};

const WORKFLOW_BY_ID: Record<string, WorkflowDefinition> = {
  [SIMPLE_WORKFLOW.id]: SIMPLE_WORKFLOW,
  [OG_BETA_SIGNUP_WORKFLOW.id]: OG_BETA_SIGNUP_WORKFLOW,
  [OG_PAID_BETA_SIGNUP_WORKFLOW.id]: OG_PAID_BETA_SIGNUP_WORKFLOW,
  [LENDPAY_PAID_BETA_SIGNUP_WORKFLOW.id]: LENDPAY_PAID_BETA_SIGNUP_WORKFLOW,
  [CLAIMLAYER_PAID_CLAIMALL_WORKFLOW.id]: CLAIMLAYER_PAID_CLAIMALL_WORKFLOW,
};

/** Placeholder root addresses when the KeeperHub template only reads `triggerData`. */
const PLACEHOLDER_EVM_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

function keeperHubRefForWorkflowId(workflowId: string): string {
  switch (workflowId) {
    case "simple-workflow":
      return config.keeperHubSimpleWorkflowRef;
    case "og-beta-signup":
      return config.keeperHubOgBetaSignupWorkflowRef;
    case "og-paid-beta-signup":
      return config.keeperHubOgPaidBetaSignupWorkflowRef;
    case "lendpay-paid-beta-signup":
      return config.keeperHubLendpayPaidBetaSignupWorkflowRef;
    case "claimlayer-paid-claimall":
      return config.keeperHubClaimlayerPaidClaimallRef;
    default:
      return "";
  }
}

function buildKeeperHubExecuteBody(
  parsed: ExecuteWorkflowBodyInput,
  settlementTx: `0x${string}`,
  paymentMicroUnits: string,
): ExecuteWorkflowBody {
  const ext = parsed.triggerData;
  const now = Date.now();
  const triggeredAt = new Date(now).toISOString();
  const triggerData: ExecuteWorkflowBody["triggerData"] = {
    txid: settlementTx,
    asset: parsed.asset,
    chain: parsed.chain,
    action: parsed.action,
    amount: paymentMicroUnits,
    protocol: parsed.protocol,
    timestamp: now,
    triggered: true,
    poolId: ext.poolId,
    assetId: ext.assetId,
    marketAppId: ext.marketAppId,
    triggeredAt,
    targetAddress: parsed.targetAddress,
    benefactorAddress: parsed.benefactorAddress,
  };
  if (ext.underlyingAssetId !== undefined) {
    triggerData.underlyingAssetId = ext.underlyingAssetId;
  }
  return {
    txid: settlementTx,
    chain: parsed.chain,
    protocol: parsed.protocol,
    action: parsed.action,
    targetAddress: parsed.targetAddress,
    benefactorAddress: parsed.benefactorAddress,
    asset: parsed.asset,
    amount: paymentMicroUnits,
    triggerData,
  };
}

function queryObjectFromRequest(originalUrl: string): Record<string, string> {
  const q = originalUrl.indexOf("?");
  if (q < 0) {
    return {};
  }
  return Object.fromEntries(
    new URLSearchParams(originalUrl.slice(q + 1)).entries(),
  );
}

function buildLendpayPaidBetaSignupKeeperHubBody(
  parsed: LendpayPaidBetaSignupQueryInput,
  settlementTx: `0x${string}`,
  paymentMicroUnits: string,
  payer: `0x${string}`,
): LendpayPaidBetaSignupExecuteBody {
  const now = Date.now();
  const triggeredAt = new Date(now).toISOString();
  const payerNorm = getAddress(payer);
  const baseNorm = getAddress(parsed.baseAddress);
  return {
    txid: settlementTx,
    chain: "eip155:8453",
    protocol: "lendpay",
    action: "lendpay-paid-beta-signup",
    targetAddress: payerNorm,
    benefactorAddress: payerNorm,
    asset: BASE_MAINNET_USDC,
    amount: paymentMicroUnits,
    triggerData: {
      txid: settlementTx,
      amount: paymentMicroUnits,
      timestamp: now,
      triggered: true,
      triggeredAt,
      email: parsed.email,
      discord: parsed.discord,
      telegram: parsed.telegram,
      baseAddress: baseNorm,
      algorandAddress: parsed.algorandAddress,
      payerAddress: payerNorm,
    },
  };
}

function buildOgPaidBetaSignupKeeperHubBody(
  parsed: OgPaidBetaSignupQueryInput,
  settlementTx: `0x${string}`,
  paymentMicroUnits: string,
  payer: `0x${string}`,
): OgPaidBetaSignupExecuteBody {
  const now = Date.now();
  const triggeredAt = new Date(now).toISOString();
  const payerNorm = getAddress(payer);
  return {
    txid: settlementTx,
    chain: parsed.network,
    protocol: "lendpay",
    action: "og-paid-beta-signup",
    targetAddress: payerNorm,
    benefactorAddress: payerNorm,
    asset: BASE_MAINNET_USDC,
    amount: paymentMicroUnits,
    triggerData: {
      txid: settlementTx,
      amount: paymentMicroUnits,
      timestamp: now,
      triggered: true,
      triggeredAt,
      email: parsed.email,
      discord: parsed.discord,
      network: parsed.network,
      projectName: parsed.projectName,
      governanceToken: parsed.governanceToken,
      payerAddress: payerNorm,
    },
  };
}

function buildOgBetaSignupKeeperHubBody(
  parsed: OgBetaSignupExecuteBodyInput,
  settlementTx: `0x${string}`,
  paymentMicroUnits: string,
): OgBetaSignupExecuteBody {
  const now = Date.now();
  const triggeredAt = new Date(now).toISOString();
  return {
    txid: settlementTx,
    chain: parsed.network,
    protocol: "lendpay",
    action: "og-beta-signup",
    targetAddress: PLACEHOLDER_EVM_ADDRESS,
    benefactorAddress: PLACEHOLDER_EVM_ADDRESS,
    asset: BASE_MAINNET_USDC,
    amount: paymentMicroUnits,
    triggerData: {
      txid: settlementTx,
      amount: paymentMicroUnits,
      timestamp: now,
      triggered: true,
      triggeredAt,
      email: parsed.email,
      discord: parsed.discord,
      network: parsed.network,
      projectName: parsed.projectName,
      governanceToken: parsed.governanceToken,
    },
  };
}

function buildClaimlayerKeeperHubExecuteBody(
  parsed: ClaimlayerPaidClaimallBodyInput,
  settlementTx: `0x${string}`,
  paymentMicroUnits: string,
): ClaimlayerClaimAllExecuteBody {
  const now = Date.now();
  const triggeredAt = new Date(now).toISOString();
  const triggerData: ClaimlayerClaimAllExecuteBody["triggerData"] = {
    txid: settlementTx,
    paymentAddress: parsed.paymentAddress,
    targetAddress: parsed.targetAddress,
    chain: parsed.chain,
    targetChain: parsed.targetChain,
    amount: paymentMicroUnits,
    timestamp: now,
    triggered: true,
    triggeredAt,
  };
  return {
    txid: settlementTx,
    paymentAddress: parsed.paymentAddress,
    targetAddress: parsed.targetAddress,
    chain: parsed.chain,
    targetChain: parsed.targetChain,
    amount: paymentMicroUnits,
    triggerData,
  };
}

export const workflowsRouter = Router();

workflowsRouter.get("/", (_req, res) => {
  res.json([
    SIMPLE_WORKFLOW,
    OG_BETA_SIGNUP_WORKFLOW,
    OG_PAID_BETA_SIGNUP_WORKFLOW,
    LENDPAY_PAID_BETA_SIGNUP_WORKFLOW,
    CLAIMLAYER_PAID_CLAIMALL_WORKFLOW,
  ]);
});

workflowsRouter.post("/:workflowId/execute", async (req, res, next) => {
  try {
    const workflowId = req.params.workflowId?.trim();
    const workflow = workflowId ? WORKFLOW_BY_ID[workflowId] : undefined;
    if (!workflow) {
      res.status(404).json({
        error: `Unknown workflow: ${workflowId ?? ""}`,
        code: "WORKFLOW_NOT_FOUND",
      });
      return;
    }

    type ExecuteParsed =
      | { ok: true; variant: "simple"; data: ExecuteWorkflowBodyInput }
      | { ok: true; variant: "og-beta"; data: OgBetaSignupExecuteBodyInput }
      | { ok: true; variant: "og-paid-beta"; data: OgPaidBetaSignupQueryInput }
      | { ok: true; variant: "lendpay-paid-beta"; data: LendpayPaidBetaSignupQueryInput }
      | { ok: true; variant: "claimlayer"; data: ClaimlayerPaidClaimallBodyInput }
      | { ok: false; error: import("zod").ZodError };

    const parsedExecute: ExecuteParsed = (() => {
      if (workflow.id === "simple-workflow") {
        const r = executeWorkflowBodySchema.safeParse(req.body);
        return r.success
          ? { ok: true, variant: "simple", data: r.data }
          : { ok: false, error: r.error };
      }
      if (workflow.id === "og-beta-signup") {
        const r = ogBetaSignupExecuteBodySchema.safeParse(req.body);
        return r.success
          ? { ok: true, variant: "og-beta", data: r.data }
          : { ok: false, error: r.error };
      }
      if (workflow.id === "og-paid-beta-signup") {
        const r = ogPaidBetaSignupQuerySchema.safeParse(
          queryObjectFromRequest(req.originalUrl),
        );
        return r.success
          ? { ok: true, variant: "og-paid-beta", data: r.data }
          : { ok: false, error: r.error };
      }
      if (workflow.id === "lendpay-paid-beta-signup") {
        const r = lendpayPaidBetaSignupQuerySchema.safeParse(
          queryObjectFromRequest(req.originalUrl),
        );
        return r.success
          ? { ok: true, variant: "lendpay-paid-beta", data: r.data }
          : { ok: false, error: r.error };
      }
      if (workflow.id === "claimlayer-paid-claimall") {
        const r = claimlayerPaidClaimallBodySchema.safeParse(req.body);
        return r.success
          ? { ok: true, variant: "claimlayer", data: r.data }
          : { ok: false, error: r.error };
      }
      throw new Error(`Unhandled workflow: ${workflow.id}`);
    })();

    if (!parsedExecute.ok) {
      const issues = parsedExecute.error.flatten();
      res.status(400).json({
        error:
          workflow.id === "og-paid-beta-signup" ||
          workflow.id === "lendpay-paid-beta-signup"
            ? "Invalid query parameters"
            : "Invalid request body",
        code: "VALIDATION_ERROR",
        details: issues.fieldErrors,
      });
      return;
    }

    const resolvedPayment = resolveGatewayPaymentAmount(parsedExecute.data.amount, {
      paymentMinUsd: workflow.paymentMinUsd,
      paymentMaxUsd: workflow.paymentMaxUsd,
    });
    if (!resolvedPayment.ok) {
      res.status(400).json({
        error: resolvedPayment.message,
        code: resolvedPayment.code ?? "INVALID_PAYMENT_AMOUNT",
      });
      return;
    }

    const paymentMicroUnits = resolvedPayment.microUnits;

    const resourceUrl =
      parsedExecute.variant === "og-paid-beta" ||
      parsedExecute.variant === "lendpay-paid-beta"
        ? publicResourceUrlFromRequest(req, { includeSortedQuery: true })
        : publicResourceUrlFromRequest(req);

    const paymentHeader =
      req.header("X-PAYMENT")?.trim() ||
      req.header("PAYMENT-SIGNATURE")?.trim();
    if (!paymentHeader) {
      const payTo = config.x402ReceivingAddress.trim();
      if (!payTo || !/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
        res.status(503).json({
          error:
            "Gateway misconfigured: set X402_RECEIVING_ADDRESS (0x + 40 hex) for x402 payment challenges.",
          code: "MISCONFIGURED",
        });
        return;
      }

      res.status(400).json({
        x402Version: 2,
        error: "Missing X-PAYMENT header",
        code: "PAYMENT_REQUIRED",
        resource: { url: resourceUrl },
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453",
            amount: paymentMicroUnits,
            asset: BASE_MAINNET_USDC,
            payTo: payTo as `0x${string}`,
            maxTimeoutSeconds: 600,
            extra: {
              ...USDC_EIP712_DOMAIN,
            } as Record<string, unknown>,
          },
        ],
        extensions: null,
      });
      return;
    }

    const paymentResult = await validateX402Payment(paymentHeader, {
      expectedAmountMinUnits: paymentMicroUnits,
      bodyAmountField:
        parsedExecute.variant === "og-paid-beta" ||
        parsedExecute.variant === "lendpay-paid-beta"
          ? undefined
          : parsedExecute.data.amount,
      payTo: config.x402ReceivingAddress.trim(),
      asset: BASE_MAINNET_USDC,
      resourceUrl,
    });
    if (!paymentResult.ok) {
      res.status(402).json({
        error: paymentResult.message,
        code: "PAYMENT_INVALID",
      });
      return;
    }

    const pk = config.baseSettlementPrivateKey.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(pk)) {
      res.status(503).json({
        error:
          "Settlement misconfigured: set BASE_SETTLEMENT_PRIVATE_KEY (0x + 64 hex relayer key with ETH on Base for gas).",
        code: "SETTLEMENT_MISCONFIGURED",
      });
      return;
    }

    let settlementTx: `0x${string}`;
    try {
      const settled = await settleUsdcTransfer({
        settlement: paymentResult.verified,
        rpcUrl: config.baseRpcUrl,
        relayerPrivateKey: pk as `0x${string}`,
      });
      settlementTx = settled.transactionHash;
      recordSettlementNonce(paymentResult.verified.nonceKey);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(502).json({
        error: `USDC settlement failed: ${msg}`,
        code: "SETTLEMENT_FAILED",
      });
      return;
    }

    const keeperHubApiKey = resolveKeeperHubApiKey(req.header("authorization"));
    const keeperHubRef = keeperHubRefForWorkflowId(workflow.id);
    if (!keeperHubRef.trim()) {
      res.status(503).json({
        error: "Gateway misconfigured: KeeperHub workflow reference is empty.",
        code: "MISCONFIGURED",
      });
      return;
    }

    const khBody =
      parsedExecute.variant === "simple"
        ? buildKeeperHubExecuteBody(
            parsedExecute.data,
            settlementTx,
            paymentMicroUnits,
          )
        : parsedExecute.variant === "og-beta"
          ? buildOgBetaSignupKeeperHubBody(
              parsedExecute.data,
              settlementTx,
              paymentMicroUnits,
            )
          : parsedExecute.variant === "og-paid-beta"
            ? buildOgPaidBetaSignupKeeperHubBody(
                parsedExecute.data,
                settlementTx,
                paymentMicroUnits,
                paymentResult.verified.from,
              )
            : parsedExecute.variant === "lendpay-paid-beta"
              ? buildLendpayPaidBetaSignupKeeperHubBody(
                  parsedExecute.data,
                  settlementTx,
                  paymentMicroUnits,
                  paymentResult.verified.from,
                )
              : buildClaimlayerKeeperHubExecuteBody(
                  parsedExecute.data,
                  settlementTx,
                  paymentMicroUnits,
                );
    const { executionId } = await executeKeeperHubWorkflow(
      keeperHubRef,
      khBody,
      keeperHubApiKey
    );

    res.status(200).json({
      success: true,
      workflowId: workflow.id,
      executionId,
      status: "submitted" as const,
      settlement: {
        transactionHash: settlementTx,
        network: "eip155:8453" as const,
      },
    });
  } catch (err) {
    next(err);
  }
});
