import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { VerifiedSettlement } from "../src/services/x402";
import { loadTestAppWithServiceModules } from "./loadTestApp";
import { executeSuccessSchema, parseJson } from "./responseSchemas";

const PAY_TO = `0x${"a".repeat(40)}` as const;
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

function validExecuteBody() {
  return {
    chain: "algorand",
    protocol: "dorkfi",
    action: "repay",
    targetAddress: `0x${"b".repeat(40)}`,
    benefactorAddress: `0x${"c".repeat(40)}`,
    asset: "USDC",
    amount: "0.10",
    triggerData: {
      marketAppId: 12_345_678,
      assetId: 31_566_704,
      poolId: 12_345_679,
    },
  };
}

function validClaimlayerBody() {
  return {
    paymentAddress: `0x${"b".repeat(40)}`,
    targetAddress: `0x${"c".repeat(40)}`,
    chain: "eip155:8453",
    targetChain: "eip155:1",
    amount: "0.10",
  };
}

function mockVerified(): VerifiedSettlement {
  return {
    asset: USDC_BASE,
    from: `0x${"2".repeat(40)}`,
    to: PAY_TO,
    value: 100_000n,
    validAfter: 0n,
    validBefore: 9_999_999_999_999n,
    nonce: `0x${"0".repeat(64)}`,
    signature: `0x${"3".repeat(130)}`,
    nonceKey: "test-nonce-key",
  };
}

