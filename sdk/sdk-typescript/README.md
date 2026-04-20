# @sangria-sdk/core

TypeScript SDK for accepting x402 payments. Supports Express, Fastify, and Hono.

## Install

```bash
pnpm add @sangria-sdk/core
```

## Quick Start

### Express

```typescript
import express from "express";
import { Sangria } from "@sangria-sdk/core";
import { fixedPrice } from "@sangria-sdk/core/express";

const app = express();
const sangria = new Sangria({
  apiKey: process.env.SANGRIA_SECRET_KEY,
  baseUrl: "https://api.sangria.net",
});

app.get(
  "/premium",
  fixedPrice(sangria, { price: 0.01, description: "Premium content" }),
  (req, res) => {
    // req.sangria.paid === true
    // req.sangria.transaction === "0x..."
    res.json({ data: "premium content" });
  }
);

app.listen(3000);
```

### Fastify

```typescript
import Fastify from "fastify";
import { Sangria } from "@sangria-sdk/core";
import { sangriaPlugin, fixedPrice } from "@sangria-sdk/core/fastify";

const app = Fastify();
const sangria = new Sangria({ apiKey: process.env.SANGRIA_SECRET_KEY });

await app.register(sangriaPlugin);

app.get(
  "/premium",
  { preHandler: fixedPrice(sangria, { price: 0.01 }) },
  (request, reply) => {
    // request.sangria.paid === true
    reply.send({ data: "premium content" });
  }
);

await app.listen({ port: 3000 });
```

### Hono

```typescript
import { Hono } from "hono";
import { Sangria } from "@sangria-sdk/core";
import { fixedPrice, getSangria } from "@sangria-sdk/core/hono";

const app = new Hono();
const sangria = new Sangria({ apiKey: process.env.SANGRIA_SECRET_KEY });

app.get("/premium", fixedPrice(sangria, { price: 0.01 }), (c) => {
  const payment = getSangria(c);
  // payment.paid === true
  return c.json({ data: "premium content" });
});

export default app;
```

## Bypass Payments

All adapters support a `bypassPaymentIf` option to skip payment for certain requests. This is useful if you want to let API key users access your endpoints for free while charging anonymous or agent-based callers via x402:

```typescript
fixedPrice(
  sangria,
  { price: 0.01 },
  {
    bypassPaymentIf: (req) => !!req.headers["x-api-key"],
  }
);
```

## Configuration

```typescript
const sangria = new Sangria({
  apiKey: "sg_live_...", // Required. Your Sangria merchant API key.
  baseUrl: "https://...", // Optional. Defaults to http://localhost:8080.
});
```

## How It Works

The `fixedPrice` middleware handles the x402 negotiation loop:

1. **First request** (no `payment-signature` header): calls Sangria's `/v1/generate-payment` endpoint, returns `402 Payment Required` with payment terms to the client.
2. **Retry** (with `payment-signature` header): forwards the signed payload to Sangria's `/v1/settle-payment` endpoint. On success, attaches payment data to the request and calls your handler.

## Handling errors

The SDK raises a `SangriaError` (or a subclass) when the Sangria backend is unreachable, times out, or returns a 5xx/4xx status (for example, a bad API key). Business-level payment failures (bad signature, insufficient funds, etc.) are not errors — they flow through as normal `402` responses to the caller.

Register a framework-native error handler to turn `SangriaError` into a graceful fallback. Without one, your framework's default will leak a `500 Internal Server Error` to the agent.

Exception hierarchy:

```
SangriaError                   // base — catch-all
├── SangriaConnectionError     // DNS, refused, socket error
│   └── SangriaTimeoutError    // client-side timeout
└── SangriaAPIStatusError      // backend returned non-2xx (has .statusCode, .response)
```

Every exception carries `.operation: "generate" | "settle"` so you can tell which call failed.

### Express

```typescript
import { SangriaError } from "@sangria-sdk/core";

// Register AFTER all routes.
app.use((err, _req, res, next) => {
  if (err instanceof SangriaError) {
    console.error(`[sangria:${err.operation}]`, err.message);
    return res
      .status(503)
      .json({ error: "Payment provider unavailable, please retry shortly." });
  }
  next(err);
});
```

### Fastify

```typescript
import { SangriaError } from "@sangria-sdk/core";

fastify.setErrorHandler((err, _req, reply) => {
  if (err instanceof SangriaError) {
    return reply.status(503).send({ error: "Payment provider unavailable" });
  }
  throw err;
});
```

### Hono

```typescript
import { SangriaError } from "@sangria-sdk/core";

app.onError((err, c) => {
  if (err instanceof SangriaError) {
    return c.json({ error: "Payment provider unavailable" }, 503);
  }
  throw err;
});
```

### Next.js (App Router)

Next.js doesn't have global error middleware for route handlers, so wrap each gated route with the `withSangriaErrorHandler` helper:

```typescript
import { fixedPrice, withSangriaErrorHandler } from "@sangria-sdk/core/nextjs";

export const GET = withSangriaErrorHandler(
  fixedPrice(sangria, { price: 0.01 }, async (req) => {
    return Response.json({ data: "premium" });
  })
);
```

## Requirements

- Node.js >= 18
- One of: Express >= 4, Fastify >= 4, or Hono >= 4
