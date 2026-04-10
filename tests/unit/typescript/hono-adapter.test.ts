/**
 * Hono Adapter Tests
 *
 * Runs the shared adapter contract tests, plus Hono-specific behavior:
 *   - URL parsing via new URL() (throws on malformed URLs)
 *   - getSangria() helper utility
 *   - c.set() / c.get() context API
 *   - c.json(body, status) argument ordering
 *   - c.header(key, value) called per entry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fixedPrice, getSangria } from '../../../sdk/sdk-typescript/src/adapters/hono.js'
import { Sangria } from '../../../sdk/sdk-typescript/src/core.js'
import { runSharedAdapterTests, type AdapterHarness } from './adapter-test-helpers.js'

// ── Mock Hono context factory ───────────────────────────────────────

function createMockContext(url = 'https://api.example.com/api/premium') {
  const variables: Record<string, any> = {}
  const headersSet: Record<string, string> = {}
  let jsonCall: { body: any; status: number } | undefined

  return {
    ctx: {
      req: {
        url,
        header: vi.fn((_name: string) => undefined),
      },
      set: vi.fn((key: string, value: any) => { variables[key] = value }),
      get: vi.fn((key: string) => variables[key]),
      json: vi.fn((body: any, status?: any) => { jsonCall = { body, status } }),
      header: vi.fn((key: string, value: string) => { headersSet[key] = value }),
      variables,
    },
    getJsonCall: () => jsonCall,
    getHeadersSet: () => headersSet,
  }
}

// ── Harness ─────────────────────────────────────────────────────────

function createHonoHarness(
  sangria: Sangria,
  options: { price: number; description?: string },
): AdapterHarness {
  const { ctx, getJsonCall, getHeadersSet } = createMockContext()
  const mockNext = vi.fn().mockResolvedValue(undefined)

  return {
    callWithoutPaymentHeader: async () => {
      ;(ctx.req.header as any).mockReturnValue(undefined)
      const mw = fixedPrice(sangria, options)
      await mw(ctx as any, mockNext)
    },
    callWithPaymentHeader: async (header: string) => {
      ;(ctx.req.header as any).mockImplementation((name: string) =>
        name === 'payment-signature' ? header : undefined
      )
      const mw = fixedPrice(sangria, options)
      await mw(ctx as any, mockNext)
    },
    callWithBypass: async (met: boolean) => {
      ctx.variables.userRole = met ? 'admin' : 'user'
      const bypass = (c: any) => c.variables.userRole === 'admin'
      const mw = fixedPrice(sangria, options, { bypassPaymentIf: bypass })
      await mw(ctx as any, mockNext)
    },
    callWithBypassError: async (error: Error) => {
      const bypass = () => { throw error }
      const mw = fixedPrice(sangria, options, { bypassPaymentIf: bypass })
      await mw(ctx as any, mockNext)
    },

    didContinue: () => mockNext.mock.calls.length > 0,
    respondedStatus: () => getJsonCall()?.status,
    respondedBody: () => getJsonCall()?.body,
    respondedHeaders: () => ({ ...getHeadersSet() }),
    attachedSangriaData: () => ctx.variables.sangria,
  }
}

// ── Shared contract tests ───────────────────────────────────────────

let mockSangria: Sangria

beforeEach(() => {
  mockSangria = new Sangria({ apiKey: 'test-key' })
  vi.spyOn(mockSangria, 'handleFixedPrice')
})

runSharedAdapterTests('Hono', createHonoHarness, () => mockSangria)

// ── Hono-specific tests ─────────────────────────────────────────────

describe('Hono Adapter — framework-specific', () => {
  let mockSangria: Sangria

  beforeEach(() => {
    mockSangria = new Sangria({ apiKey: 'test-key' })
    vi.spyOn(mockSangria, 'handleFixedPrice')
  })

  describe('URL parsing via new URL()', () => {
    it('should strip fragment from URL', async () => {
      const { ctx } = createMockContext(
        'https://api.example.com/api/premium?param=value&other=test#fragment'
      )

      ;(mockSangria.handleFixedPrice as any).mockResolvedValue({
        action: 'respond' as const, status: 402, body: {}, headers: {},
      })

      const mw = fixedPrice(mockSangria, { price: 0.01 })
      await mw(ctx as any, vi.fn())

      const callArgs = (mockSangria.handleFixedPrice as any).mock.calls[0]
      expect(callArgs[0].resourceUrl).toBe(
        'https://api.example.com/api/premium?param=value&other=test'
      )
    })

    it('should throw on malformed URLs', async () => {
      const { ctx } = createMockContext('not-a-valid-url')

      const mw = fixedPrice(mockSangria, { price: 0.01 })

      await expect(mw(ctx as any, vi.fn())).rejects.toThrow()
    })

    it('should handle various URL formats', async () => {
      const urls = [
        'http://localhost:3000/api',
        'https://subdomain.example.com/path',
        'https://api.com:8080/api',
      ]

      for (const url of urls) {
        const { ctx } = createMockContext(url)
        ;(mockSangria.handleFixedPrice as any).mockResolvedValue({
          action: 'respond' as const, status: 402, body: {}, headers: {},
        })

        const mw = fixedPrice(mockSangria, { price: 0.01 })
        await mw(ctx as any, vi.fn())

        const parsed = new URL(url)
        const callArgs = (mockSangria.handleFixedPrice as any).mock.calls[0]
        expect(callArgs[0].resourceUrl).toBe(
          parsed.origin + parsed.pathname + parsed.search
        )

        ;(mockSangria.handleFixedPrice as any).mockClear()
      }
    })
  })

  describe('getSangria() utility', () => {
    it('should retrieve sangria data from context', () => {
      const paymentData = { paid: true, amount: 1.50, transaction: 'tx_test123' }
      const { ctx } = createMockContext()
      ;(ctx.get as any).mockImplementation((key: string) =>
        key === 'sangria' ? paymentData : undefined
      )

      const result = getSangria(ctx as any)

      expect(ctx.get).toHaveBeenCalledWith('sangria')
      expect(result).toEqual(paymentData)
    })

    it('should return undefined when no sangria data exists', () => {
      const { ctx } = createMockContext()
      ;(ctx.get as any).mockReturnValue(undefined)

      const result = getSangria(ctx as any)
      expect(result).toBeUndefined()
    })
  })

  it('should set response headers with c.header() per entry', async () => {
    const { ctx } = createMockContext()

    ;(mockSangria.handleFixedPrice as any).mockResolvedValue({
      action: 'respond' as const,
      status: 402,
      body: {},
      headers: { 'PAYMENT-REQUIRED': 'payload', 'X-Custom': 'val' },
    })

    const mw = fixedPrice(mockSangria, { price: 0.01 })
    await mw(ctx as any, vi.fn())

    expect(ctx.header).toHaveBeenCalledTimes(2)
    expect(ctx.header).toHaveBeenCalledWith('PAYMENT-REQUIRED', 'payload')
    expect(ctx.header).toHaveBeenCalledWith('X-Custom', 'val')
  })

  it('should store payment data via c.set("sangria", data)', async () => {
    const { ctx } = createMockContext()
    ;(ctx.req.header as any).mockImplementation((name: string) =>
      name === 'payment-signature' ? 'valid_sig' : undefined
    )

    ;(mockSangria.handleFixedPrice as any).mockResolvedValue({
      action: 'proceed' as const,
      data: { paid: true, amount: 0.01, transaction: 'tx_123' },
    })

    const mw = fixedPrice(mockSangria, { price: 0.01 })
    await mw(ctx as any, vi.fn().mockResolvedValue(undefined))

    expect(ctx.set).toHaveBeenCalledWith('sangria', {
      paid: true,
      amount: 0.01,
      transaction: 'tx_123',
    })
  })
})
