import type {
  SangriaNetConfig,
  FixedPriceOptions,
  PaymentContext,
  PaymentResult,
} from "./types.js";

const DEFAULT_BASE_URL = "http://localhost:8080";

export class SangriaNet {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: SangriaNetConfig) {
    if (!config.apiKey) {
      throw new Error("SangriaNet: apiKey is required");
    }

    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  validateFixedPriceOptions(options: FixedPriceOptions): void {
    if (!Number.isFinite(options.price) || options.price <= 0) {
      throw new Error(
        "SangriaNet: price must be a finite number greater than 0",
      );
    }
  }

  async handleFixedPrice(
    ctx: PaymentContext,
    options: FixedPriceOptions,
  ): Promise<PaymentResult> {
    this.validateFixedPriceOptions(options);

    if (!ctx.paymentHeader) {
      try {
        const terms = await this.post("/v1/generate-payment", {
          amount: options.price,
          resource: ctx.resourceUrl,
          description: options.description,
        });
        return { action: "respond", status: 402, body: terms };
      } catch {
        return {
          action: "respond",
          status: 500,
          body: { error: "Payment service unavailable" },
        };
      }
    }

    try {
      const result = (await this.post("/v1/settle-payment", {
        payment_payload: ctx.paymentHeader,
      })) as {
        success: boolean;
        transaction?: string;
        error_message?: string;
      };

      if (!result.success) {
        return {
          action: "respond",
          status: 402,
          body: { error: result.error_message ?? "Payment failed" },
        };
      }

      return {
        action: "proceed",
        data: {
          paid: true,
          amount: options.price,
          transaction: result.transaction,
        },
      };
    } catch {
      return {
        action: "respond",
        status: 500,
        body: { error: "Payment settlement failed" },
      };
    }
  }

  private async post(path: string, body: Record<string, unknown>) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`SangriaNet API error (${res.status})`);
    }

    return res.json();
  }
}
