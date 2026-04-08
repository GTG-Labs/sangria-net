import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { SangriaNet } from '../../src/core.js'
import { fixedPrice, getSangriaNet } from '../../src/adapters/hono.js'

describe('Hono Adapter Integration', () => {
  let app: Hono
  let sangriaNet: SangriaNet
  const mockApiKey = 'test-api-key'

  beforeEach(() => {
    app = new Hono()
    sangriaNet = new SangriaNet({ apiKey: mockApiKey })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('fixedPrice middleware', () => {
    it('should return 402 when no payment header is provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ challenge: 'test-challenge', amount: 0.01 })
      })

      app.get('/premium', fixedPrice(sangriaNet, { price: 0.01 }), (c) => {
        return c.json({ message: 'success', payment: getSangriaNet(c) })
      })

      const req = new Request('http://localhost/premium')
      const res = await app.request(req)

      expect(res.status).toBe(402)
      expect(res.headers.get('PAYMENT-REQUIRED')).toBeDefined()
      expect(await res.json()).toEqual({ challenge: 'test-challenge', amount: 0.01 })
    })

    it('should proceed to handler when valid payment is provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          transaction: 'tx123'
        })
      })

      app.get('/premium', fixedPrice(sangriaNet, { price: 0.01 }), (c) => {
        return c.json({ message: 'success', payment: getSangriaNet(c) })
      })

      const req = new Request('http://localhost/premium', {
        headers: { 'payment-signature': 'valid-payment-header' }
      })
      const res = await app.request(req)

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        message: 'success',
        payment: {
          paid: true,
          amount: 0.01,
          transaction: 'tx123'
        }
      })
    })

    it('should handle invalid payment header', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error_message: 'Invalid signature',
          error_reason: 'INVALID_SIGNATURE'
        })
      })

      app.get('/premium', fixedPrice(sangriaNet, { price: 0.01 }), (c) => {
        return c.json({ message: 'success', payment: getSangriaNet(c) })
      })

      const req = new Request('http://localhost/premium', {
        headers: { 'payment-signature': 'invalid-payment-header' }
      })
      const res = await app.request(req)

      expect(res.status).toBe(402)
      expect(await res.json()).toEqual({
        error: 'Invalid signature',
        error_reason: 'INVALID_SIGNATURE'
      })
    })

    it('should bypass payment when configured', async () => {
      app.get('/premium',
        fixedPrice(sangriaNet, { price: 0.01 }, {
          bypassPaymentIf: (c) => c.req.header('x-bypass') === 'true'
        }),
        (c) => {
          return c.json({ message: 'success', payment: getSangriaNet(c) })
        }
      )

      const req = new Request('http://localhost/premium', {
        headers: { 'x-bypass': 'true' }
      })
      const res = await app.request(req)

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        message: 'success',
        payment: {
          paid: false,
          amount: 0
        }
      })
    })

    it('should construct correct resource URL', async () => {
      let capturedContext: any

      global.fetch = vi.fn().mockImplementation((url, options) => {
        capturedContext = JSON.parse(options.body as string)
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ challenge: 'test-challenge' })
        })
      })

      app.get('/premium', fixedPrice(sangriaNet, { price: 0.01 }), (c) => {
        return c.json({ message: 'success' })
      })

      const req = new Request('http://localhost/premium?param=value')
      await app.request(req)

      // Check that the resource URL was constructed correctly
      expect(capturedContext.resource).toBe('http://localhost/premium?param=value')
    })

    it('should handle API errors gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      })

      app.get('/premium', fixedPrice(sangriaNet, { price: 0.01 }), (c) => {
        return c.json({ message: 'success' })
      })

      const req = new Request('http://localhost/premium')
      const res = await app.request(req)

      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'Payment service unavailable' })
    })

    it('should handle missing payment context gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ challenge: 'test-challenge' })
      })

      app.get('/premium', fixedPrice(sangriaNet, { price: 0.01 }), (c) => {
        return c.json({ message: 'success', payment: getSangriaNet(c) })
      })

      const req = new Request('http://localhost/premium')
      const res = await app.request(req)

      expect(res.status).toBe(402)
    })
  })

  describe('getSangriaNet helper', () => {
    it('should return undefined when no payment context is set', async () => {
      app.get('/test', (c) => {
        const sangriaData = getSangriaNet(c)
        return c.json({ sangriaData })
      })

      const req = new Request('http://localhost/test')
      const res = await app.request(req)

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ sangriaData: undefined })
    })
  })
})