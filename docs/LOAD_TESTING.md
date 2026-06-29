# TechVault Load Testing

## Overview

Load tests use [autocannon](https://github.com/mcollina/autocannon) to measure latency and throughput of public API endpoints. All tests are **read-only** — no orders, writes, or destructive operations.

## Scripts

| Script | Duration | Connections | Purpose |
|--------|----------|-------------|---------|
| `npm run load:smoke` | 5s per endpoint | 2 | Quick sanity check — verify endpoints respond under minimal load |
| `npm run load:test` | 30s per endpoint | 10 | Sustained load — measure realistic throughput and latency distribution |

## Endpoints Tested

| Endpoint | Why |
|----------|-----|
| `GET /api/v1/health` | Baseline — lightweight, no DB query, bypasses rate limiter |
| `GET /api/v1/products?limit=10` | Core storefront — MongoDB read + serialization |
| `GET /api/v1/products/categories` | Lightweight DB read — category listing |

## Running Locally (Recommended)

```bash
# Start the backend
npm run dev

# In another terminal — quick smoke test
npm run load:smoke

# Full 30-second load test
npm run load:test
```

Local and Docker environments have higher rate limits, so you'll see true throughput numbers without 429 interference.

## Running Against Production (Occasional Only)

Production load testing should be used only for occasional verification, not routine benchmarking. Prefer local, Docker, or staging environments for repeated testing.

```bash
# Smoke test only — 2 connections, 5 seconds, minimal impact
TARGET_URL=https://techvault.co.il npm run load:smoke
```

**Production safety rules:**
- Use `load:smoke` only — do not run `load:test` against production
- Keep `CONNECTIONS` ≤ 5 and `DURATION` ≤ 10 if you must run `load:test`
- Monitor the admin System Status dashboard during the test
- Never run load tests during peak traffic hours

## Configuration

Environment variables for `load:test`:

| Variable | Default | Description |
|----------|---------|-------------|
| `TARGET_URL` | `http://localhost:5000` | Base URL to test |
| `CONNECTIONS` | `10` | Concurrent connections |
| `DURATION` | `30` | Seconds per endpoint |

## Reading Results

### Result Statuses

| Status | Meaning |
|--------|---------|
| `✅ PASS` | All responses were 2xx, no errors |
| `✅ PASS (rate limiter engaged)` | Non-2xx responses were exclusively HTTP 429 — rate limiter is working correctly |
| `❌ FAIL` | Real errors: 5xx responses, connection failures, or timeouts |

### Sample Summary

```
  Endpoint       │ req/s  │ p50   │ p97.5 │ p99   │  429 │ Err │ Status
  ───────────────┼────────┼───────┼───────┼───────┼──────┼─────┼───────
  Health         │   1850 │     2 │     5 │    12 │    0 │   0 │ PASS
  Products       │    420 │     8 │    25 │    45 │   38 │   0 │ PASS*
  Categories     │    980 │     4 │    12 │    20 │   15 │   0 │ PASS*

  * PASS* = all non-2xx were 429 rate-limiter responses (expected)
```

### Key Metrics

| Metric | What it means | Good target |
|--------|--------------|-------------|
| **req/s** | Requests per second sustained | Health: >500, Products: >100 |
| **p50** | Median latency (ms) | < 50ms |
| **p97.5** | 97.5th percentile latency | < 200ms |
| **p99** | 99th percentile latency | < 500ms |
| **429** | Rate-limited responses | Expected in production |
| **Errors** | Connection/timeout errors | 0 |

## Rate Limiter Behavior

The backend rate limiter protects `/api` routes in production. During load tests:

- **HTTP 429 responses are expected** — they confirm that the rate limiter is active and protecting the server from overload
- The health endpoint (`/api/v1/health`) bypasses the rate limiter and will always return 200
- The scripts distinguish 429s from real failures: only connection errors, timeouts, and 5xx responses are marked as FAIL
- Rate-limited responses are evidence that security controls are working, not indicators of backend instability

To measure raw throughput without rate limiting, test against a local dev server where limits are significantly higher.

### Warning Signs

- **Errors > 0**: Server is dropping connections — reduce `CONNECTIONS`
- **p97.5 > 500ms**: Database queries may need optimization
- **req/s drops over time**: Possible memory leak or connection pool exhaustion
- **5xx responses**: Real backend error — investigate server logs

## What This Does NOT Test

- Authenticated endpoints (login, cart, orders, admin)
- Write operations (POST/PATCH/DELETE)
- WebSocket/Socket.IO connections
- Frontend rendering performance
- Multi-region latency

These require more sophisticated setups (e.g., k6 with scenarios, or Playwright for E2E).
