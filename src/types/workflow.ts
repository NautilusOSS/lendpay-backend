export interface WorkflowDefinition {
  id: string;
  /** Listed slug on KeeperHub if different from `id` (defaults to `id` when calling the API). */
  keeperHubSlug?: string;
  name: string;
  description: string;
  /** Inclusive USD bounds for gateway x402 — body `amount` must parse within this range and match payment. */
  paymentMinUsd: string;
  paymentMaxUsd: string;
  requiredFields: string[];
}

/** DorkFi ids supplied on the gateway HTTP body under `triggerData` (subset before merge). */
export type DorkfiRepayTriggerData = {
  marketAppId: number;
  assetId: number;
  poolId: number;
  underlyingAssetId?: number;
};

/**
 * Full `triggerData` sent to KeeperHub `POST …/api/mcp/workflows/…/call`
 * (gateway merges settlement + request fields).
 */
export type KeeperHubRepayTriggerData = {
  txid: string;
  asset: string;
  chain: string;
  action: string;
  /** Settled USDC amount in minimum units (string), e.g. `"100000"`. */
  amount: string;
  protocol: string;
  timestamp: number;
  triggered: boolean;
  poolId: number;
  assetId: number;
  marketAppId: number;
  underlyingAssetId?: number;
  triggeredAt: string;
  targetAddress: string;
  benefactorAddress: string;
};

/** `triggerData` for KeeperHub `claimlayer-paid-claimall` (gateway merges settlement fields). */
export type KeeperHubClaimlayerClaimallTriggerData = {
  txid: string;
  paymentAddress: string;
  targetAddress: string;
  chain: string;
  targetChain: string;
  amount: string;
  timestamp: number;
  triggered: boolean;
  triggeredAt: string;
};

/**
 * JSON body for KeeperHub `claimlayer-paid-claimall` call (root + `triggerData` for bindings).
 */
export interface ClaimlayerClaimAllExecuteBody {
  txid: string;
  paymentAddress: string;
  targetAddress: string;
  chain: string;
  targetChain: string;
  amount: string;
  triggerData: KeeperHubClaimlayerClaimallTriggerData;
}

/**
 * JSON body for KeeperHub workflow call.
 * **Root fields** (`txid`, `amount`, `chain`, …) match the legacy spread gateway body so
 * workflow bindings like `data.amount` resolve; `triggerData` still carries the full merged payload.
 */
export interface ExecuteWorkflowBody {
  txid: string;
  chain: string;
  protocol: string;
  action: string;
  targetAddress: string;
  benefactorAddress: string;
  asset: string;
  /** Settled USDC in minimum units (string), same as x402 settlement. */
  amount: string;
  triggerData: KeeperHubRepayTriggerData;
}

/** `triggerData` for KeeperHub `og-beta-signup` (gateway merges settlement + signup fields). */
export type OgBetaSignupTriggerData = {
  txid: string;
  amount: string;
  timestamp: number;
  triggered: boolean;
  triggeredAt: string;
  email: string;
  discord: string;
  network: string;
  projectName: string;
  governanceToken: string;
};

/** `triggerData` for KeeperHub `og-paid-beta-signup` (adds payer from x402 authorization). */
export type OgPaidBetaSignupTriggerData = OgBetaSignupTriggerData & {
  payerAddress: string;
};

/** JSON body for KeeperHub OG beta signup workflow call (same root shape as repay for binding compatibility). */
export interface OgBetaSignupExecuteBody {
  txid: string;
  chain: string;
  protocol: string;
  action: string;
  targetAddress: string;
  benefactorAddress: string;
  asset: string;
  amount: string;
  triggerData: OgBetaSignupTriggerData;
}

/** KeeperHub call body for `og-paid-beta-signup` (payer in `triggerData` + root addresses). */
export interface OgPaidBetaSignupExecuteBody {
  txid: string;
  chain: string;
  protocol: string;
  action: string;
  targetAddress: string;
  benefactorAddress: string;
  asset: string;
  amount: string;
  triggerData: OgPaidBetaSignupTriggerData;
}

/** `triggerData` for KeeperHub `lendpay-paid-beta-signup` (payer from x402 + signup fields). */
export type LendpayPaidBetaSignupTriggerData = {
  txid: string;
  amount: string;
  timestamp: number;
  triggered: boolean;
  triggeredAt: string;
  email: string;
  discord: string;
  telegram: string;
  baseAddress: string;
  algorandAddress: string;
  payerAddress: string;
};

/** KeeperHub call body for `lendpay-paid-beta-signup`. */
export interface LendpayPaidBetaSignupExecuteBody {
  txid: string;
  chain: string;
  protocol: string;
  action: string;
  targetAddress: string;
  benefactorAddress: string;
  asset: string;
  amount: string;
  triggerData: LendpayPaidBetaSignupTriggerData;
}

/** Payload accepted by `POST …/api/mcp/workflows/{slug}/call` for supported gateway workflows. */
export type KeeperHubWorkflowCallBody =
  | ExecuteWorkflowBody
  | OgBetaSignupExecuteBody
  | OgPaidBetaSignupExecuteBody
  | LendpayPaidBetaSignupExecuteBody
  | ClaimlayerClaimAllExecuteBody;

export interface ExecuteWorkflowResponse {
  success: true;
  workflowId: string;
  executionId: string;
  status: "submitted";
  settlement?: {
    transactionHash: string;
    network: "eip155:8453";
  };
}
