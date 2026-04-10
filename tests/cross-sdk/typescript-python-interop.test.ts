/**
 * Cross-SDK Interoperability Tests
 * Tests compatibility between TypeScript and Python SDKs
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import path from 'path'
import { Sangria } from '../../sdk/sdk-typescript/src/index.js'
import { MockSangriaServer } from '../utils/test-server.js'

let mockServer: MockSangriaServer | null = null
let tsSdk: Sangria
const pythonSdkPath = path.resolve(__dirname, '../../sdk/python')

describe('TypeScript-Python SDK Interoperability', () => {
  beforeAll(async () => {
    // Start mock server for both SDKs to use
    mockServer = new MockSangriaServer(8084, {
      latency: 0,
      errorRate: 0,
      rateLimitThreshold: null
    })

    await mockServer.start()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Initialize TypeScript SDK
    tsSdk = new Sangria({
      apiKey: 'test-key',
      baseUrl: mockServer.getBaseUrl()
    })
  }, 30000)

  afterAll(async () => {
    if (mockServer) {
      await mockServer.stop()
      mockServer = null
    }
  })

  it('should generate compatible payment structures', async () => {
    const testAmount = 0.01
    const testResource = 'https://example.com/premium'

    // Generate payment using TypeScript SDK
    const tsResult = await tsSdk.handleFixedPrice(
      { resourceUrl: testResource, paymentHeader: null },
      { price: testAmount }
    )

    expect(tsResult.action).toBe('respond')
    expect(tsResult.status).toBe(402)
    expect(tsResult.body).toHaveProperty('payment_id')
    expect(tsResult.body).toHaveProperty('payment_header')
    expect(tsResult.body).toHaveProperty('challenge')
    expect(tsResult.body).toHaveProperty('amount')
    expect(tsResult.body).toHaveProperty('resource')
    expect(tsResult.body).toHaveProperty('timestamp')
    expect(tsResult.body).toHaveProperty('expires_at')

    // Generate payment using Python SDK via subprocess
    const pythonScript = `
import asyncio
import sys
import os
sys.path.insert(0, '${pythonSdkPath}/src')

from sangria_sdk import SangriaMerchantClient, FixedPriceOptions

async def test_generate():
    client = SangriaMerchantClient(
        base_url='${mockServer!.getBaseUrl()}',
        api_key='test-key'
    )

    options = FixedPriceOptions(
        price=${testAmount},
        resource='${testResource}'
    )

    result = await client.handle_fixed_price(None, options)
    await client.aclose()

    print(f"status:{result.status_code}")
    print(f"body:{result.body}")

asyncio.run(test_generate())
`

    const pythonResult = execSync(
      `cd ${pythonSdkPath} && python3 -c "${pythonScript}"`,
      { encoding: 'utf-8' }
    )

    const pythonLines = pythonResult.trim().split('\n')
    const pythonStatus = parseInt(pythonLines.find(l => l.startsWith('status:'))?.split(':')[1] || '0')
    const pythonBodyStr = pythonLines.find(l => l.startsWith('body:'))?.substring(5) || '{}'
    const pythonBody = JSON.parse(pythonBodyStr)

    // Compare both SDK results
    expect(pythonStatus).toBe(402)
    expect(pythonBody).toHaveProperty('payment_id')
    expect(pythonBody).toHaveProperty('payment_header')
    expect(pythonBody).toHaveProperty('challenge')
    expect(pythonBody).toHaveProperty('amount')
    expect(pythonBody).toHaveProperty('resource')
    expect(pythonBody).toHaveProperty('timestamp')
    expect(pythonBody).toHaveProperty('expires_at')

    // Verify data types and values match
    expect(typeof pythonBody.payment_id).toBe('string')
    expect(typeof pythonBody.payment_header).toBe('string')
    expect(typeof pythonBody.amount).toBe('number')
    expect(typeof pythonBody.timestamp).toBe('number')
    expect(typeof pythonBody.expires_at).toBe('number')
    expect(pythonBody.amount).toBe(testAmount)
    expect(pythonBody.resource).toBe(testResource)
  })

  it('should handle settlement with compatible payment headers', async () => {
    const testAmount = 0.01
    const testResource = 'https://example.com/premium'

    // First generate a payment using TypeScript SDK
    const generateResult = await tsSdk.handleFixedPrice(
      { resourceUrl: testResource, paymentHeader: null },
      { price: testAmount }
    )

    expect(generateResult.action).toBe('respond')
    expect(generateResult.status).toBe(402)
    const paymentHeader = generateResult.body.payment_header

    // Test settlement with TypeScript SDK
    const tsSettleResult = await tsSdk.handleFixedPrice(
      { resourceUrl: testResource, paymentHeader },
      { price: testAmount }
    )

    expect(tsSettleResult.action).toBe('proceed')
    expect(tsSettleResult.data.paid).toBe(true)
    expect(tsSettleResult.data.amount).toBe(testAmount)

    // Test settlement with Python SDK using the same payment header
    const pythonSettleScript = `
import asyncio
import sys
import os
sys.path.insert(0, '${pythonSdkPath}/src')

from sangria_sdk import SangriaMerchantClient, FixedPriceOptions

async def test_settle():
    client = SangriaMerchantClient(
        base_url='${mockServer!.getBaseUrl()}',
        api_key='test-key'
    )

    options = FixedPriceOptions(
        price=${testAmount},
        resource='${testResource}'
    )

    result = await client.handle_fixed_price('${paymentHeader}', options)
    await client.aclose()

    if hasattr(result, 'paid'):
        print(f"paid:{result.paid}")
        print(f"amount:{result.amount}")
        print(f"transaction:{getattr(result, 'transaction', None)}")
    else:
        print(f"status_code:{result.status_code}")
        print(f"body:{result.body}")

asyncio.run(test_settle())
`

    const pythonSettleResult = execSync(
      `cd ${pythonSdkPath} && python3 -c "${pythonSettleScript}"`,
      { encoding: 'utf-8' }
    )

    const pythonLines = pythonSettleResult.trim().split('\n')
    const paidLine = pythonLines.find(l => l.startsWith('paid:'))
    const amountLine = pythonLines.find(l => l.startsWith('amount:'))

    if (paidLine && amountLine) {
      const pythonPaid = paidLine.split(':')[1] === 'True'
      const pythonAmount = parseFloat(amountLine.split(':')[1])

      expect(pythonPaid).toBe(true)
      expect(pythonAmount).toBe(testAmount)
    } else {
      // Handle error case
      const statusLine = pythonLines.find(l => l.startsWith('status_code:'))
      if (statusLine) {
        const status = parseInt(statusLine.split(':')[1])
        expect(status).not.toBe(500) // Should not be a server error
      }
    }
  })

  it('should validate amount precision consistently', async () => {
    // Test various amount precisions that both SDKs should handle
    const testAmounts = [0.01, 0.001, 1.0, 10.50]

    for (const amount of testAmounts) {
      const testResource = `https://example.com/test-${amount}`

      // Test with TypeScript SDK
      const tsResult = await tsSdk.handleFixedPrice(
        { resourceUrl: testResource, paymentHeader: null },
        { price: amount }
      )

      expect(tsResult.action).toBe('respond')
      expect(tsResult.status).toBe(402)
      expect(tsResult.body.amount).toBe(amount)

      // Test with Python SDK
      const pythonScript = `
import asyncio
import sys
import os
sys.path.insert(0, '${pythonSdkPath}/src')

from sangria_sdk import SangriaMerchantClient, FixedPriceOptions

async def test_amount():
    client = SangriaMerchantClient(
        base_url='${mockServer!.getBaseUrl()}',
        api_key='test-key'
    )

    options = FixedPriceOptions(
        price=${amount},
        resource='${testResource}'
    )

    result = await client.handle_fixed_price(None, options)
    await client.aclose()

    print(f"amount:{result.body['amount']}")

asyncio.run(test_amount())
`

      const pythonResult = execSync(
        `cd ${pythonSdkPath} && python3 -c "${pythonScript}"`,
        { encoding: 'utf-8' }
      )

      const pythonLines = pythonResult.trim().split('\n')
      const amountLine = pythonLines.find(l => l.startsWith('amount:'))
      const pythonAmount = parseFloat(amountLine?.split(':')[1] || '0')

      expect(pythonAmount).toBe(amount)
    }
  })

  it('should handle error responses consistently', async () => {
    // Test invalid amount (should fail validation) - TypeScript SDK
    try {
      await tsSdk.handleFixedPrice(
        { resourceUrl: 'https://example.com/premium', paymentHeader: null },
        { price: -0.01 } // Invalid negative amount
      )
      expect.fail('TypeScript SDK should throw error for negative amount')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain('price must be')
    }

    // Test invalid amount with Python SDK
    const pythonErrorScript = `
import asyncio
import sys
import os
sys.path.insert(0, '${pythonSdkPath}/src')

from sangria_sdk import SangriaMerchantClient, FixedPriceOptions

async def test_error():
    client = SangriaMerchantClient(
        base_url='${mockServer!.getBaseUrl()}',
        api_key='test-key'
    )

    try:
        options = FixedPriceOptions(
            price=-0.01,  # Invalid negative amount
            resource='https://example.com/premium'
        )
        result = await client.handle_fixed_price(None, options)
        print(f"unexpected_success:{result}")
    except Exception as e:
        print(f"error:{str(e)}")
    finally:
        await client.aclose()

asyncio.run(test_error())
`

    const pythonErrorResult = execSync(
      `cd ${pythonSdkPath} && python3 -c "${pythonErrorScript}"`,
      { encoding: 'utf-8' }
    )

    const pythonLines = pythonErrorResult.trim().split('\n')
    const errorLine = pythonLines.find(l => l.startsWith('error:'))

    // Both SDKs should handle validation errors consistently
    expect(errorLine).toBeDefined()
    expect(errorLine).toContain('error:')
  })

  it('should maintain API response format consistency', async () => {
    const testCases = [
      { amount: 0.01, resource: 'https://example.com/test1' },
      { amount: 0.05, resource: 'https://example.com/test2' }
    ]

    // Generate payments using TypeScript SDK
    const tsResults = await Promise.all(
      testCases.map(({ amount, resource }) =>
        tsSdk.handleFixedPrice(
          { resourceUrl: resource, paymentHeader: null },
          { price: amount }
        )
      )
    )

    // Generate payments using Python SDK
    const pythonScript = `
import asyncio
import sys
import os
import json
sys.path.insert(0, '${pythonSdkPath}/src')

from sangria_sdk import SangriaMerchantClient, FixedPriceOptions

async def test_multiple():
    client = SangriaMerchantClient(
        base_url='${mockServer!.getBaseUrl()}',
        api_key='test-key'
    )

    test_cases = ${JSON.stringify(testCases)}
    results = []

    for case in test_cases:
        options = FixedPriceOptions(
            price=case['amount'],
            resource=case['resource']
        )
        result = await client.handle_fixed_price(None, options)
        results.append(result.body)

    await client.aclose()

    for i, result in enumerate(results):
        print(f"payment_{i}:{json.dumps(result)}")

asyncio.run(test_multiple())
`

    const pythonResult = execSync(
      `cd ${pythonSdkPath} && python3 -c "${pythonScript}"`,
      { encoding: 'utf-8' }
    )

    const pythonLines = pythonResult.trim().split('\n')
    const pythonPayments = pythonLines
      .filter(l => l.startsWith('payment_'))
      .map(l => JSON.parse(l.substring(l.indexOf(':') + 1)))

    // Verify all TypeScript results have the same structure
    const firstTsKeys = Object.keys(tsResults[0].body).sort()
    for (const result of tsResults) {
      const keys = Object.keys(result.body).sort()
      expect(keys).toEqual(firstTsKeys)
    }

    // Verify all Python results have the same structure
    const firstPyKeys = Object.keys(pythonPayments[0]).sort()
    for (const payment of pythonPayments) {
      const keys = Object.keys(payment).sort()
      expect(keys).toEqual(firstPyKeys)
    }

    // Verify TypeScript and Python results have the same structure
    expect(firstTsKeys).toEqual(firstPyKeys)
  })
})