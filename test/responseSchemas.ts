import { z } from "zod";

export const workflowListSchema = z
  .array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  )
  .min(1);

export const healthOkSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
});

export const healthReadySchema = z.object({
  status: z.literal("ready"),
  service: z.string(),
  checks: z.object({
    x402PayeeConfigured: z.boolean(),
    settlementKeyConfigured: z.boolean(),
  }),
});

export const validationErrorBodySchema = z.object({
  error: z.string(),
  code: z.literal("VALIDATION_ERROR"),
  details: z.record(z.union([z.array(z.string()), z.string()])).optional(),
});

export const amountOutOfRangeSchema = z.object({
  error: z.string(),
  code: z.literal("AMOUNT_OUT_OF_RANGE"),
});

export const misconfiguredBodySchema = z.object({
  error: z.string(),
  code: z.literal("MISCONFIGURED"),
});

export const paymentRequiredSchema = z.object({
  x402Version: z.literal(2),
  error: z.string(),
  code: z.literal("PAYMENT_REQUIRED"),
  resource: z.object({ url: z.string() }),
  accepts: z.array(z.unknown()),
});

export const executeSuccessSchema = z.object({
  success: z.literal(true),
  workflowId: z.string(),
  executionId: z.string(),
  status: z.literal("submitted"),
  settlement: z.object({
    transactionHash: z.string(),
    network: z.literal("eip155:8453"),
  }),
});

export function parseJson<T>(
  body: unknown,
  schema: z.ZodType<T>,
): T {
  return schema.parse(body);
}
