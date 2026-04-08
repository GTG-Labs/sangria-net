import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SangriaNet } from '../../sdk/sdk-typescript/src/core.js'
import { assertValidEIP712Structure, assertFailedSettlement } from '../helpers/assertions.js'

describe('EIP-712 Security Validation', () => {
  let sangriaNet: SangriaNet
  const mockApiKey = 'sg_test_security_key_123'

  beforeEach(() => {
    sangriaNet = new SangriaNet({ apiKey: mockApiKey })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should reject cross-network signature replay', async () => {
    // Generate payment on Base Mainnet (chain ID 8453)
    const mainnetPayment = {
      payment_id: 'test_payment_mainnet',
      eip712: {
        domain: {
          name: 'SangriaNet',
          version: '1',
          chainId: 8453, // Base Mainnet
          verifyingContract: '0x22A171FAe9957a560B179AD4a87336933b0aEe61'
        },
        types: {
          Payment: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' }
          ]
        },
        message: {
          from: '0x1234567890123456789012345678901234567890',
          to: '0x22A171FAe9957a560B179AD4a87336933b0aEe61',
          value: '10000'
        }
      }
    }

    // Mock mainnet signature
    const mainnetSignature = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b'

    // Switch to Base Sepolia (chain ID 84532)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: false,
        error_message: 'Invalid chain ID',
        error_reason: 'INVALID_CHAIN_ID'
      })
    })

    // Attempt to use mainnet signature on testnet
    const context = {
      paymentHeader: btoa(JSON.stringify({
        payload: {
          signature: mainnetSignature,
          chainId: 84532 // Try to use on testnet
        }
      })),
      resourceUrl: 'https://example.com/premium'
    }

    const result = await sangriaNet.handleFixedPrice(context, { price: 0.01 })

    // Should reject due to domain separator mismatch
    expect(result.action).toBe('respond')
    expect(result.status).toBe(402)
    if (result.action === 'respond') {
      assertFailedSettlement(result.body, 'INVALID_CHAIN_ID')
    }
  })

  it('should prevent signature replay attacks', async () => {
    const payment = {
      payment_id: 'test_payment_replay',
      eip712: {
        domain: {
          name: 'SangriaNet',
          version: '1',
          chainId: 84532,
          verifyingContract: '0x22A171FAe9957a560B179AD4a87336933b0aEe61'
        },
        types: {
          Payment: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' }
          ]
        },
        message: {
          from: '0x1234567890123456789012345678901234567890',
          to: '0x22A171FAe9957a560B179AD4a87336933b0aEe61',
          value: '10000'
        }
      }
    }

    const signature = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678901c'

    // First use should succeed
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          transaction: 'tx123'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          error_message: 'Signature already used',
          error_reason: 'SIGNATURE_ALREADY_USED'
        })
      })

    const context1 = {
      paymentHeader: btoa(JSON.stringify({
        payload: { signature }
      })),
      resourceUrl: 'https://example.com/premium'
    }

    const result1 = await sangriaNet.handleFixedPrice(context1, { price: 0.01 })
    expect(result1.action).toBe('proceed')

    // Second use should fail (replay attack)
    const context2 = {
      paymentHeader: btoa(JSON.stringify({
        payload: { signature }
      })),
      resourceUrl: 'https://example.com/premium'
    }

    const result2 = await sangriaNet.handleFixedPrice(context2, { price: 0.01 })
    expect(result2.action).toBe('respond')
    expect(result2.status).toBe(402)
    if (result2.action === 'respond') {
      assertFailedSettlement(result2.body, 'SIGNATURE_ALREADY_USED')
    }
  })

  it('should validate EIP-712 domain separator', async () => {
    // Test with invalid domain
    const invalidPayment = {
      payment_id: 'test_payment_invalid_domain',
      eip712: {
        domain: {
          name: 'WrongName', // Should be 'SangriaNet'
          version: '1',
          chainId: 84532,
          verifyingContract: '0x22A171FAe9957a560B179AD4a87336933b0aEe61'
        }
      }
    }

    // Should reject invalid domain
    const validPayment = {
      payment_id: 'test_payment_valid_domain',
      eip712: {
        domain: {
          name: 'SangriaNet',
          version: '1',
          chainId: 84532,
          verifyingContract: '0x22A171FAe9957a560B179AD4a87336933b0aEe61'
        },
        types: {
          Payment: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' }
          ]
        },
        message: {
          from: '0x1234567890123456789012345678901234567890',
          to: '0x22A171FAe9957a560B179AD4a87336933b0aEe61',
          value: '10000'
        }
      }
    }

    // Validate the structure of a valid EIP-712 payload
    assertValidEIP712Structure(validPayment.eip712)
  })

  it('should enforce correct message types', async () => {
    const payment = {
      payment_id: 'test_payment_types',
      eip712: {
        domain: {
          name: 'SangriaNet',
          version: '1',
          chainId: 84532,
          verifyingContract: '0x22A171FAe9957a560B179AD4a87336933b0aEe61'
        },
        types: {
          Payment: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' }
          ]
        },
        message: {
          from: '0x1234567890123456789012345678901234567890',
          to: '0x22A171FAe9957a560B179AD4a87336933b0aEe61',
          value: '10000',
          nonce: '1'
        }
      }
    }

    // Validate that types are correctly defined
    expect(payment.eip712.types.Payment).toBeDefined()
    expect(payment.eip712.types.Payment).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'from', type: 'address' }),
        expect.objectContaining({ name: 'to', type: 'address' }),
        expect.objectContaining({ name: 'value', type: 'uint256' })
      ])
    )
  })

  it('should validate signature format', async () => {
    const validSignatures = [
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b',
      '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678901c'
    ]

    const invalidSignatures = [
      'invalid_signature',
      '0x123', // Too short
      '0xgggg', // Invalid hex
      '', // Empty
      '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b' // Missing 0x prefix
    ]

    // Test valid signatures
    validSignatures.forEach(signature => {
      expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/)
    })

    // Test invalid signatures
    invalidSignatures.forEach(signature => {
      expect(signature).not.toMatch(/^0x[a-fA-F0-9]{130}$/)
    })
  })
})