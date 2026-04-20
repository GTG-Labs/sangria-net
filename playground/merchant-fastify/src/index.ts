import Fastify from "fastify";
import { Sangria, SangriaError } from "@sangria-sdk/core";
import { sangriaPlugin, fixedPrice } from "@sangria-sdk/core/fastify";

const fastify = Fastify({ logger: false });

const sangria = new Sangria({
  apiKey: process.env.SANGRIA_SECRET_KEY ?? "sk_test_abc123",
  baseUrl: process.env.SANGRIA_URL ?? "http://localhost:8080",
});

fastify.register(sangriaPlugin);

// Catches SangriaError from any fixedPrice-gated route.
fastify.setErrorHandler((err, _req, reply) => {
  if (err instanceof SangriaError) {
    fastify.log.error(`[sangria:${err.operation}] ${err.message}`);
    return reply
      .status(503)
      .send({ error: "Payment provider unavailable, please retry shortly." });
  }
  throw err;
});

fastify.get("/", async () => {
  return { message: "Hello! This endpoint is free." };
});

fastify.get(
  "/premium",
  {
    preHandler: fixedPrice(sangria, {
      price: 0.01,
      description: "Access premium content",
    }),
  },
  async () => {
    return { message: "You accessed the premium endpoint!" };
  }
);

const PORT = Number(process.env.PORT ?? 4002);
await fastify.listen({ port: PORT });
console.log(`Fastify merchant server running on http://localhost:${PORT}`);
console.log(`  GET /         → free`);
console.log(`  GET /premium  → $0.01 (fixed)`);
