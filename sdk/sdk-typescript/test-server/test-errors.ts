// Quick smoke test for error handling. Run with:
//   npx tsx test-server/test-errors.ts
//
// Spins up a mock Sangria backend and calls the SDK against it to verify
// every error case is thrown as the right exception type.

import { createServer, Server, IncomingMessage, ServerResponse } from "node:http";
import {
  Sangria,
  SangriaError,
  SangriaAPIStatusError,
  SangriaConnectionError,
  SangriaTimeoutError,
} from "../src/index.js";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

function startMock(handler: Handler): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) {
        resolve({ server, url: `http://127.0.0.1:${addr.port}` });
      }
    });
  });
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.error(`  ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

async function main() {
  // 5xx response → SangriaAPIStatusError
  await test("5xx response throws SangriaAPIStatusError", async () => {
    const { server, url } = await startMock((_req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "backend on fire" } }));
    });
    const sangria = new Sangria({ apiKey: "k", baseUrl: url });
    try {
      await sangria.handleFixedPrice(
        { resourceUrl: "/test" },
        { price: 1 }
      );
      throw new Error("expected throw");
    } catch (e) {
      if (!(e instanceof SangriaAPIStatusError)) throw new Error(`wrong type: ${e}`);
      if (e.statusCode !== 500) throw new Error(`wrong status: ${e.statusCode}`);
      if (e.operation !== "generate") throw new Error(`wrong op: ${e.operation}`);
      if (!e.message.includes("backend on fire")) throw new Error(`wrong msg: ${e.message}`);
    } finally {
      server.close();
    }
  });

  // 401 throws SangriaAPIStatusError
  await test("401 response throws SangriaAPIStatusError", async () => {
    const { server, url } = await startMock((_req, res) => {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
    });
    const sangria = new Sangria({ apiKey: "k", baseUrl: url });
    try {
      await sangria.handleFixedPrice({ resourceUrl: "/" }, { price: 1 });
      throw new Error("expected throw");
    } catch (e) {
      if (!(e instanceof SangriaAPIStatusError)) throw new Error(`wrong type`);
      if (e.statusCode !== 401) throw new Error(`wrong status`);
    } finally {
      server.close();
    }
  });

  // Connection refused → SangriaConnectionError
  await test("connection refused throws SangriaConnectionError", async () => {
    const sangria = new Sangria({ apiKey: "k", baseUrl: "http://127.0.0.1:1" });
    try {
      await sangria.handleFixedPrice({ resourceUrl: "/" }, { price: 1 });
      throw new Error("expected throw");
    } catch (e) {
      if (!(e instanceof SangriaConnectionError)) throw new Error(`wrong type: ${e}`);
      if (e instanceof SangriaTimeoutError) throw new Error(`should not be timeout`);
    }
  });

  // 200 with success: false → returns PaymentResult (no throw)
  await test("200 success:false returns PaymentResult (no throw)", async () => {
    const { server, url } = await startMock((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error_reason: "insufficient_funds" }));
    });
    const sangria = new Sangria({ apiKey: "k", baseUrl: url });
    try {
      const result = await sangria.handleFixedPrice(
        { paymentHeader: "sig", resourceUrl: "/" },
        { price: 1 }
      );
      if (result.action !== "respond") throw new Error(`wrong action`);
      if (result.status !== 402) throw new Error(`wrong status`);
    } finally {
      server.close();
    }
  });

  // 200 with success: true → PaymentProceeded
  await test("200 success:true returns proceed", async () => {
    const { server, url } = await startMock((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, transaction: "0xabc" }));
    });
    const sangria = new Sangria({ apiKey: "k", baseUrl: url });
    try {
      const result = await sangria.handleFixedPrice(
        { paymentHeader: "sig", resourceUrl: "/" },
        { price: 1 }
      );
      if (result.action !== "proceed") throw new Error(`wrong action`);
      if (result.data.transaction !== "0xabc") throw new Error(`wrong tx`);
    } finally {
      server.close();
    }
  });

  // No payment header + backend up → 402 challenge
  await test("generate returns 402 challenge", async () => {
    const { server, url } = await startMock((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ x402Version: 2, accepts: [] }));
    });
    const sangria = new Sangria({ apiKey: "k", baseUrl: url });
    try {
      const result = await sangria.handleFixedPrice(
        { resourceUrl: "/" },
        { price: 1 }
      );
      if (result.action !== "respond") throw new Error(`wrong action`);
      if (result.status !== 402) throw new Error(`wrong status`);
      if (!result.headers?.["PAYMENT-REQUIRED"]) throw new Error(`missing header`);
    } finally {
      server.close();
    }
  });

  // Malformed JSON → SangriaAPIStatusError
  await test("malformed JSON throws SangriaAPIStatusError", async () => {
    const { server, url } = await startMock((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("not json at all");
    });
    const sangria = new Sangria({ apiKey: "k", baseUrl: url });
    try {
      await sangria.handleFixedPrice({ resourceUrl: "/" }, { price: 1 });
      throw new Error("expected throw");
    } catch (e) {
      if (!(e instanceof SangriaError)) throw new Error(`wrong type: ${e}`);
    } finally {
      server.close();
    }
  });

  // settle operation tag
  await test("settle errors carry operation=settle", async () => {
    const { server, url } = await startMock((_req, res) => {
      res.writeHead(500);
      res.end("server error");
    });
    const sangria = new Sangria({ apiKey: "k", baseUrl: url });
    try {
      await sangria.handleFixedPrice(
        { paymentHeader: "sig", resourceUrl: "/" },
        { price: 1 }
      );
      throw new Error("expected throw");
    } catch (e) {
      if (!(e instanceof SangriaError)) throw new Error(`wrong type`);
      if (e.operation !== "settle") throw new Error(`wrong op: ${e.operation}`);
    } finally {
      server.close();
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
