import type { Context, MiddlewareHandler } from "hono";
import type { SangriaRequestData, FixedPriceOptions } from "../types.js";
import { SangriaNet } from "../core.js";

export interface HonoConfig {
  bypassPaymentIf?: (c: Context) => boolean;
}

const SANGRIANET_KEY = "sangrianet";

export function getSangriaNet(c: Context): SangriaRequestData | undefined {
  return c.get(SANGRIANET_KEY as never) as SangriaRequestData | undefined;
}

export function fixedPrice(
  sangrianet: SangriaNet,
  options: FixedPriceOptions,
  config?: HonoConfig,
): MiddlewareHandler {
  sangrianet.validateFixedPriceOptions(options);

  return async (c, next) => {
    if (config?.bypassPaymentIf?.(c)) {
      c.set(SANGRIANET_KEY as never, { paid: false, amount: 0 } as never);
      return next();
    }

    const url = new URL(c.req.url);
    const result = await sangrianet.handleFixedPrice(
      {
        paymentHeader: c.req.header("x-payment"),
        resourceUrl: url.origin + url.pathname + url.search,
      },
      options,
    );

    if (result.action === "respond") {
      return c.json(result.body as {}, result.status as 402);
    }

    c.set(SANGRIANET_KEY as never, result.data as never);
    return next();
  };
}
