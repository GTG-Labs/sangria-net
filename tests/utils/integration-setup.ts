/**
 * Integration test setup
 * Configures test servers and dependencies for integration testing
 */

import { beforeAll, afterAll, vi } from 'vitest'
import { MockSangriaServer, FrameworkTestServers } from './test-server.js'

let mockServer: MockSangriaServer | null = null
let frameworkServers: FrameworkTestServers | null = null

// Capture original environment variables for restoration
let originalTestApiBaseUrl: string | undefined
let originalIntegrationTestMode: string | undefined

beforeAll(async () => {
  console.log('🔧 Setting up integration test environment...')

  // Capture original environment variable values
  originalTestApiBaseUrl = process.env.TEST_API_BASE_URL
  originalIntegrationTestMode = process.env.INTEGRATION_TEST_MODE

  // Start mock Sangria server
  mockServer = new MockSangriaServer(8080, {
    latency: 10, // Small latency for realistic testing
    errorRate: 0.01 // 1% error rate
  })
  await mockServer.start()

  // Start framework test servers
  frameworkServers = new FrameworkTestServers()

  // Set environment variables for integration tests
  process.env.TEST_API_BASE_URL = mockServer.getBaseUrl()
  process.env.INTEGRATION_TEST_MODE = 'true'

  console.log('✅ Integration test environment ready')
})

afterAll(async () => {
  console.log('🧹 Cleaning up integration test environment...')

  // Stop all test servers
  if (mockServer) {
    await mockServer.stop()
    mockServer = null
  }

  if (frameworkServers) {
    await frameworkServers.stopAll()
    frameworkServers = null
  }

  // Restore original environment variables
  if (originalTestApiBaseUrl !== undefined) {
    process.env.TEST_API_BASE_URL = originalTestApiBaseUrl
  } else {
    delete process.env.TEST_API_BASE_URL
  }

  if (originalIntegrationTestMode !== undefined) {
    process.env.INTEGRATION_TEST_MODE = originalIntegrationTestMode
  } else {
    delete process.env.INTEGRATION_TEST_MODE
  }

  console.log('✅ Integration test cleanup completed')
})

/**
 * Get the mock server instance for tests
 */
export function getMockServer(): MockSangriaServer {
  if (!mockServer) {
    throw new Error('Mock server not initialized. Make sure integration setup ran.')
  }
  return mockServer
}

/**
 * Get the framework servers instance for tests
 */
export function getFrameworkServers(): FrameworkTestServers {
  if (!frameworkServers) {
    throw new Error('Framework servers not initialized. Make sure integration setup ran.')
  }
  return frameworkServers
}