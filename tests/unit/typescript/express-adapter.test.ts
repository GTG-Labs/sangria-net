/**
 * Express Adapter Tests
 *
 * Runs the shared adapter contract tests, plus Express-specific behavior:
 *   - Array header handling (Express passes arrays for duplicate headers)
 *   - URL construction via req.protocol + req.get('host') + req.originalUrl
 *   - res.setHeader called per header entry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fixedPrice } from '../../../sdk/sdk-typescript/src/adapters/express.js'
import { Sangria } from '../../../sdk/sdk-typescript/src/core.js'
import type { Request, Response, NextFunction } from 'express'
import { runSharedAdapterTests, type AdapterHarness } from './adapter-test-helpers.js'

// ── Harness ─────────────────────────────────────────────────────────

function createExpressHarness(
  sangria: Sangria,
  options: { price: number; description?: string },
): AdapterHarness {
  const req: Partial<Request> = {
    headers: {},
    protocol: 'https',
    get: vi.fn((header: string) => {
      if (header === 'host') return 'api.example.com'
      return undefined
    }),
    originalUrl: '/api/premium',
  }
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  }
  const next: NextFunction = vi.fn()

  return {
    callWithoutPaymentHeader: async () => {
      req.headers = {}
      const mw = fixedPrice(sangria, options)
      await mw(req as Request, res as Response, next)
    },
    callWithPaymentHeader: async (header: string) => {
      req.headers = { 'payment-signature': header }
      const mw = fixedPrice(sangria, options)
      await mw(req as Request, res as Response, next)
    },
    callWithBypass: async (met: boolean) => {
      req.headers = met ? { 'x-api-key': 'admin_key' } : { 'x-api-key': 'user_key' }
      const bypass = (r: Request) => r.headers['x-api-key'] === 'admin_key'
      const mw = fixedPrice(sangria, options, { bypassPaymentIf: bypass })
      await mw(req as Request, res as Response, next)
    },
    callWithBypassError: async (error: Error) => {
      const bypass = () => { throw error }
      const mw = fixedPrice(sangria, options, { bypassPaymentIf: bypass })
      await mw(req as Request, res as Response, next)
    },

    didContinue: () => (next as any).mock.calls.length > 0,
    respondedStatus: () => (res.status as any).mock.calls[0]?.[0],
    respondedBody: () => (res.json as any).mock.calls[0]?.[0],
    respondedHeaders: () => {
      const headers: Record<string, string> = {}
      for (const [k, v] of (res.setHeader as any).mock.calls) {
        headers[k] = v
      }
      return headers
    },
    attachedSangriaData: () => (req as any).sangria,
  }
}

// ── Shared contract tests ───────────────────────────────────────────

let mockSangria: Sangria

beforeEach(() => {
  mockSangria = new Sangria({ apiKey: 'test-key' })
  vi.spyOn(mockSangria, 'handleFixedPrice')
})

runSharedAdapterTests('Express', createExpressHarness, () => mockSangria)

// ── Express-specific tests ──────────────────────────────────────────

describe('Express Adapter — framework-specific', () => {
  let mockSangria: Sangria

  beforeEach(() => {
    mockSangria = new Sangria({ apiKey: 'test-key' })
    vi.spyOn(mockSangria, 'handleFixedPrice')
  })

  it('should use first element when payment-signature is an array', async () => {
    const mockReq: Partial<Request> = {
      headers: { 'payment-signature': ['signature1', 'signature2'] },
      protocol: 'https',
      get: vi.fn(() => 'api.example.com'),
      originalUrl: '/api/premium',
    }
    const mockRes: Partial<Response> = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
    }
    const mockNext: NextFunction = vi.fn()

    ;(mockSangria.handleFixedPrice as any).mockResolvedValue({
      action: 'respond' as const, status: 402, body: {}, headers: {},
    })

    const mw = fixedPrice(mockSangria, { price: 0.01 })
    await mw(mockReq as Request, mockRes as Response, mockNext)

    const callArgs = (mockSangria.handleFixedPrice as any).mock.calls[0]
    expect(callArgs[0].paymentHeader).toBe('signature1')
  })

  it('should construct resource URL from req.protocol + req.get("host") + req.originalUrl', async () => {
    const mockReq: Partial<Request> = {
      headers: {},
      protocol: 'http',
      get: vi.fn((h: string) => h === 'host' ? 'localhost:3000' : undefined),
      originalUrl: '/api/premium?param=value',
    }
    const mockRes: Partial<Response> = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
    }

    ;(mockSangria.handleFixedPrice as any).mockResolvedValue({
      action: 'respond' as const, status: 402, body: {}, headers: {},
    })

    const mw = fixedPrice(mockSangria, { price: 0.01 })
    await mw(mockReq as Request, mockRes as Response, vi.fn())

    const callArgs = (mockSangria.handleFixedPrice as any).mock.calls[0]
    expect(callArgs[0].resourceUrl).toBe('http://localhost:3000/api/premium?param=value')
  })

  it('should produce URL with "undefined" when host header is missing', async () => {
    const mockReq: Partial<Request> = {
      headers: {},
      protocol: 'https',
      get: vi.fn(() => undefined),
      originalUrl: '/api/premium',
    }
    const mockRes: Partial<Response> = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
    }

    ;(mockSangria.handleFixedPrice as any).mockResolvedValue({
      action: 'respond' as const, status: 402, body: {}, headers: {},
    })

    const mw = fixedPrice(mockSangria, { price: 0.01 })
    await mw(mockReq as Request, mockRes as Response, vi.fn())

    const callArgs = (mockSangria.handleFixedPrice as any).mock.calls[0]
    expect(callArgs[0].resourceUrl).toBe('https://undefined/api/premium')
  })

  it('should iterate response headers with res.setHeader per entry', async () => {
    ;(mockSangria.handleFixedPrice as any).mockResolvedValue({
      action: 'respond' as const,
      status: 402,
      body: {},
      headers: { 'PAYMENT-REQUIRED': 'payload', 'X-Custom': 'val' },
    })

    const mockRes: Partial<Response> = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
    }

    const mw = fixedPrice(mockSangria, { price: 0.01 })
    await mw(
      { headers: {}, protocol: 'https', get: vi.fn(() => 'h'), originalUrl: '/' } as any,
      mockRes as Response,
      vi.fn(),
    )

    expect(mockRes.setHeader).toHaveBeenCalledTimes(2)
    expect(mockRes.setHeader).toHaveBeenCalledWith('PAYMENT-REQUIRED', 'payload')
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Custom', 'val')
  })
})
