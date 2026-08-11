#!/usr/bin/env node
'use strict';

/**
 * loadBurstTest.js — lightweight, repeatable local/QA resilience test.
 *
 * Reproduces the exact scenario reported in production: a user rapidly
 * reloading the site (public catalog GETs + authenticated auth/me+cart+
 * wishlist calls) for well under a minute, plus a separate check that
 * auth-endpoint abuse is still correctly rate-limited.
 *
 * NOT a DDoS tool. Bursts are small, fixed, and batched with modest
 * concurrency — the same order of magnitude as a real (if aggressive) human
 * mashing F5, not a flood. Defaults to localhost and REFUSES to run against
 * anything else unless --allow-remote is explicitly passed — this script
 * must never be pointed at production by accident or by default.
 *
 * Usage:
 *   node devops/scripts/loadBurstTest.js
 *   node devops/scripts/loadBurstTest.js --base-url=http://localhost:5000
 *   node devops/scripts/loadBurstTest.js --base-url=https://staging.example.com --allow-remote
 */

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};

const BASE_URL = getArg('base-url', 'http://localhost:5000');
const API = `${BASE_URL}/api/v1`;
const ALLOW_REMOTE = args.includes('--allow-remote');

const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(BASE_URL);
if (!isLocal && !ALLOW_REMOTE) {
  console.error(`\nREFUSING TO RUN: "${BASE_URL}" does not look like localhost.`);
  console.error('This tool must never target production by accident.');
  console.error('If you really mean to point this at a non-local environment (e.g. staging),');
  console.error('pass --allow-remote explicitly. Production is never an appropriate target for this tool.\n');
  process.exit(1);
}

// ── Small helpers ────────────────────────────────────────────────────────────
async function timedRequest(method, path, opts = {}) {
  const start = Date.now();
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    await res.arrayBuffer().catch(() => {}); // drain body, don't care about content
    return { status: res.status, ms: Date.now() - start };
  } catch (err) {
    return { status: 'ERR', ms: Date.now() - start, error: err.message };
  }
}

// Fire `count` requests in batches of `concurrency` at a time — a realistic
// rapid-reload burst, not an unbounded parallel flood.
async function burst(count, concurrency, makeRequest) {
  const results = [];
  for (let i = 0; i < count; i += concurrency) {
    const batch = Array.from({ length: Math.min(concurrency, count - i) }, () => makeRequest());
    // eslint-disable-next-line no-await-in-loop
    results.push(...(await Promise.all(batch)));
  }
  return results;
}

function summarize(label, results, elapsedMs, { expect429 = false } = {}) {
  const statusCounts = {};
  for (const r of results) {
    const key = String(r.status);
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }
  const total = results.length;
  const rps = (total / (elapsedMs / 1000)).toFixed(1);
  const count429 = statusCounts['429'] || 0;
  const count5xx = Object.keys(statusCounts)
    .filter((k) => /^5\d\d$/.test(k))
    .reduce((sum, k) => sum + statusCounts[k], 0);
  const countErr = statusCounts['ERR'] || 0;

  console.log(`\n── ${label} ──`);
  console.log(`  Requests:     ${total}`);
  console.log(`  Elapsed:      ${elapsedMs}ms (${rps} req/sec)`);
  console.log(`  Status counts: ${JSON.stringify(statusCounts)}`);
  console.log(`  5xx responses: ${count5xx}${count5xx > 0 ? '  ⚠️  UNEXPECTED — investigate' : ''}`);
  console.log(`  Network errors: ${countErr}${countErr > 0 ? '  ⚠️  connection refused / timeout' : ''}`);
  if (expect429) {
    console.log(`  429 responses: ${count429}${count429 === 0 ? '  ⚠️  EXPECTED at least one — auth protection may be too loose' : '  ✓ expected (abuse correctly blocked)'}`);
  } else {
    console.log(`  429 responses: ${count429}${count429 > 0 ? '  ⚠️  UNEXPECTED — normal traffic should not be rate-limited' : '  ✓ none (as expected)'}`);
  }

  return { label, total, elapsedMs, rps: Number(rps), statusCounts, count429, count5xx, countErr, expect429 };
}

