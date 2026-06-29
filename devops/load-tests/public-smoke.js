'use strict';

const autocannon = require('autocannon');

const BASE = process.env.TARGET_URL || 'http://localhost:5000';

const ENDPOINTS = [
  { method: 'GET', path: '/api/v1/health' },
  { method: 'GET', path: '/api/v1/products?limit=10' },
  { method: 'GET', path: '/api/v1/products/categories' },
];

function classify(result, rateLimited) {
  if (result.errors > 0) return 'fail';
  const realErrors = result.non2xx - rateLimited;
  if (realErrors > 0) return 'fail';
  if (rateLimited > 0) return 'rate-limited';
  return 'pass';
}

const STATUS_LABEL = {
  'pass':         '✅ PASS',
  'rate-limited': '✅ PASS (rate limiter engaged)',
  'fail':         '❌ FAIL',
};

async function run() {
  console.log(`\n🔍 Smoke test against ${BASE}`);
  console.log(`   ${ENDPOINTS.length} endpoints · 5s each · 2 connections\n`);

  for (const ep of ENDPOINTS) {
    const url = `${BASE}${ep.path}`;
    console.log(`── ${ep.method} ${ep.path} ──`);

    let rateLimited = 0;
    const result = await autocannon({
      url,
      method: ep.method,
      connections: 2,
      duration: 5,
      headers: { 'Accept': 'application/json' },
      setupClient: (client) => {
        client.on('response', (statusCode) => { if (statusCode === 429) rateLimited++; });
      },
    });

    const status = classify(result, rateLimited);
    console.log(`   Requests:  ${result.requests.total}`);
    console.log(`   Throughput: ${result.requests.average} req/s`);
    console.log(`   Latency:   p50=${result.latency.p50}ms  p97.5=${result.latency.p97_5}ms  p99=${result.latency.p99}ms`);
    console.log(`   Non-2xx:   ${result.non2xx}  (429 rate-limited: ${rateLimited})  Errors: ${result.errors}`);
    console.log(`   Result:    ${STATUS_LABEL[status]}\n`);

    if (status === 'fail') process.exitCode = 1;
  }
}

run();
