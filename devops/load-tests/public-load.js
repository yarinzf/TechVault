'use strict';

const autocannon = require('autocannon');

const BASE        = process.env.TARGET_URL   || 'http://localhost:5000';
const CONNECTIONS  = parseInt(process.env.CONNECTIONS || '10', 10);
const DURATION     = parseInt(process.env.DURATION    || '30', 10);

const ENDPOINTS = [
  { method: 'GET', path: '/api/v1/health',              label: 'Health' },
  { method: 'GET', path: '/api/v1/products?limit=20',   label: 'Products' },
  { method: 'GET', path: '/api/v1/products/categories',  label: 'Categories' },
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
  console.log(`\n📊 Load test against ${BASE}`);
  console.log(`   ${CONNECTIONS} connections · ${DURATION}s per endpoint\n`);

  const results = [];

  for (const ep of ENDPOINTS) {
    const url = `${BASE}${ep.path}`;
    console.log(`── ${ep.label}: ${ep.method} ${ep.path} ──`);

    let rateLimited = 0;
    const result = await autocannon({
      url,
      method: ep.method,
      connections: CONNECTIONS,
      duration: DURATION,
      headers: { 'Accept': 'application/json' },
      setupClient: (client) => {
        client.on('response', (statusCode) => { if (statusCode === 429) rateLimited++; });
      },
    });

    const status = classify(result, rateLimited);
    const summary = {
      endpoint: ep.label,
      reqTotal: result.requests.total,
      reqPerSec: result.requests.average,
      latencyP50: result.latency.p50,
      latencyP97: result.latency.p97_5,
      latencyP99: result.latency.p99,
      non2xx: result.non2xx,
      rateLimited,
      errors: result.errors,
      status,
    };
    results.push(summary);

    console.log(`   Total:     ${summary.reqTotal} requests`);
    console.log(`   Throughput: ${summary.reqPerSec} req/s`);
    console.log(`   Latency:   p50=${summary.latencyP50}ms  p97.5=${summary.latencyP97}ms  p99=${summary.latencyP99}ms`);
    console.log(`   Non-2xx:   ${summary.non2xx}  (429 rate-limited: ${rateLimited})  Errors: ${summary.errors}`);
    console.log(`   Result:    ${STATUS_LABEL[status]}\n`);

    if (status === 'fail') process.exitCode = 1;
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Endpoint       │ req/s  │ p50   │ p97.5 │ p99   │  429 │ Err │ Status');
  console.log('  ───────────────┼────────┼───────┼───────┼───────┼──────┼─────┼───────');
  for (const r of results) {
    const name = r.endpoint.padEnd(15);
    const tag = r.status === 'pass' ? 'PASS' : r.status === 'rate-limited' ? 'PASS*' : 'FAIL';
    console.log(`  ${name}│ ${String(r.reqPerSec).padStart(6)} │ ${String(r.latencyP50).padStart(5)} │ ${String(r.latencyP97).padStart(5)} │ ${String(r.latencyP99).padStart(5)} │ ${String(r.rateLimited).padStart(4)} │ ${String(r.errors).padStart(3)} │ ${tag}`);
  }
  console.log('  ─────────────────────────────────────────────────────────────');
  console.log('  * PASS* = all non-2xx were 429 rate-limiter responses (expected)');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

run();
