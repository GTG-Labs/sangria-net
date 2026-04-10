/**
 * Shared adapter test factory
 *
 * Each framework adapter (Express, Fastify, Hono) does the same core job:
 *   1. Extract payment-signature header from the request
 *   2. Build a resource URL from the request
 *   3. Call sangria.handleFixedPrice(context, options)
 *   4. If result.action === 'respond' → set headers, send status + body
 *   5. If result.action === 'proceed' → attach data to request, continue
 *   6. If bypass condition is met → skip payment, attach default data, continue
 *
 * The tests below exercise that shared contract.  Each adapter provides a
 * "harness" that maps its framework-specific API to a common interface.
 */

import { describe, it, expect } from "vitest";
import type { Sangria } from "../../../sdk/sdk-typescript/src/core.js";

// ── Harness interface ───────────────────────────────────────────────

export interface AdapterHarness {
  /** Call the middleware with default mock request (no payment header). */
  callWithoutPaymentHeader: () => Promise<void>;

  /** Call the middleware with a payment-signature header. */
  callWithPaymentHeader: (header: string) => Promise<void>;

  /** Call the middleware with a bypass condition that returns `met`. */
  callWithBypass: (met: boolean) => Promise<void>;

  /** Call the middleware with a bypass condition that throws. */
  callWithBypassError: (error: Error) => Promise<void>;

  // ── Assertion helpers ──

  /** Was the "continue to route handler" signal sent? (next / implicit return) */
  didContinue: () => boolean;

  /** The status code sent in the response, or undefined if none. */
  respondedStatus: () => number | undefined;

  /** The body sent in the response, or undefined if none. */
  respondedBody: () => any;

  /** The response headers that were set (key→value). */
  respondedHeaders: () => Record<string, string>;

  /** The payment data attached to the request/context, or undefined. */
  attachedSangriaData: () => any;
}

export type HarnessFactory = (
  sangria: Sangria,
  options: { price: number; description?: string },
) => AdapterHarness;

// ── Shared test suite ───────────────────────────────────────────────

