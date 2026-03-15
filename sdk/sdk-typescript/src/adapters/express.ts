import type { Request, Response, NextFunction } from "express";
import type { SangriaRequestData, FixedPriceOptions } from "../types.js";
import { SangriaNet } from "../core.js";

export interface ExpressConfig {
  bypassPaymentIf?: (req: Request) => boolean;
}

declare global {
  namespace Express {
    interface Request {
      sangrianet?: SangriaRequestData;
    }
  }
}

export function fixedPrice(
  sangrianet: SangriaNet,
  options: FixedPriceOptions,
  config?: ExpressConfig,
) {
  sangrianet.validateFixedPriceOptions(options);

  return async (req: Request, res: Response, next: NextFunction) => {
    if (config?.bypassPaymentIf?.(req)) {
      req.sangrianet = { paid: false, amount: 0 };
      return next();
    }

    const result = await sangrianet.handleFixedPrice(
      {
        paymentHeader: req.headers["x-payment"] as string | undefined,
        resourceUrl: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
      },
      options,
    );

    if (result.action === "respond") {
      return res.status(result.status).json(result.body);
    }

    req.sangrianet = result.data;
    return next();
  };
}
