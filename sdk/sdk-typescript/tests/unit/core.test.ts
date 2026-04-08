import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SangriaNet } from '../../src/core.js'
import type { PaymentContext, FixedPriceOptions } from '../../src/types.js'

describe('SangriaNet Core', () => {
  let sangriaNet: SangriaNet
  const mockApiKey = 'test-api-key'
  const mockBaseUrl = 'https://api.test.com'

  beforeEach(() => {
    sangriaNet = new SangriaNet({ apiKey: mockApiKey, baseUrl: mockBaseUrl })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should create instance with valid config', () => {
      const instance = new SangriaNet({ apiKey: 'test-key' })
      expect(instance).toBeInstanceOf(SangriaNet)
    })

    it('should throw error when apiKey is missing', () => {
      expect(() => new SangriaNet({ apiKey: '' })).toThrow('SangriaNet: apiKey is required')
    })

    it('should use default baseUrl when not provided', () => {
      const instance = new SangriaNet({ apiKey: 'test-key' })
      expect(instance).toBeInstanceOf(SangriaNet)
    })

    it('should remove trailing slashes from baseUrl', () => {
      const instance = new SangriaNet({
        apiKey: 'test-key',
        baseUrl: 'https://api.test.com///'
      })
      expect(instance).toBeInstanceOf(SangriaNet)
    })
  })

  describe('handleFixedPrice', () => {
    const validOptions: FixedPriceOptions = { price: 0.01, description: 'Test payment' }
    const validContext: PaymentContext = {
      paymentHeader: undefined,
      resourceUrl: 'https://example.com/premium'
    }

    it('should validate price options', async () => {
      const invalidOptions = { price: -1 }
      await expect(
        sangriaNet.handleFixedPrice(validContext, invalidOptions)
      ).rejects.toThrow('price must be a finite number greater than 0')
    })

    it('should call generatePayment when no payment header provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ challenge: 'test-challenge' })
      })

      const result = await sangriaNet.handleFixedPrice(validContext, validOptions)

      expect(result.action).toBe('respond')
      expect(result.status).toBe(402)
      expect(result.headers).toHaveProperty('PAYMENT-REQUIRED')
    })

    it('should call settlePayment when payment header is provided', async () => {
      const contextWithPayment = {
        ...validContext,
        paymentHeader: 'test-payment-header'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          transaction: 'tx123'
        })
      })

      const result = await sangriaNet.handleFixedPrice(contextWithPayment, validOptions)

      expect(result.action).toBe('proceed')
      if (result.action === 'proceed') {
        expect(result.data.paid).toBe(true)
        expect(result.data.amount).toBe(0.01)
        expect(result.data.transaction).toBe('tx123')
      }
    })

    it('should handle generatePayment API errors gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500
      })

      const result = await sangriaNet.handleFixedPrice(validContext, validOptions)

      expect(result.action).toBe('respond')
      expect(result.status).toBe(500)
      expect(result.body).toEqual({ error: 'Payment service unavailable' })
    })

    it('should handle settlePayment failures', async () => {
      const contextWithPayment = {
        ...validContext,
        paymentHeader: 'invalid-payment-header'
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error_message: 'Invalid payment',
          error_reason: 'INVALID_SIGNATURE'
        })
      })

      const result = await sangriaNet.handleFixedPrice(contextWithPayment, validOptions)

      expect(result.action).toBe('respond')
      expect(result.status).toBe(402)
      if (result.action === 'respond') {
        expect(result.body).toEqual({
          error: 'Invalid payment',
          error_reason: 'INVALID_SIGNATURE'
        })
      }
    })

    it('should handle network errors during settlement', async () => {
      const contextWithPayment = {
        ...validContext,
        paymentHeader: 'test-payment-header'
      }

      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const result = await sangriaNet.handleFixedPrice(contextWithPayment, validOptions)

      expect(result.action).toBe('respond')
      expect(result.status).toBe(500)
      expect(result.body).toEqual({ error: 'Payment settlement failed' })
    })
  })

  describe('price validation', () => {
    const validContext: PaymentContext = {
      paymentHeader: undefined,
      resourceUrl: 'https://example.com/premium'
    }

    it('should reject zero price', async () => {
      await expect(
        sangriaNet.handleFixedPrice(validContext, { price: 0 })
      ).rejects.toThrow('price must be a finite number greater than 0')
    })

    it('should reject negative price', async () => {
      await expect(
        sangriaNet.handleFixedPrice(validContext, { price: -0.01 })
      ).rejects.toThrow('price must be a finite number greater than 0')
    })

    it('should reject infinite price', async () => {
      await expect(
        sangriaNet.handleFixedPrice(validContext, { price: Infinity })
      ).rejects.toThrow('price must be a finite number greater than 0')
    })

    it('should reject NaN price', async () => {
      await expect(
        sangriaNet.handleFixedPrice(validContext, { price: NaN })
      ).rejects.toThrow('price must be a finite number greater than 0')
    })

    it('should accept valid positive price', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ challenge: 'test' })
      })

      const result = await sangriaNet.handleFixedPrice(validContext, { price: 0.01 })
      expect(result.action).toBe('respond')
      expect(result.status).toBe(402)
    })
  })
})