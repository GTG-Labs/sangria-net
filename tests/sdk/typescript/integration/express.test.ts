import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import { SangriaNet } from '../../src/core.js'
import { fixedPrice } from '../../src/adapters/express.js'

describe('Express Adapter Integration', () => {
  let app: Express
  let sangriaNet: SangriaNet
  const mockApiKey = 'test-api-key'

  beforeEach(() => {
    app = express()
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

      app.get('/premium', fixedPrice(sangriaNet, { price: 0.01 }), (req, res) => {
        res.json({ message: 'success', payment: req.sangrianet })
      })

      const response = await request(app)
        .get('/premium')
        .expect(402)

      expect(response.headers['payment-required']).toBeDefined()
      expect(response.body).toEqual({ challenge: 'test-challenge', amount: 0.01 })
    })

    it('should proceed to handler when valid payment is provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          transaction: 'tx123'
        })
      })

      app.get('/premium', fixedPrice(sangriaNet, { price: 0.01 }), (req, res) => {
        res.json({ message: 'success', payment: req.sangrianet })
      })

      const response = await request(app)
        .get('/premium')
        .set('payment-signature', 'valid-payment-header')
        .expect(200)

      expect(response.body).toEqual({
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

      app.get('/premium', fixedPrice(sangriaNet, { price: 0.01 }), (req, res) => {
        res.json({ message: 'success', payment: req.sangrianet })
      })

      const response = await request(app)
        .get('/premium')
        .set('payment-signature', 'invalid-payment-header')
        .expect(402)

      expect(response.body).toEqual({
        error: 'Invalid signature',
        error_reason: 'INVALID_SIGNATURE'
      })
    })

    it('should bypass payment when configured', async () => {
      app.get('/premium',
        fixedPrice(sangriaNet, { price: 0.01 }, {
          bypassPaymentIf: (req) => req.headers['x-bypass'] === 'true'
        }),
        (req, res) => {
          res.json({ message: 'success', payment: req.sangrianet })
        }
      )

      const response = await request(app)
        .get('/premium')
        .set('x-bypass', 'true')
        .expect(200)

      expect(response.body).toEqual({
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

      app.use((req, res, next) => {
        // Simulate array headers (can happen with some proxy configurations)
        req.headers['payment-signature'] = ['valid-payment-header', 'duplicate'] as any
        next()
      })

      app.get('/premium', fixedPrice(sangriaNet, { price: 0.01 }), (req, res) => {
        res.json({ message: 'success', payment: req.sangrianet })
      })

      const response = await request(app)
        .get('/premium')
        .expect(200)

      expect(response.body.payment.paid).toBe(true)
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

      app.get('/premium', fixedPrice(sangriaNet, { price: 0.01 }), (req, res) => {
        res.json({ message: 'success' })
      })

      await request(app)
        .get('/premium?param=value')
        .expect(402)

      // Check that the resource URL was constructed correctly
      expect(capturedContext.resource).toMatch(/http:\/\/127\.0\.0\.1:\d+\/premium\?param=value/)
    })

    it('should handle API errors gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      })

      app.get('/premium', fixedPrice(sangriaNet, { price: 0.01 }), (req, res) => {
        res.json({ message: 'success' })
      })

      const response = await request(app)
        .get('/premium')
        .expect(500)

      expect(response.body).toEqual({ error: 'Payment service unavailable' })
    })
  })
})