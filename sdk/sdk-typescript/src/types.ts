import type { Request } from "express";

export interface SangriaNetConfig {
  apiKey: string;
  baseUrl?: string;
  bypassPaymentIf?: (req: Request) => boolean;
}

export interface FixedPriceOptions {
  price: number;
  description?: string;
}

export interface SangriaRequestData {
  paid: boolean;
  amount: number;
  transaction?: string;
}

declare global {
  namespace Express {
    interface Request {
      sangria?: SangriaRequestData;
    }
  }
}
