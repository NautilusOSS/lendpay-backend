import { z } from "zod";

function isEvmHexAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isAlgorandPublicAddress(value: string): boolean {
  return /^[A-Z2-7]{58}$/i.test(value);
}

function zEvmOrAlgorandAddress(fieldName: string) {
  return z
    .string()
    .min(1, `${fieldName} is required`)
    .refine((v) => isEvmHexAddress(v) || isAlgorandPublicAddress(v), {
      message: `${fieldName} must be a 0x-prefixed EVM address (20 bytes) or a 58-character Algorand public address`,
    });
}

const positiveAppId = z
  .number()
  .int()
  .positive()
  .refine((n) => Number.isSafeInteger(n), { message: "must be a safe integer" });

/** DorkFi ids from the client; gateway merges into full KeeperHub `triggerData`. */
export const dorkfiRepayTriggerDataSchema = z.object({
  marketAppId: positiveAppId,
  assetId: positiveAppId,
  poolId: positiveAppId,
  underlyingAssetId: positiveAppId.optional(),
});

export const executeWorkflowBodySchema = z.object({
  chain: z.string().min(1, "chain is required"),
  protocol: z.string().min(1, "protocol is required"),
  action: z.string().min(1, "action is required"),
  targetAddress: zEvmOrAlgorandAddress("targetAddress"),
  benefactorAddress: zEvmOrAlgorandAddress("benefactorAddress"),
  asset: z.string().min(1, "asset is required"),
  /** USD decimal for gateway x402 bounds + payment; merged into `triggerData.amount` as USDC micro units for KeeperHub. */
  amount: z.string().min(1, "amount is required"),
  /** DorkFi app / ASA ids; gateway merges with settlement fields into KeeperHub `triggerData`. */
  triggerData: dorkfiRepayTriggerDataSchema,
  /** Ignored: gateway sets `triggerData.txid` from the settlement tx after payment. */
  txid: z.string().min(1).optional(),
});

export type ExecuteWorkflowBodyInput = z.infer<typeof executeWorkflowBodySchema>;

/** OG beta signup: paid amount (USD string) plus signup fields; settlement fills `txid` / micro `amount` on the wire. */
export const ogBetaSignupExecuteBodySchema = z.object({
  email: z.string().trim().email("email must be a valid address"),
  discord: z.string().trim().min(1, "discord is required"),
  network: z.string().trim().min(1, "network is required"),
  projectName: z.string().trim().min(1, "projectName is required"),
  governanceToken: z.string().trim().min(1, "governanceToken is required"),
  amount: z.string().min(1, "amount is required"),
});

export type OgBetaSignupExecuteBodyInput = z.infer<
  typeof ogBetaSignupExecuteBodySchema
>;

/**
 * OG paid beta signup: same signup fields as {@link ogBetaSignupExecuteBodySchema}, but supplied as
 * URL query parameters so they are part of the x402 `resource.url` (no JSON body `amount` check).
 */
export const ogPaidBetaSignupQuerySchema = z.object({
  email: z.string().trim().email("email must be a valid address"),
  discord: z.string().trim().min(1, "discord is required"),
  network: z.string().trim().min(1, "network is required"),
  projectName: z.string().trim().min(1, "projectName is required"),
  governanceToken: z.string().trim().min(1, "governanceToken is required"),
  amount: z.string().min(1, "amount is required"),
});

export type OgPaidBetaSignupQueryInput = z.infer<typeof ogPaidBetaSignupQuerySchema>;

/**
 * Lendpay paid beta signup: query parameters bind to the x402 `resource.url` (same pattern as
 * {@link ogPaidBetaSignupQuerySchema}).
 */
export const lendpayPaidBetaSignupQuerySchema = z.object({
  email: z.string().trim().email("email must be a valid address"),
  discord: z.string().trim().min(1, "discord is required"),
  telegram: z.string().trim().min(1, "telegram is required"),
  baseAddress: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, "baseAddress must be a valid 0x-prefixed address"),
  algorandAddress: z
    .string()
    .trim()
    .min(1, "algorandAddress is required")
    .refine((v) => isAlgorandPublicAddress(v), {
      message: "algorandAddress must be a 58-character Algorand public address",
    }),
  amount: z.string().min(1, "amount is required"),
});

export type LendpayPaidBetaSignupQueryInput = z.infer<
  typeof lendpayPaidBetaSignupQuerySchema
>;

export const claimlayerPaidClaimallBodySchema = z
  .object({
    paymentAddress: zEvmOrAlgorandAddress("paymentAddress"),
    targetAddress: zEvmOrAlgorandAddress("targetAddress").optional(),
    /**
     * Optional recipient (e.g. Algorand public address from the client). When set, the gateway
     * sends this value to KeeperHub as `targetAddress` (and prefers it over body `targetAddress`).
     */
    address: zEvmOrAlgorandAddress("address").optional(),
    chain: z.string().min(1, "chain is required"),
    targetChain: z.string().min(1, "targetChain is required"),
    /** USD decimal for gateway x402 bounds + payment; sent to KeeperHub as USDC micro units. */
    amount: z.string().min(1, "amount is required"),
    /** Ignored: gateway sets settlement `txid` after payment. */
    txid: z.string().min(1).optional(),
  })
  .refine((d) => d.address !== undefined || d.targetAddress !== undefined, {
    message: "Either address or targetAddress is required",
    path: ["address"],
  })
  .transform((d) => ({
    ...d,
    targetAddress: (d.address ?? d.targetAddress)!,
  }));

export type ClaimlayerPaidClaimallBodyInput = z.infer<
  typeof claimlayerPaidClaimallBodySchema
>;
