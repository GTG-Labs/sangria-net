import { CdpClient } from "@coinbase/cdp-sdk";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import type {
  PaymentRequired,
  PaymentRequirements,
  ResourceInfo,
} from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { ClientEvmSigner } from "@x402/evm";
import type { Address } from "viem";
import { isAddress } from "viem";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BACKEND_URL = (
  process.env.BACKEND_URL ?? "http://localhost:8080"
).replace(/\/+$/, "");
const MYTHOS_BASE_URL = (
  process.env.MYTHOS_BASE_URL ?? "http://localhost:3001"
).replace(/\/+$/, "");
const DEMO_PRICE_MICROUNITS = 100;

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BackendGeneratePaymentResponse {
  x402Version: number;
  accepts: PaymentRequirements[];
  resource?: ResourceInfo;
}

interface SignedPayloadPreview {
  payload?: {
    signature?: string;
    authorization?: {
      from?: Address;
    };
  };
}

interface SseEvent {
  step: "negotiate" | "sign" | "settle" | "error";
  status: "pending" | "done" | "error";
  data?: Record<string, unknown>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function encode(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

function toPaymentRequired(
  response: BackendGeneratePaymentResponse,
  fallbackResource: string
): PaymentRequired {
  if (response.x402Version !== 2) {
    throw new Error(
      `Expected x402Version=2 from generate-payment, received ${response.x402Version}`
    );
  }
  if (!response.accepts?.length) {
    throw new Error("402 response missing accepts[]");
  }

  return {
    x402Version: 2,
    accepts: response.accepts,
    resource: {
      url: response.resource?.url ?? fallbackResource,
      description:
        response.resource?.description ?? "Access premium newspaper content",
      mimeType: response.resource?.mimeType ?? "application/json",
    },
  };
}

// ---------------------------------------------------------------------------
// GET /api/x402-pay  — Server-Sent Events payment flow
// ---------------------------------------------------------------------------

export async function GET() {
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SseEvent) => controller.enqueue(encode(event));

      try {
        const merchantApiKey = requireEnv("SANGRIA_SECRET_KEY");
        const buyerAddrRaw = requireEnv("BUYER_ADDRESS");
        if (!isAddress(buyerAddrRaw)) {
          throw new Error(`BUYER_ADDRESS is not a valid Ethereum address`);
        }
        const BUYER_ADDRESS = buyerAddrRaw as Address;
        const generatePaymentUrl = `${BACKEND_URL}/v1/generate-payment`;
        const settlePaymentUrl = `${BACKEND_URL}/v1/settle-payment`;
        const demoResource = `${MYTHOS_BASE_URL}/newspaper`;

        // ----------------------------------------------------------------
        // Step 1: Negotiate — ask Sangria backend for payment requirements
        // ----------------------------------------------------------------
        send({ step: "negotiate", status: "pending" });

        const initialResp = await fetch(generatePaymentUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${merchantApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: DEMO_PRICE_MICROUNITS,
            description: "Access premium newspaper content",
            resource: demoResource,
          }),
          signal: AbortSignal.timeout(15_000),
        });

        if (initialResp.status !== 200) {
          const body = await initialResp.text();
          throw new Error(
            `Expected 200 from generate-payment, got ${initialResp.status}. Body: ${body}`
          );
        }

        const challenge =
          (await initialResp.json()) as BackendGeneratePaymentResponse;
        const paymentRequired = toPaymentRequired(challenge, demoResource);
        const accepts = paymentRequired.accepts[0];
        if (!accepts) throw new Error("payment requirements missing accepts[]");
        const amountUsdc = (parseInt(accepts.amount, 10) / 1e6).toFixed(6);

        send({
          step: "negotiate",
          status: "done",
          data: {
            amount: accepts.amount,
            amountUsdc,
            payTo: accepts.payTo,
            asset: accepts.asset,
            network: accepts.network,
          },
        });

        // ----------------------------------------------------------------
        // Step 2: Sign — EIP-3009 TransferWithAuthorization via CDP
        // ----------------------------------------------------------------
        send({ step: "sign", status: "pending" });

        const cdp = new CdpClient({
          apiKeyId: requireEnv("CDP_API_KEY_NAME"),
          apiKeySecret: requireEnv("CDP_API_KEY_PRIVATE_KEY"),
          walletSecret: requireEnv("CDP_WALLET_SECRET"),
        });

        const account = await cdp.evm.getAccount({ address: BUYER_ADDRESS });
        const signer: ClientEvmSigner = {
          address: account.address as Address,
          signTypedData: account.signTypedData.bind(account),
        };

        const client = new x402Client().register(
          "eip155:*",
          new ExactEvmScheme(signer)
        );
        const httpClient = new x402HTTPClient(client);
        const paymentPayload = await httpClient.createPaymentPayload(
          paymentRequired
        );
        const signatureHeaders =
          httpClient.encodePaymentSignatureHeader(paymentPayload);
        const paymentSignature = signatureHeaders["PAYMENT-SIGNATURE"];
        if (!paymentSignature) {
          throw new Error(
            "x402 v2 client did not return PAYMENT-SIGNATURE header"
          );
        }

        const signedPreview = JSON.parse(
          Buffer.from(paymentSignature, "base64").toString("utf8")
        ) as SignedPayloadPreview;
        const signature = signedPreview.payload?.signature;
        if (!signature) {
          throw new Error("x402 v2 client returned payload without signature");
        }

        send({
          step: "sign",
          status: "done",
          data: {
            signer:
              signedPreview.payload?.authorization?.from ?? account.address,
            signaturePreview: signature.slice(0, 22) + "...",
          },
        });

        // ----------------------------------------------------------------
        // Step 3: Build x402 payload and settle
        // ----------------------------------------------------------------
        send({ step: "settle", status: "pending" });

        const settleResp = await fetch(settlePaymentUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${merchantApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            payment_payload: paymentSignature,
          }),
          signal: AbortSignal.timeout(120_000),
        });

        if (settleResp.status !== 200) {
          let errBody: unknown;
          try {
            errBody = await settleResp.json();
          } catch {
            errBody = await settleResp.text();
          }
          throw new Error(
            `Settlement failed (HTTP ${settleResp.status}): ${JSON.stringify(
              errBody
            )}`
          );
        }

        const result = (await settleResp.json()) as Record<string, unknown>;

        send({
          step: "settle",
          status: "done",
          data: { result },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ step: "error", status: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