export function runSharedAdapterTests(
  adapterName: string,
  createHarness: HarnessFactory,
  getSangria: () => Sangria,
) {
  describe(`${adapterName} — shared contract`, () => {
    describe("Payment Generation Flow", () => {
      it("should generate payment when no payment header provided", async () => {
        const sangria = getSangria();
        const mockResponse = {
          action: "respond" as const,
          status: 402,
          body: { payment_id: "test_payment", challenge: "test_challenge" },
          headers: { "PAYMENT-REQUIRED": "encoded_payload" },
        };
        (sangria.handleFixedPrice as any).mockResolvedValue(mockResponse);

        const h = createHarness(sangria, { price: 0.01, description: "Test" });
        await h.callWithoutPaymentHeader();

        expect(h.didContinue()).toBe(false);
        expect(h.respondedStatus()).toBe(402);
        expect(h.respondedBody()).toEqual({
          payment_id: "test_payment",
          challenge: "test_challenge",
        });
        expect(h.respondedHeaders()["PAYMENT-REQUIRED"]).toBe(
          "encoded_payload",
        );
      });
    });

    describe("Payment Settlement Flow", () => {
      it("should settle payment when payment header provided", async () => {
        const sangria = getSangria();
        const mockResponse = {
          action: "proceed" as const,
          data: { paid: true, amount: 0.01, transaction: "tx_abc123" },
        };
        (sangria.handleFixedPrice as any).mockResolvedValue(mockResponse);

        const h = createHarness(sangria, { price: 0.01 });
        await h.callWithPaymentHeader("valid_signature");

        expect(h.didContinue()).toBe(true);
        expect(h.attachedSangriaData()).toEqual({
          paid: true,
          amount: 0.01,
          transaction: "tx_abc123",
        });
        expect(h.respondedStatus()).toBeUndefined();
      });

      it("should handle settlement failure", async () => {
        const sangria = getSangria();
        const mockResponse = {
          action: "respond" as const,
          status: 402,
          body: { error: "Payment failed", error_reason: "INVALID_SIGNATURE" },
          headers: {},
        };
        (sangria.handleFixedPrice as any).mockResolvedValue(mockResponse);

        const h = createHarness(sangria, { price: 0.01 });
        await h.callWithPaymentHeader("invalid_signature");

        expect(h.didContinue()).toBe(false);
        expect(h.respondedStatus()).toBe(402);
        expect(h.respondedBody()).toEqual({
          error: "Payment failed",
          error_reason: "INVALID_SIGNATURE",
        });
      });

      it("should handle payment data with missing transaction", async () => {
        const sangria = getSangria();
        const mockResponse = {
          action: "proceed" as const,
          data: { paid: true, amount: 0.5 },
        };
        (sangria.handleFixedPrice as any).mockResolvedValue(mockResponse);

        const h = createHarness(sangria, { price: 0.5 });
        await h.callWithPaymentHeader("valid_signature");

        expect(h.didContinue()).toBe(true);
        expect(h.attachedSangriaData()).toEqual({ paid: true, amount: 0.5 });
      });
    });

    describe("Bypass Payment Configuration", () => {
      it("should bypass payment when condition is met", async () => {
        const sangria = getSangria();
        const h = createHarness(sangria, { price: 0.01 });
        await h.callWithBypass(true);

        expect(h.didContinue()).toBe(true);
        expect(h.attachedSangriaData()).toEqual({ paid: false, amount: 0 });
        expect(sangria.handleFixedPrice).not.toHaveBeenCalled();
      });

      it("should not bypass payment when condition is not met", async () => {
        const sangria = getSangria();
        const mockResponse = {
          action: "respond" as const,
          status: 402,
          body: { payment_id: "test" },
          headers: {},
        };
        (sangria.handleFixedPrice as any).mockResolvedValue(mockResponse);

        const h = createHarness(sangria, { price: 0.01 });
        await h.callWithBypass(false);

        expect(h.didContinue()).toBe(false);
        expect(sangria.handleFixedPrice).toHaveBeenCalled();
        expect(h.respondedStatus()).toBe(402);
      });

      it("should propagate bypass condition errors", async () => {
        const sangria = getSangria();
        const h = createHarness(sangria, { price: 0.01 });

        await expect(
          h.callWithBypassError(new Error("Bypass condition error")),
        ).rejects.toThrow("Bypass condition error");
      });
    });

    describe("Header Handling", () => {
      it("should handle missing payment-signature header", async () => {
        const sangria = getSangria();
        const mockResponse = {
          action: "respond" as const,
          status: 402,
          body: {},
          headers: {},
        };
        (sangria.handleFixedPrice as any).mockResolvedValue(mockResponse);

        const h = createHarness(sangria, { price: 0.01 });
        await h.callWithoutPaymentHeader();

        const callArgs = (sangria.handleFixedPrice as any).mock.calls[0];
        expect(callArgs[0].paymentHeader).toBeUndefined();
      });

      it("should set multiple response headers", async () => {
        const sangria = getSangria();
        const mockResponse = {
          action: "respond" as const,
          status: 402,
          body: {},
          headers: {
            "PAYMENT-REQUIRED": "encoded_payload",
            "X-Custom-Header": "custom_value",
            "Cache-Control": "no-cache",
          },
        };
        (sangria.handleFixedPrice as any).mockResolvedValue(mockResponse);

        const h = createHarness(sangria, { price: 0.01 });
        await h.callWithoutPaymentHeader();

        const headers = h.respondedHeaders();
        expect(headers["PAYMENT-REQUIRED"]).toBe("encoded_payload");
        expect(headers["X-Custom-Header"]).toBe("custom_value");
        expect(headers["Cache-Control"]).toBe("no-cache");
      });

      it("should handle response without headers", async () => {
        const sangria = getSangria();
        const mockResponse = {
          action: "respond" as const,
          status: 402,
          body: { payment_id: "test" },
        };
        (sangria.handleFixedPrice as any).mockResolvedValue(mockResponse);

        const h = createHarness(sangria, { price: 0.01 });
        await h.callWithoutPaymentHeader();

        expect(h.respondedHeaders()).toEqual({});
        expect(h.respondedStatus()).toBe(402);
        expect(h.respondedBody()).toEqual({ payment_id: "test" });
      });
    });

    describe("Error Handling", () => {
      it("should propagate Sangria service errors", async () => {
        const sangria = getSangria();
        (sangria.handleFixedPrice as any).mockRejectedValue(
          new Error("Service unavailable"),
        );

        const h = createHarness(sangria, { price: 0.01 });

        await expect(h.callWithoutPaymentHeader()).rejects.toThrow(
          "Service unavailable",
        );
      });
    });

    describe("Concurrent Requests", () => {
      it("should handle concurrent middleware executions", async () => {
        const sangria = getSangria();
        const mockResponse = {
          action: "respond" as const,
          status: 402,
          body: { payment_id: "concurrent_test" },
          headers: {},
        };
        (sangria.handleFixedPrice as any).mockResolvedValue(mockResponse);

        const harnesses = Array.from({ length: 5 }, () =>
          createHarness(sangria, { price: 0.01 }),
        );

        await Promise.all(harnesses.map((h) => h.callWithoutPaymentHeader()));

        expect(sangria.handleFixedPrice).toHaveBeenCalledTimes(5);
        harnesses.forEach((h) => {
          expect(h.respondedStatus()).toBe(402);
        });
      });
    });
  });
}
