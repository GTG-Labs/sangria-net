import type { Request, Response, NextFunction } from "express";
import type { SangriaNetConfig, FixedPriceOptions } from "./types";

const DEFAULT_BASE_URL = "http://localhost:8080";

export class SangriaNet {
  private apiKey: string;
  private baseUrl: string;
  private bypassPaymentIf?: (req: Request) => boolean;

  constructor(config: SangriaNetConfig) {
    if (!config.apiKey) {
      throw new Error("SangriaNet: apiKey is required");
    }

    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.bypassPaymentIf = config.bypassPaymentIf;
  }

  fixedPrice(options: FixedPriceOptions) {
    if (options.price <= 0) {
      throw new Error("SangriaNet: price must be greater than 0");
    }

    return async (req: Request, res: Response, next: NextFunction) => {
      if (this.bypassPaymentIf?.(req)) {
        req.sangria = { paid: false, amount: 0 };
        return next();
      }

      const paymentHeader = req.headers["x-payment"] as string | undefined;
      const resource = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

      if (!paymentHeader) {
        try {
          const terms = await this.post("/v1/generate-payment", {
            amount: options.price,
            resource,
            scheme: "exact",
            description: options.description,
          });
          return res.status(402).json(terms);
        } catch {
          return res.status(500).json({ error: "Payment service unavailable" });
        }
      }

      try {
        const result = (await this.post("/v1/settle-payment", {
          paymentHeader,
          resource,
          amount: options.price,
          scheme: "exact",
        })) as { success: boolean; transaction?: string; error?: string };

        if (!result.success) {
          return res.status(402).json({ error: result.error ?? "Payment failed" });
        }

        req.sangria = {
          paid: true,
          amount: options.price,
          transaction: result.transaction,
        };

        return next();
      } catch {
        return res.status(500).json({ error: "Payment settlement failed" });
      }
    };
  }

  private async post(path: string, body: Record<string, unknown>) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`SangriaNet API error (${res.status})`);
    }

    return res.json();
  }
}
