/**
 * Fastify Adapter Tests
 *
 * Runs the shared adapter contract tests, plus Fastify-specific behavior:
 *   - sangriaPlugin registration
 *   - hostname vs headers.host fallback for URL construction
 *   - reply.headers() called with full object (not per-entry)
 *   - Returns reply on respond, undefined on proceed
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fixedPrice, sangriaPlugin } from '../../../sdk/sdk-typescript/src/adapters/fastify.js'
import { Sangria } from '../../../sdk/sdk-typescript/src/core.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { runSharedAdapterTests, type AdapterHarness } from './adapter-test-helpers.js'

// ── Harness ─────────────────────────────────────────────────────────

function createFastifyHarness(
  sangria: Sangria,
  options: { price: number; description?: string },
): AdapterHarness {
  const request: Partial<FastifyRequest> = {
    headers: {},
    protocol: 'https',
    hostname: 'api.example.com',
    url: '/api/premium',
  }
  const reply: Partial<FastifyReply> = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    headers: vi.fn().mockReturnThis(),
  }

  let returnValue: any

  return {
    callWithoutPaymentHeader: async () => {
      request.headers = {}
      const ph = fixedPrice(sangria, options)
      returnValue = await ph(request as FastifyRequest, reply as FastifyReply)
    },
    callWithPaymentHeader: async (header: string) => {
      request.headers = { 'payment-signature': header }
      const ph = fixedPrice(sangria, options)
      returnValue = await ph(request as FastifyRequest, reply as FastifyReply)
    },
    callWithBypass: async (met: boolean) => {
      request.headers = met ? { 'x-admin': 'true' } : { 'x-admin': 'false' }
      const bypass = (r: FastifyRequest) => r.headers['x-admin'] === 'true'
      const ph = fixedPrice(sangria, options, { bypassPaymentIf: bypass })
      returnValue = await ph(request as FastifyRequest, reply as FastifyReply)
    },
    callWithBypassError: async (error: Error) => {
      const bypass = () => { throw error }
      const ph = fixedPrice(sangria, options, { bypassPaymentIf: bypass })
      returnValue = await ph(request as FastifyRequest, reply as FastifyReply)
    },

    didContinue: () => returnValue === undefined,
    respondedStatus: () => (reply.status as any).mock.calls[0]?.[0],
    respondedBody: () => (reply.send as any).mock.calls[0]?.[0],
    respondedHeaders: () => {
      const call = (reply.headers as any).mock.calls[0]
      return call?.[0] ?? {}
    },
    attachedSangriaData: () => (request as any).sangria,
  }
}

// ── Shared contract tests ───────────────────────────────────────────

let mockSangria: Sangria

beforeEach(() => {
  mockSangria = new Sangria({ apiKey: 'test-key' })
  vi.spyOn(mockSangria, 'handleFixedPrice')
})

runSharedAdapterTests('Fastify', createFastifyHarness, () => mockSangria)

// ── Fastify-specific tests ──────────────────────────────────────────

describe('Fastify Adapter — framework-specific', () => {
  let mockSangria: Sangria

  beforeEach(() => {
    mockSangria = new Sangria({ apiKey: 'test-key' })
    vi.spyOn(mockSangria, 'handleFixedPrice')
  })

  describe('sangriaPlugin', () => {
    it('should register sangria property on request', async () => {
      const mockFastify = {
        decorateRequest: vi.fn(),
      } as Partial<FastifyInstance>

      await sangriaPlugin(mockFastify as FastifyInstance)

      expect(mockFastify.decorateRequest).toHaveBeenCalledWith('sangria', undefined)
    })
  })

  it('should use first element when payment-signature is an array', async () => {
    const request: Partial<FastifyRequest> = {
      headers: { 'payment-signature': ['signature1', 'signature2'] },
      protocol: 'https',
      hostname: 'api.example.com',
      url: '/api/premium',
    }
    const reply: Partial<FastifyReply> = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      headers: vi.fn().mockReturnThis(),
    }

    ;(mockSangria.handleFixedPrice as any).mockResolvedValue({
      action: 'respond' as const, status: 402, body: {}, headers: {},
    })

    const ph = fixedPrice(mockSangria, { price: 0.01 })
    await ph(request as FastifyRequest, reply as FastifyReply)

    const callArgs = (mockSangria.handleFixedPrice as any).mock.calls[0]
    expect(callArgs[0].paymentHeader).toBe('signature1')
  })

  it('should fall back to headers.host when hostname is undefined', async () => {
    const request: Partial<FastifyRequest> = {
      headers: { host: 'fallback.example.com' },
      protocol: 'https',
      hostname: undefined,
      url: '/api/premium',
    }
    const reply: Partial<FastifyReply> = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      headers: vi.fn().mockReturnThis(),
    }

    ;(mockSangria.handleFixedPrice as any).mockResolvedValue({
      action: 'respond' as const, status: 402, body: {}, headers: {},
    })

    const ph = fixedPrice(mockSangria, { price: 0.01 })
    await ph(request as FastifyRequest, reply as FastifyReply)

    const callArgs = (mockSangria.handleFixedPrice as any).mock.calls[0]
    expect(callArgs[0].resourceUrl).toBe('https://fallback.example.com/api/premium')
  })

  it('should construct URL with query parameters', async () => {
    const request: Partial<FastifyRequest> = {
      headers: {},
      protocol: 'https',
      hostname: 'api.example.com',
      url: '/api/premium?param=value&other=test',
    }
    const reply: Partial<FastifyReply> = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      headers: vi.fn().mockReturnThis(),
    }

    ;(mockSangria.handleFixedPrice as any).mockResolvedValue({
      action: 'respond' as const, status: 402, body: {}, headers: {},
    })

    const ph = fixedPrice(mockSangria, { price: 0.01 })
    await ph(request as FastifyRequest, reply as FastifyReply)

    const callArgs = (mockSangria.handleFixedPrice as any).mock.calls[0]
    expect(callArgs[0].resourceUrl).toBe('https://api.example.com/api/premium?param=value&other=test')
  })

  it('should set response headers with reply.headers() as a single object', async () => {
    const reply: Partial<FastifyReply> = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      headers: vi.fn().mockReturnThis(),
    }

    ;(mockSangria.handleFixedPrice as any).mockResolvedValue({
      action: 'respond' as const,
      status: 402,
      body: {},
      headers: { 'PAYMENT-REQUIRED': 'payload', 'X-Custom': 'val' },
    })

    const ph = fixedPrice(mockSangria, { price: 0.01 })
    await ph(
      { headers: {}, protocol: 'https', hostname: 'h', url: '/' } as any,
      reply as FastifyReply,
    )

    expect(reply.headers).toHaveBeenCalledOnce()
    expect(reply.headers).toHaveBeenCalledWith({
      'PAYMENT-REQUIRED': 'payload',
      'X-Custom': 'val',
    })
  })

  it('should return reply on respond, undefined on proceed', async () => {
    const reply: Partial<FastifyReply> = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      headers: vi.fn().mockReturnThis(),
    }
    const request: Partial<FastifyRequest> = {
      headers: {},
      protocol: 'https',
      hostname: 'h',
      url: '/',
    }

    // respond path
    ;(mockSangria.handleFixedPrice as any).mockResolvedValue({
      action: 'respond' as const, status: 402, body: {}, headers: {},
    })
    const ph1 = fixedPrice(mockSangria, { price: 0.01 })
    const r1 = await ph1(request as FastifyRequest, reply as FastifyReply)
    expect(r1).toBe(reply)

    vi.clearAllMocks()
    vi.spyOn(mockSangria, 'handleFixedPrice')

    // proceed path
    ;(mockSangria.handleFixedPrice as any).mockResolvedValue({
      action: 'proceed' as const, data: { paid: true, amount: 0.01 },
    })
    const ph2 = fixedPrice(mockSangria, { price: 0.01 })
    const r2 = await ph2(request as FastifyRequest, reply as FastifyReply)
    expect(r2).toBeUndefined()
  })
})