async function main() {
  console.log(`TechVault local/QA resilience burst test`);
  console.log(`Target: ${API}`);
  console.log(`(This tool never targets production automatically — see --allow-remote.)`);

  let environment = 'unknown';
  try {
    const health = await fetch(`${API}/health`).then((r) => r.json());
    environment = health?.data?.environment || 'unknown';
  } catch { /* health check itself is exercised below anyway */ }
  console.log(`Server environment: ${environment}`);
  if (environment === 'development') {
    console.log('Note: dev-mode rate limits are intentionally generous (see server/config/env.js) —');
    console.log('the auth-abuse phase below may not trigger a 429 here; it is verified precisely,');
    console.log('with deterministic small limits, by tests/rateLimiting.test.js instead.');
  }

  const reports = [];

  // ── Phase 1: homepage/public burst (50 requests) ─────────────────────────
  // Mirrors a real anonymous cold-load pattern (products/campaigns/currency)
  // repeated rapidly — the exact shape of "spamming F5" on the Home page.
  {
    const paths = ['/products?sort=popularity&limit=8', '/campaigns/weekly-deal', '/currency/for-country?country=Israel'];
    const start = Date.now();
    const results = await burst(50, 10, () => timedRequest('GET', paths[Math.floor(Math.random() * paths.length)]));
    reports.push(summarize('Phase 1 — Homepage/public burst (50 requests)', results, Date.now() - start));
  }

  // ── Phase 2: catalog burst (100 requests) ────────────────────────────────
  {
    const paths = ['/products?limit=12', '/products/categories', '/campaigns/weekly-deal'];
    const start = Date.now();
    const results = await burst(100, 15, () => timedRequest('GET', paths[Math.floor(Math.random() * paths.length)]));
    reports.push(summarize('Phase 2 — Catalog GET burst (100 requests)', results, Date.now() - start));
  }

  // ── Phase 3: authenticated repeated API calls ────────────────────────────
  // Registers a throwaway local test account (localhost-only by construction
  // — this phase is skipped entirely under --allow-remote to avoid creating
  // accounts on a non-local target) and repeats the real logged-in-reload
  // pattern (auth/me + cart + wishlist) rapidly.
  if (isLocal) {
    const email = `loadtest.${Date.now()}@example.com`;
    const regRes = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Load Test', email, password: 'LoadTest123!' }),
    });
    const regJson = await regRes.json().catch(() => null);
    const token = regJson?.data?.accessToken;

    if (token) {
      const authHeaders = { Authorization: `Bearer ${token}` };
      const paths = ['/auth/me', '/cart', '/wishlist'];
      const start = Date.now();
      const results = await burst(40, 8, () =>
        timedRequest('GET', paths[Math.floor(Math.random() * paths.length)], { headers: authHeaders }));
      reports.push(summarize('Phase 3 — Authenticated repeated API calls (40 requests)', results, Date.now() - start));
    } else {
      console.log('\n── Phase 3 — SKIPPED (could not obtain a test token; is the server running with a reachable DB?) ──');
    }
  } else {
    console.log('\n── Phase 3 — SKIPPED (only runs against a local target, to avoid creating accounts remotely) ──');
  }

  // ── Phase 4: auth endpoint abuse (separate — 429s here are EXPECTED) ─────
  {
    const start = Date.now();
    const results = await burst(20, 5, () =>
      timedRequest('POST', '/auth/login', { body: { email: 'nobody@example.com', password: 'wrong-password' } }));
    reports.push(summarize('Phase 4 — Auth endpoint abuse (20 login attempts, 429s EXPECTED)', results, Date.now() - start, { expect429: true }));
  }

  // ── Overall summary ───────────────────────────────────────────────────────
  console.log('\n══ Overall summary ══');
  let unexpected429 = 0;
  let total5xx = 0;
  for (const r of reports) {
    if (!r.expect429) unexpected429 += r.count429;
    total5xx += r.count5xx;
  }
  console.log(`  Unexpected 429s (normal traffic blocked): ${unexpected429}${unexpected429 > 0 ? '  ⚠️  FAIL — rate limits may be too tight' : '  ✓ PASS'}`);
  console.log(`  5xx responses across all phases:          ${total5xx}${total5xx > 0 ? '  ⚠️  FAIL — server errors under load' : '  ✓ PASS'}`);

  const authPhase = reports.find((r) => r.expect429);
  const authBlocked = authPhase && authPhase.count429 > 0;
  // Dev mode's auth limit is intentionally generous (1000/15min) — a 20-call
  // smoke burst realistically won't trip it, and that's correct, not a bug.
  // The exact threshold is verified deterministically by
  // tests/rateLimiting.test.js regardless of environment.
  const authCheckApplies = environment !== 'development';
  console.log(`  Auth abuse still blocked:                 ${
    !authCheckApplies ? `n/a in dev mode (${authPhase?.count429 ?? 0} 429s; see tests/rateLimiting.test.js for the real assertion)`
    : authBlocked ? '✓ PASS' : '⚠️  FAIL — auth limiter may not be working'
  }`);

  const failed = unexpected429 > 0 || total5xx > 0 || (authCheckApplies && !authBlocked);
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error('\nLoad burst test crashed:', err.message);
  process.exit(1);
});
