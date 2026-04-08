import { expect } from 'vitest'

// Custom test assertions for SangriaNet testing

/**
 * Assert that a payment response has the correct structure
 */
export function assertValidPaymentResponse(response: any, expectedAmount?: number) {
  expect(response).toHaveProperty('payment_id')
  expect(response).toHaveProperty('accepts')
  expect(response.accepts).toBeInstanceOf(Array)
  expect(response.accepts.length).toBeGreaterThan(0)

  const paymentReq = response.accepts[0]
  expect(paymentReq).toHaveProperty('scheme')
  expect(paymentReq).toHaveProperty('amount')
  expect(paymentReq).toHaveProperty('asset')
  expect(paymentReq).toHaveProperty('network')

  if (expectedAmount !== undefined) {
    // Convert expectedAmount to micro units for comparison
    const expectedMicro = (expectedAmount * 1e6).toString()
    expect(paymentReq.amount).toBe(expectedMicro)
  }
}

/**
 * Assert that an EIP-712 signature structure is valid
 */
export function assertValidEIP712Structure(eip712: any) {
  expect(eip712).toHaveProperty('domain')
  expect(eip712).toHaveProperty('types')
  expect(eip712).toHaveProperty('message')

  // Domain validation
  expect(eip712.domain).toHaveProperty('name', 'SangriaNet')
  expect(eip712.domain).toHaveProperty('version', '1')
  expect(eip712.domain).toHaveProperty('chainId')
  expect(eip712.domain).toHaveProperty('verifyingContract')

  // Chain ID should be valid (Base mainnet or testnet)
  expect([8453, 84532]).toContain(eip712.domain.chainId)
}

/**
 * Assert that error response has correct structure
 */
export function assertValidErrorResponse(response: any, expectedStatus: number, expectedMessage?: string) {
  expect(response.status).toBe(expectedStatus)
  expect(response.body).toHaveProperty('error')

  if (expectedMessage) {
    expect(response.body.error).toContain(expectedMessage)
  }
}

/**
 * Assert that settlement response is successful
 */
export function assertSuccessfulSettlement(response: any) {
  expect(response).toHaveProperty('success', true)
  expect(response).toHaveProperty('transaction')
  expect(response).toHaveProperty('payer')
  expect(response.transaction).toMatch(/^(0x)?[a-fA-F0-9]{64}$/)
  expect(response.payer).toMatch(/^0x[a-fA-F0-9]{40}$/)
}

/**
 * Assert that settlement response indicates failure
 */
export function assertFailedSettlement(response: any, expectedReason?: string) {
  expect(response).toHaveProperty('success', false)

  if (expectedReason) {
    expect(response).toHaveProperty('error_reason', expectedReason)
  }
}

/**
 * Assert that a wallet address is valid Ethereum format
 */
export function assertValidWalletAddress(address: string) {
  expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/)
}

/**
 * Assert that an API key has valid format
 */
export function assertValidAPIKeyFormat(apiKey: string) {
  expect(apiKey).toMatch(/^sg_(test_|live_)[a-zA-Z0-9_]+$/)
}

/**
 * Assert that response time is within acceptable limits
 */
export function assertResponseTime(startTime: number, maxMs: number) {
  const duration = Date.now() - startTime
  expect(duration).toBeLessThan(maxMs)
}

/**
 * Assert that payment header is properly base64 encoded
 */
export function assertValidPaymentHeader(header: string) {
  expect(header).toBeTruthy()

  // Should be valid base64
  expect(() => {
    const decoded = atob(header)
    JSON.parse(decoded)
  }).not.toThrow()
}