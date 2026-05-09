import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { loadTestApp } from "./loadTestApp";
import {
  amountOutOfRangeSchema,
  healthOkSchema,
  healthReadySchema,
  misconfiguredBodySchema,
  parseJson,
  paymentRequiredSchema,
  validationErrorBodySchema,
  workflowListSchema,
} from "./responseSchemas";

const PAY_TO = `0x${"a".repeat(40)}`;

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

describe("HTTP gateway", () => {
  let app: Express;

  beforeEach(async () => {
    app = await loadTestApp({
      PORT: "3099",
      X402_RECEIVING_ADDRESS: PAY_TO,
      BASE_SETTLEMENT_PRIVATE_KEY: `0x${"1".repeat(64)}`,
    });
  });

  it("GET /health returns ok payload", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(parseJson(res.body, healthOkSchema)).toEqual({
      status: "ok",
      service: "paid-workflow-gateway",
    });
  });

  it("GET /health/ready returns checks object", async () => {
    const res = await request(app).get("/health/ready").expect(200);
    const body = parseJson(res.body, healthReadySchema);
    expect(body.checks.x402PayeeConfigured).toBe(true);
    expect(body.checks.settlementKeyConfigured).toBe(true);
  });

  it("GET /workflows lists registered workflows", async () => {
    const res = await request(app).get("/workflows").expect(200);
    const list = parseJson(res.body, workflowListSchema);
    const ids = new Set(list.map((w) => w.id));
    expect(ids.has("simple-workflow")).toBe(true);
    expect(ids.has("og-beta-signup")).toBe(true);
    expect(ids.has("og-paid-beta-signup")).toBe(true);
    expect(ids.has("lendpay-paid-beta-signup")).toBe(true);
    expect(ids.has("claimlayer-paid-claimall")).toBe(true);
  });

  it("POST /workflows/:id/execute returns 404 for unknown workflow", async () => {
    const res = await request(app)
      .post("/workflows/unknown-workflow/execute")
      .send({})
      .expect(404);
    expect(res.body).toMatchObject({ code: "WORKFLOW_NOT_FOUND" });
  });

  it("POST /workflows/:id/execute returns 400 for invalid body", async () => {
    const res = await request(app)
      .post("/workflows/simple-workflow/execute")
      .send({ chain: "x" })
      .expect(400);
    const body = parseJson(res.body, validationErrorBodySchema);
    expect(body.error).toBe("Invalid request body");
    expect(body.details).toBeDefined();
  });

  it("POST execute returns 400 when amount is outside workflow USD bounds", async () => {
    const res = await request(app)
      .post("/workflows/simple-workflow/execute")
      .send({ ...validExecuteBody(), amount: "5.00" })
      .expect(400);
    const body = parseJson(res.body, amountOutOfRangeSchema);
    expect(body.code).toBe("AMOUNT_OUT_OF_RANGE");
  });

  it("POST execute returns 503 when X402 payee address is not configured", async () => {
    const bare = await loadTestApp({
      PORT: "3098",
      X402_RECEIVING_ADDRESS: "",
      BASE_SETTLEMENT_PRIVATE_KEY: `0x${"2".repeat(64)}`,
    });
    const res = await request(bare)
      .post("/workflows/simple-workflow/execute")
      .send(validExecuteBody())
      .expect(503);
    const body = parseJson(res.body, misconfiguredBodySchema);
    expect(body.code).toBe("MISCONFIGURED");
  });

  it("POST execute returns 400 PAYMENT_REQUIRED with x402 accepts when payment header is missing", async () => {
    const res = await request(app)
      .post("/workflows/simple-workflow/execute")
      .set("Host", "gateway.test")
      .set("X-Forwarded-Proto", "https")
      .send(validExecuteBody())
      .expect(400);
    const body = parseJson(res.body, paymentRequiredSchema);
    expect(body.resource.url).toContain(
      "https://gateway.test/workflows/simple-workflow/execute",
    );
    const first = body.accepts[0];
    expect(first).toMatchObject({
      scheme: "exact",
      network: "eip155:8453",
      payTo: PAY_TO,
    });
  });

  it("POST og-paid-beta-signup returns 400 when query params are invalid", async () => {
    const res = await request(app)
      .post("/workflows/og-paid-beta-signup/execute")
      .send({})
      .expect(400);
    const body = parseJson(res.body, validationErrorBodySchema);
    expect(body.error).toBe("Invalid query parameters");
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("POST og-paid-beta-signup PAYMENT_REQUIRED resource url includes sorted query", async () => {
    const q = new URLSearchParams({
      zebra: "2",
      apple: "1",
      email: "user@example.com",
      discord: "u#1",
      network: "algorand",
      projectName: "demo",
      governanceToken: "ALGO",
      amount: "0.05",
    });
    const res = await request(app)
      .post(`/workflows/og-paid-beta-signup/execute?${q.toString()}`)
      .set("Host", "gateway.test")
      .set("X-Forwarded-Proto", "https")
      .send({})
      .expect(400);
    const body = parseJson(res.body, paymentRequiredSchema);
    const url = body.resource.url;
    expect(url.startsWith("https://gateway.test/workflows/og-paid-beta-signup/execute?")).toBe(
      true,
    );
    expect(url.indexOf("apple=1")).toBeLessThan(url.indexOf("zebra=2"));
  });

  it("POST lendpay-paid-beta-signup returns 400 when query params are invalid", async () => {
    const res = await request(app)
      .post("/workflows/lendpay-paid-beta-signup/execute")
      .send({})
      .expect(400);
    const body = parseJson(res.body, validationErrorBodySchema);
    expect(body.error).toBe("Invalid query parameters");
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("POST lendpay-paid-beta-signup PAYMENT_REQUIRED resource url includes sorted query", async () => {
    const algo58 = "A".repeat(58);
    const q = new URLSearchParams({
      zebra: "2",
      apple: "1",
      email: "user@example.com",
      discord: "u#1",
      telegram: "@user",
      baseAddress: `0x${"b".repeat(40)}`,
      algorandAddress: algo58,
      amount: "0.05",
    });
    const res = await request(app)
      .post(`/workflows/lendpay-paid-beta-signup/execute?${q.toString()}`)
      .set("Host", "gateway.test")
      .set("X-Forwarded-Proto", "https")
      .send({})
      .expect(400);
    const body = parseJson(res.body, paymentRequiredSchema);
    const url = body.resource.url;
    expect(
      url.startsWith("https://gateway.test/workflows/lendpay-paid-beta-signup/execute?"),
    ).toBe(true);
    expect(url.indexOf("apple=1")).toBeLessThan(url.indexOf("zebra=2"));
  });

  it("POST claimlayer-paid-claimall returns PAYMENT_REQUIRED with resource URL", async () => {
    const paymentAddress = `0x${"e".repeat(40)}`;
    const targetAddress = `0x${"f".repeat(40)}`;
    const res = await request(app)
      .post("/workflows/claimlayer-paid-claimall/execute")
      .set("Host", "gateway.test")
      .set("X-Forwarded-Proto", "https")
      .send({
        paymentAddress,
        targetAddress,
        chain: "eip155:8453",
        targetChain: "eip155:1",
        amount: "0.10",
      })
      .expect(400);
    const body = parseJson(res.body, paymentRequiredSchema);
    expect(body.resource.url).toBe(
      "https://gateway.test/workflows/claimlayer-paid-claimall/execute",
    );
  });
});
