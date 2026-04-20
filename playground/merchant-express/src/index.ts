import express, { NextFunction, Request, Response } from "express";
import { Sangria, SangriaError } from "@sangria-sdk/core";
import { fixedPrice } from "@sangria-sdk/core/express";

const app = express();
app.use(express.json());

const sangria = new Sangria({
  apiKey: process.env.SANGRIA_SECRET_KEY ?? "sk_test_abc123",
  baseUrl: process.env.SANGRIA_URL ?? "http://localhost:8080",
});

app.get("/", (_req, res) => {
  res.json({ message: "Hello! This endpoint is free." });
});

app.get(
  "/premium",
  fixedPrice(sangria, { price: 0.01, description: "Access premium content" }),
  (_req, res) => {
    res.json({ message: "You accessed the premium endpoint!" });
  }
);

// Global error handler — catches SangriaError from any fixedPrice-gated route.
// Register AFTER all routes (Express convention).
app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SangriaError) {
    console.error(`[sangria:${err.operation}]`, err.message);
    return res
      .status(503)
      .json({ error: "Payment provider unavailable, please retry shortly." });
  }
  next(err);
});

const PORT = Number(process.env.PORT ?? 4001);
app.listen(PORT, () => {
  console.log(`Express merchant server running on http://localhost:${PORT}`);
  console.log(`  GET /         → free`);
  console.log(`  GET /premium  → $0.01 (fixed)`);
});
