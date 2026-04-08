// K6 Load Testing Script for SangriaNet Payment API
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const paymentGenerationErrors = new Rate('payment_generation_errors');
const paymentSettlementErrors = new Rate('payment_settlement_errors');
const paymentGenerationDuration = new Trend('payment_generation_duration');
const paymentSettlementDuration = new Trend('payment_settlement_duration');

// Load test configuration
export let options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '5m', target: 500 },   // Stay at 500 users
    { duration: '2m', target: 1000 },  // Ramp to 1000 users
    { duration: '5m', target: 1000 },  // Stay at 1000 users
    { duration: '2m', target: 0 },     // Scale down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],                    // 95% of requests under 500ms
    'http_req_duration{payment:settlement}': ['p(95)<2000'], // Settlement under 2s
    'http_req_failed': ['rate<0.01'],                      // Error rate under 1%
    'payment_generation_errors': ['rate<0.01'],           // Payment generation errors under 1%
    'payment_settlement_errors': ['rate<0.05'],           // Settlement errors under 5%
  },
};

// Test configuration
const BASE_URL = __ENV.BACKEND_URL || 'http://localhost:8000';
const API_KEY = __ENV.API_KEY || 'sg_test_load_test_key_123';

export default function() {
  const paymentAmount = Math.random() * 0.99 + 0.01; // Random amount between 0.01 and 1.00
  const paymentDescription = `Load test payment ${Math.random().toString(36).substring(7)}`;

  // Test payment generation
  const generationStart = new Date();
  const paymentResponse = http.post(`${BASE_URL}/v1/generate-payment`, JSON.stringify({
    amount: paymentAmount,
    description: paymentDescription,
    resource: 'https://example.com/load-test'
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    tags: { payment: 'generation' }
  });

  const generationDuration = new Date() - generationStart;
  paymentGenerationDuration.add(generationDuration);

  const generationSuccess = check(paymentResponse, {
    'payment generation status is 200': (r) => r.status === 200,
    'payment generation time < 500ms': (r) => generationDuration < 500,
    'payment_id present': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.payment_id !== undefined;
      } catch (e) {
        return false;
      }
    },
    'accepts array present': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.accepts) && body.accepts.length > 0;
      } catch (e) {
        return false;
      }
    },
  });

  paymentGenerationErrors.add(!generationSuccess);

  if (paymentResponse.status === 200) {
    let paymentData;
    try {
      paymentData = JSON.parse(paymentResponse.body);
    } catch (e) {
      console.error('Failed to parse payment response:', paymentResponse.body);
      return;
    }

    // Generate mock signature for settlement testing
    const mockSignature = generateMockSignature(paymentData);

    // Test payment settlement
    const settlementStart = new Date();
    const settlementResponse = http.post(`${BASE_URL}/v1/settle-payment`, JSON.stringify({
      payment_payload: btoa(JSON.stringify({
        payload: {
          signature: mockSignature,
          from: '0x1234567890123456789012345678901234567890',
          to: paymentData.accepts[0].payTo || '0x22A171FAe9957a560B179AD4a87336933b0aEe61',
          value: paymentData.accepts[0].amount
        }
      }))
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      tags: { payment: 'settlement' }
    });

    const settlementDuration = new Date() - settlementStart;
    paymentSettlementDuration.add(settlementDuration);

    const settlementSuccess = check(settlementResponse, {
      'settlement status is 200 or 400': (r) => [200, 400].includes(r.status),
      'settlement time < 2000ms': (r) => settlementDuration < 2000,
      'settlement response is valid JSON': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch (e) {
          return false;
        }
      }
    });

    paymentSettlementErrors.add(!settlementSuccess);

    // Log settlement results for analysis
    if (settlementResponse.status === 200) {
      try {
        const settlementData = JSON.parse(settlementResponse.body);
        if (settlementData.success) {
          check(settlementData, {
            'transaction hash present': (d) => d.transaction && d.transaction.length > 0,
            'payer address present': (d) => d.payer && d.payer.startsWith('0x'),
          });
        }
      } catch (e) {
        console.error('Failed to parse settlement response:', settlementResponse.body);
      }
    }
  } else {
    console.error(`Payment generation failed: ${paymentResponse.status} - ${paymentResponse.body}`);
  }

  // Random sleep between 0.5 and 2 seconds to simulate realistic user behavior
  sleep(Math.random() * 1.5 + 0.5);
}

// Generate a mock signature for testing purposes
function generateMockSignature(paymentData) {
  // In a real test, this would be a proper EIP-712 signature
  // For load testing, we use a mock signature that the test facilitator can recognize
  const mockSignatures = [
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b',
    '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678901c',
    '0x987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba01d'
  ];

  return mockSignatures[Math.floor(Math.random() * mockSignatures.length)];
}

// Setup function run once at the beginning
export function setup() {
  console.log('Starting load test against:', BASE_URL);
  console.log('Using API key:', API_KEY ? 'Provided' : 'Default');

  // Health check
  const healthResponse = http.get(`${BASE_URL}/health`);
  if (healthResponse.status !== 200) {
    console.error('Health check failed. Backend may not be available.');
  }

  return { baseUrl: BASE_URL, apiKey: API_KEY };
}

// Teardown function run once at the end
export function teardown(data) {
  console.log('Load test completed for:', data.baseUrl);
}