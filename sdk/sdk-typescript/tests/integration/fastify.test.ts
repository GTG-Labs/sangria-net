import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { SangriaNet } from '../../src/core.js'
import { fixedPrice, sangrianetPlugin } from '../../src/adapters/fastify.js'

describe('Fastify Adapter Integration', () => {
  let app: FastifyInstance
  let sangriaNet: SangriaNet
  const mockApiKey = 'test-api-key'

  beforeEach(async () => {
    app = Fastify()
    await app.register(sangrianetPlugin)
    sangriaNet = new SangriaNet({ apiKey: mockApiKey })
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await app.close()
    vi.restoreAllMocks()
  })

  describe('fixedPrice preHandler', () => {
    it('should return 402 when no payment header is provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ challenge: 'test-challenge', amount: 0.01 })
      })

      app.get('/premium', {
        preHandler: fixedPrice(sangriaNet, { price: 0.01 })
      }, async (request, reply) => {
        return { message: 'success', payment: request.sangrianet }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/premium'
      })

      expect(response.statusCode).toBe(402)
      expect(response.headers['payment-required']).toBeDefined()
      expect(JSON.parse(response.body)).toEqual({ challenge: 'test-challenge', amount: 0.01 })
    })

    it('should proceed to handler when valid payment is provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          transaction: 'tx123'
        })
      })

      app.get('/premium', {
        preHandler: fixedPrice(sangriaNet, { price: 0.01 })
      }, async (request, reply) => {
        return { message: 'success', payment: request.sangrianet }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/premium',
        headers: {
          'payment-signature': 'valid-payment-header'
        }
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual({
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

      app.get('/premium', {
        preHandler: fixedPrice(sangriaNet, { price: 0.01 })
      }, async (request, reply) => {
        return { message: 'success', payment: request.sangrianet }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/premium',
        headers: {
          'payment-signature': 'invalid-payment-header'
        }
      })

      expect(response.statusCode).toBe(402)
      expect(JSON.parse(response.body)).toEqual({
        error: 'Invalid signature',
        error_reason: 'INVALID_SIGNATURE'
      })
    })

    it('should bypass payment when configured', async () => {
      app.get('/premium', {
        preHandler: fixedPrice(sangriaNet, { price: 0.01 }, {
          bypassPaymentIf: (request) => request.headers['x-bypass'] === 'true'
        })
      }, async (request, reply) => {
        return { message: 'success', payment: request.sangrianet }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/premium',
        headers: {
          'x-bypass': 'true'
        }
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual({
        message: 'success',
        payment: {
          paid: false,
          amount: 0
        }
      })
    })

    it('should handle array payment headers correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          transaction: 'tx123'
        })
      })

      app.get('/premium', {
        preHandler: fixedPrice(sangriaNet, { price: 0.01 })
      }, async (request, reply) => {
        return { message: 'success', payment: request.sangrianet }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/premium',
        headers: {
          'payment-signature': ['valid-payment-header', 'duplicate']
        }
      })

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body.payment.paid).toBe(true)
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

      app.get('/premium', {
        preHandler: fixedPrice(sangriaNet, { price: 0.01 })
      }, async (request, reply) => {
        return { message: 'success' }
      })

      await app.inject({
        method: 'GET',
        url: '/premium?param=value'
      })

      // Check that the resource URL was constructed correctly
      expect(capturedContext.resource).toBe('http://localhost:80/premium?param=value')
    })

    it('should handle API errors gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      })

      app.get('/premium', {
        preHandler: fixedPrice(sangriaNet, { price: 0.01 })
      }, async (request, reply) => {
        return { message: 'success' }
      })

      const response = await app.inject({
        method: 'GET',
        url: '/premium'
      })

      expect(response.statusCode).toBe(500)
      expect(JSON.parse(response.body)).toEqual({ error: 'Payment service unavailable' })
    })
  })

  describe('sangrianetPlugin', () => {
    it('should register sangrianet property on request', async () => {
      const testApp = Fastify()
      await testApp.register(sangrianetPlugin)

      testApp.get('/test', async (request, reply) => {
        // Should be able to access request.sangrianet without TypeScript errors
        return { hasProperty: 'sangrianet' in request }
      })

      const response = await testApp.inject({
        method: 'GET',
        url: '/test'
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual({ hasProperty: true })

      await testApp.close()
    })
  })
})