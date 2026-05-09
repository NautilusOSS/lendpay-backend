import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { VerifiedSettlement } from "./x402";

/** Circle USDC EIP-3009 — `signature` bytes overload (Base native USDC). */
const transferWithAuthorizationAbi = [
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export type SettlementResult = {
  transactionHash: `0x${string}`;
};

/**
 * Submits USDC `transferWithAuthorization` on Base using a **relayer** key (pays gas).
 * Moves funds **from** the payer (from the EIP-712 authorization) **to** `payTo`.
 */
export async function settleUsdcTransfer(params: {
  settlement: VerifiedSettlement;
  rpcUrl: string;
  relayerPrivateKey: `0x${string}`;
}): Promise<SettlementResult> {
  const { settlement, rpcUrl, relayerPrivateKey } = params;

  const account = privateKeyToAccount(relayerPrivateKey);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl),
  });

  const hash = await walletClient.writeContract({
    address: settlement.asset,
    abi: transferWithAuthorizationAbi,
    functionName: "transferWithAuthorization",
    args: [
      settlement.from,
      settlement.to,
      settlement.value,
      settlement.validAfter,
      settlement.validBefore,
      settlement.nonce,
      settlement.signature,
    ],
  });

  return { transactionHash: hash };
}