describe("POST /workflows/…/execute (mocked settlement + KeeperHub)", () => {
  let app: Express;
  let validateSpy: ReturnType<typeof vi.spyOn>;
  let settleSpy: ReturnType<typeof vi.spyOn>;
  let executeSpy: ReturnType<typeof vi.spyOn>;
  let recordSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const mod = await loadTestAppWithServiceModules({
      PORT: "3097",
      X402_RECEIVING_ADDRESS: PAY_TO,
      BASE_SETTLEMENT_PRIVATE_KEY: `0x${"1".repeat(64)}`,
      DEFAULT_KEEPERHUB_API_KEY: "test-keeperhub-key",
    });
    app = mod.app;
    validateSpy = vi
      .spyOn(mod.x402, "validateX402Payment")
      .mockResolvedValue({ ok: true, verified: mockVerified() });
    recordSpy = vi.spyOn(mod.x402, "recordSettlementNonce").mockImplementation(() => {});
    settleSpy = vi.spyOn(mod.usdcSettlement, "settleUsdcTransfer").mockResolvedValue({
      transactionHash: `0x${"d".repeat(64)}`,
    });
    executeSpy = vi
      .spyOn(mod.keeperhub, "executeKeeperHubWorkflow")
      .mockResolvedValue({ executionId: "exec-mocked-1" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 with executionId when payment and downstream calls succeed", async () => {
    const res = await request(app)
      .post("/workflows/simple-workflow/execute")
      .set("X-PAYMENT", "mock-payment-header")
      .send(validExecuteBody())
      .expect(200);

    const body = parseJson(res.body, executeSuccessSchema);
    expect(body.executionId).toBe("exec-mocked-1");
    expect(body.settlement.transactionHash).toBe(`0x${"d".repeat(64)}`);

    expect(validateSpy).toHaveBeenCalledTimes(1);
    expect(settleSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith("test-nonce-key");
  });

  it("returns 200 for og-paid-beta-signup using query params and forwards payer to KeeperHub", async () => {
    const q = new URLSearchParams({
      email: "user@example.com",
      discord: "u#1",
      network: "algorand",
      projectName: "demo",
      governanceToken: "ALGO",
      amount: "0.25",
    });
    const res = await request(app)
      .post(`/workflows/og-paid-beta-signup/execute?${q.toString()}`)
      .set("X-PAYMENT", "mock-payment-header")
      .send({})
      .expect(200);

    const body = parseJson(res.body, executeSuccessSchema);
    expect(body.workflowId).toBe("og-paid-beta-signup");
    expect(body.executionId).toBe("exec-mocked-1");

    expect(executeSpy).toHaveBeenCalledTimes(1);
    const call = executeSpy.mock.calls[0];
    expect(call?.[0]).toBe("og-paid-beta-signup");
    expect(call?.[2]).toBe("test-keeperhub-key");
    const khPayload = call?.[1] as {
      action: string;
      protocol: string;
      triggerData: { email: string; payerAddress: string };
    };
    expect(khPayload.action).toBe("og-paid-beta-signup");
    expect(khPayload.protocol).toBe("lendpay");
    expect(khPayload.triggerData.email).toBe("user@example.com");
    expect(khPayload.triggerData.payerAddress).toBe(`0x${"2".repeat(40)}`);
  });

  it("returns 200 for lendpay-paid-beta-signup using query params and forwards payer to KeeperHub", async () => {
    const algo58 = "C".repeat(58);
    const q = new URLSearchParams({
      email: "user@example.com",
      discord: "u#1",
      telegram: "@tg",
      baseAddress: `0x${"e".repeat(40)}`,
      algorandAddress: algo58,
      amount: "0.25",
    });
    const res = await request(app)
      .post(`/workflows/lendpay-paid-beta-signup/execute?${q.toString()}`)
      .set("X-PAYMENT", "mock-payment-header")
      .send({})
      .expect(200);

    const body = parseJson(res.body, executeSuccessSchema);
    expect(body.workflowId).toBe("lendpay-paid-beta-signup");
    expect(body.executionId).toBe("exec-mocked-1");

    expect(executeSpy).toHaveBeenCalledTimes(1);
    const call = executeSpy.mock.calls[0];
    expect(call?.[0]).toBe("lendpay-paid-beta-signup");
    expect(call?.[2]).toBe("test-keeperhub-key");
    const khPayload = call?.[1] as {
      action: string;
      protocol: string;
      chain: string;
      triggerData: {
        email: string;
        discord: string;
        telegram: string;
        algorandAddress: string;
        payerAddress: string;
      };
    };
    expect(khPayload.action).toBe("lendpay-paid-beta-signup");
    expect(khPayload.protocol).toBe("lendpay");
    expect(khPayload.chain).toBe("eip155:8453");
    expect(khPayload.triggerData.email).toBe("user@example.com");
    expect(khPayload.triggerData.discord).toBe("u#1");
    expect(khPayload.triggerData.telegram).toBe("@tg");
    expect(khPayload.triggerData.algorandAddress).toBe(algo58);
    expect(khPayload.triggerData.payerAddress).toBe(`0x${"2".repeat(40)}`);
  });

  it("returns 200 for claimlayer-paid-claimall with JSON body and KeeperHub ref", async () => {
    const res = await request(app)
      .post("/workflows/claimlayer-paid-claimall/execute")
      .set("X-PAYMENT", "mock-payment-header")
      .send(validClaimlayerBody())
      .expect(200);

    const body = parseJson(res.body, executeSuccessSchema);
    expect(body.workflowId).toBe("claimlayer-paid-claimall");
    expect(executeSpy).toHaveBeenCalledTimes(1);
    const call = executeSpy.mock.calls[0];
    expect(call?.[0]).toBe("claimlayer-paid-claimall");
    expect(call?.[2]).toBe("test-keeperhub-key");
    const khPayload = call?.[1] as {
      paymentAddress: string;
      targetAddress: string;
      chain: string;
      targetChain: string;
      amount: string;
      triggerData: {
        paymentAddress: string;
        targetAddress: string;
        chain: string;
        targetChain: string;
        amount: string;
      };
    };
    expect(khPayload.paymentAddress).toBe(`0x${"b".repeat(40)}`);
    expect(khPayload.targetAddress).toBe(`0x${"c".repeat(40)}`);
    expect(khPayload.chain).toBe("eip155:8453");
    expect(khPayload.targetChain).toBe("eip155:1");
    expect(khPayload.amount).toBe("100000");
    expect(khPayload.triggerData.paymentAddress).toBe(`0x${"b".repeat(40)}`);
    expect(khPayload.triggerData.targetAddress).toBe(`0x${"c".repeat(40)}`);
    expect(khPayload.triggerData.chain).toBe("eip155:8453");
    expect(khPayload.triggerData.targetChain).toBe("eip155:1");
    expect(khPayload.triggerData.amount).toBe("100000");
    expect(body.executionId).toBe("exec-mocked-1");
  });

  it("returns 200 for claimlayer-paid-claimall when only address is sent (maps to KeeperHub targetAddress)", async () => {
    const algoPay = `${"A".repeat(57)}2`;
    const algoRecipient = `${"B".repeat(57)}3`;
    const res = await request(app)
      .post("/workflows/claimlayer-paid-claimall/execute")
      .set("X-PAYMENT", "mock-payment-header")
      .send({
        paymentAddress: algoPay,
        address: algoRecipient,
        chain: "eip155:8453",
        targetChain: "voi:mainnet",
        amount: "0.10",
      })
      .expect(200);

    parseJson(res.body, executeSuccessSchema);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    const khPayload = executeSpy.mock.calls[0]?.[1] as {
      targetAddress: string;
      triggerData: { targetAddress: string };
    };
    expect(khPayload.targetAddress).toBe(algoRecipient);
    expect(khPayload.triggerData.targetAddress).toBe(algoRecipient);
  });

  it("prefers address over targetAddress for claimlayer-paid-claimall KeeperHub payload", async () => {
    const algoRecipient = `${"B".repeat(57)}3`;
    const evmOther = `0x${"c".repeat(40)}`;
    const res = await request(app)
      .post("/workflows/claimlayer-paid-claimall/execute")
      .set("X-PAYMENT", "mock-payment-header")
      .send({
        paymentAddress: `0x${"b".repeat(40)}`,
        address: algoRecipient,
        targetAddress: evmOther,
        chain: "eip155:8453",
        targetChain: "eip155:1",
        amount: "0.10",
      })
      .expect(200);

    parseJson(res.body, executeSuccessSchema);
    const khPayload = executeSpy.mock.calls[0]?.[1] as {
      targetAddress: string;
      triggerData: { targetAddress: string };
    };
    expect(khPayload.targetAddress).toBe(algoRecipient);
    expect(khPayload.triggerData.targetAddress).toBe(algoRecipient);
  });

  it("returns 200 for claimlayer-paid-claimall with Algorand paymentAddress and targetAddress", async () => {
    const algoA = `${"A".repeat(57)}2`;
    const algoB = `${"B".repeat(57)}3`;
    const res = await request(app)
      .post("/workflows/claimlayer-paid-claimall/execute")
      .set("X-PAYMENT", "mock-payment-header")
      .send({
        paymentAddress: algoA,
        targetAddress: algoB,
        chain: "eip155:8453",
        targetChain: "eip155:1",
        amount: "0.10",
      })
      .expect(200);

    const body = parseJson(res.body, executeSuccessSchema);
    expect(body.workflowId).toBe("claimlayer-paid-claimall");
    expect(executeSpy).toHaveBeenCalledTimes(1);
    const khPayload = executeSpy.mock.calls[0]?.[1] as {
      paymentAddress: string;
      targetAddress: string;
      triggerData: { paymentAddress: string; targetAddress: string };
    };
    expect(khPayload.paymentAddress).toBe(algoA);
    expect(khPayload.targetAddress).toBe(algoB);
    expect(khPayload.triggerData.paymentAddress).toBe(algoA);
    expect(khPayload.triggerData.targetAddress).toBe(algoB);
  });

  it("returns 200 for simple-workflow with Algorand targetAddress", async () => {
    const algo58 = `${"C".repeat(57)}4`;
    const res = await request(app)
      .post("/workflows/simple-workflow/execute")
      .set("X-PAYMENT", "mock-payment-header")
      .send({ ...validExecuteBody(), targetAddress: algo58 })
      .expect(200);

    const body = parseJson(res.body, executeSuccessSchema);
    expect(body.executionId).toBe("exec-mocked-1");
    const khPayload = executeSpy.mock.calls[0]?.[1] as {
      targetAddress: string;
      triggerData: { targetAddress: string };
    };
    expect(khPayload.targetAddress).toBe(algo58);
    expect(khPayload.triggerData.targetAddress).toBe(algo58);
  });
});
