# TechVault Analytics Architecture

## 1. Overview

Every business number shown in Admin/Warehouse/SuperAdmin comes from one of
two sources, combined additively per period:

```
historical seeded analytics (source: 'historical_seed_v1')
+
real live production analytics (source: 'live', or computed on demand)
=
displayed business history
```

There is **no fake bulk `Order` data**. The historical baseline lives
entirely in a small analytics layer (`AnalyticsDaily`, `ProductSalesMonthly`,
`BusinessTarget`, plus two fields on `Product` and an optional subdocument on
`Campaign`). Real `Order`/`User`/`Cart`/`InventoryMovement` documents are
never touched by the historical generator.

## 2. Cutoff and timezone

Centralized in `server/config/analytics.js`:

- `HISTORICAL_DATA_CUTOFF = 2026-08-22T00:00:00+03:00` — the single dividing
  line. Every day/month strictly before this instant may be seeded
  historical data; every day/month from this instant onward must come from
  genuine application activity.
- `BUSINESS_TIMEZONE = 'Asia/Jerusalem'` — all new day/month boundary math
  uses this via `server/utils/timezone.js` (built on Node's native `Intl`
  support — no new dependency), never plain server-local/UTC time. This also
  replaced the old UTC-implicit `startOfToday`/`startOfMonth` helpers in
  `admin.service.js` and `analytics.service.js`.
- `HISTORICAL_SEED_SOURCE = 'historical_seed_v1'` — the idempotency/audit
  marker stamped on every document the generator writes.
- `HISTORICAL_WINDOW_MONTHS = 22` — the seeded window reaches back 22
  months from the cutoff month.

**Scope note:** `ProductSalesMonthly`'s pre-existing month grouping (and the
public Best Sellers feature it's unrelated to but shares a helper with,
`recommendation.service.js#getUtcMonthBoundaries`) intentionally remains
UTC-based — retrofitting Israel-timezone boundaries there would touch a
separately-tested, unrelated customer-facing feature for a marginal (2-3
hour, month-boundary-only) accuracy gain. The Israel-timezone requirement is
fully satisfied by the new `AnalyticsDaily`/`BusinessTarget` path, which is
what actually backs the daily target widget the requirement is about.

## 3. Models

### `AnalyticsDaily` (new)
One row per real Israel calendar day: revenue, orders, paidOrders,
unitsSold, cancelledOrders, refundedOrders, refundAmount, newCustomers,
returningCustomers, aov, sessions, productPageViews, conversionRate,
cartsStarted, abandonedCarts, abandonedCartValue, lowStockEvents,
outOfStockEvents, restockEvents. Unique index on `date`.

**The current Israel calendar day never gets a "trusted" financial row.**
`analyticsDaily.service.js#getDayStats`/`getRangeStats` always compute
today's revenue/orders/etc. live from `Order`/`User` (via
`computeLiveDayStats`), exactly like the pre-redesign dashboard did. Today's
row *can* exist for **counter fields only** (sessions, cartsStarted,
abandonedCarts, ...), incremented in real time by
`incrementDailyCounters()` — those are never retroactively recomputable, so
they're the one thing intraday-persisted. `dailySnapshot.job.js` (01:00
daily) finalizes **yesterday** into a fully-trusted row once it has
completed.

### `BusinessTarget` (new)
`{ metric, periodType: 'day'|'month', periodStart, periodEnd, targetValue,
source, createdBy }`, unique on `(metric, periodType, periodStart)`. The
*actual* value for a target is **never stored here** — it's always computed
independently via `businessTarget.service.js#getTargetProgress`, which reads
`AnalyticsDaily`/live data through the exact same path the dashboard uses.
Editing via `PATCH /admin/targets` is blocked once a period has closed (see
requirement #17 — a historical target is a frozen record of what was
planned, never rewritten after the fact).

### `ProductSalesMonthly` (extended)
Added `source: 'historical_seed_v1' | 'live'` (default `'live'`). The
existing `rebuildProductSalesMonth()` is unchanged and still only ever
aggregates real `Order` documents — since no real orders exist in the
seeded historical window, it can never collide with or overwrite a
historical row. It's now also triggered incrementally on real
`payment.paid` / `order.cancelled` / `payment.refunded` events (see
`events/analyticsHandlers.js`), scoped to just the affected order's
products, instead of being manual-CLI-only.

### `Product` (extended)
Added `historicalSalesCount` / `historicalRevenue`, written **once**
(absolute `set`, never incremented) by the generator. The existing live
`salesCount` field and its order-lifecycle increment/decrement logic are
untouched. **Displayed total = `historicalSalesCount + salesCount`** — the
concrete mechanism behind "50 historical + 1 real sale = 51".

### `Campaign` (extended)
Added an optional `historicalStats` subdocument (`attributedOrders,
unitsSold, revenue, discountGenerated, source`), present only on campaigns
the generator itself creates. `campaignAnalytics.service.js` adds this (when
present) on top of its existing live `Order`-aggregation result — a live
campaign that happens to be seeded-historical (e.g. a still-running
multi-year promo) would correctly show baseline + real attributed orders,
never a reset.

### `DailyVisit` (new)
`{ anonId, dateKey }`, unique on the pair, TTL-expires after 45 days. Purely
a dedup ledger backing `AnalyticsDaily.sessions` — never a general pageview
log. Written by `POST /api/v1/track/visit`, the anonymous first-party beacon
(`client/src/utils/analyticsTracking.js`) fired on every storefront route
change (never for `/admin/*`).

### `Cart` (extended)
Added `lastAbandonedCheckAt`, set once by `cleanupCarts.job.js` when a cart
crosses `CART_ABANDONMENT_HOURS` (default 24h) of inactivity while still
holding items — prevents double-counting the same cart into
`AnalyticsDaily.abandonedCarts` on a later job run.

## 3a. Single source of truth — Product.historicalSalesCount / historicalRevenue

**`ProductSalesMonthly` is authoritative. `Product.historicalSalesCount`/
`historicalRevenue` are denormalized caches of `SUM(ProductSalesMonthly.
historicalUnitsSold/historicalRevenue)` for that product, nothing more.**
They exist purely so product-list/detail reads (and `salesCount`-based
sorting) don't need a `ProductSalesMonthly` aggregation on every request —
not as an independently-maintained second copy of the fact.

Enforced by construction, not by a runtime reconciliation job:
- Both are written in the **same** generator pass
  (`generateHistoricalAnalytics.js#applyPlan`), from the **same**
  `productTotals` map that was built by summing the exact rows written to
  `ProductSalesMonthly` — there is no second, independent calculation.
- Neither field is ever touched by anything else. `rebuildProductSalesMonth`
  never writes to `Product`; `order.service.js`'s live `salesCount`
  increment/decrement never writes to `historicalSalesCount`.
- Tested directly: `tests/historicalAnalytics.test.js` → "Single source of
  truth" describe block asserts, for every seeded product,
  `Product.historicalSalesCount === SUM(ProductSalesMonthly.
  historicalUnitsSold)` exactly, and that a real live sale advances
  `Product.salesCount` and `ProductSalesMonthly`'s live delta
  (`unitsSold - historicalUnitsSold`) by the identical amount.

If a future change ever needs `Product.historicalSalesCount` to be rebuilt
independently of a fresh generator run (e.g. after a manual `ProductSalesMonthly`
edit), it must be **re-derived** by summing `ProductSalesMonthly` — never
hand-edited — exactly the same rule that already governs the live
`salesCount`/`ProductSalesMonthly` relationship via `rebuildProductSalesMonth`.

## 4. Definitions

- **Conversion rate** = `paidOrders / sessions × 100` for a period. A
  session = one anonymous/authenticated visitor with ≥1 tracked page view
  in an Israel calendar day, deduped via `DailyVisit`.
- **Abandoned-cart rate** = `abandonedCarts / (abandonedCarts + paidOrders)`
  for a period. A cart is "abandoned" once it holds items and has sat
  untouched for `CART_ABANDONMENT_HOURS`.
- **Cancellation rate** = `cancelledOrders / orders × 100`.
- All of the above are computed the *same way* for historical (seeded) and
  live periods — never two different formulas that happen to agree.

## 4a. Traffic / session tracking — precise definition (requirement #8)

**Session identifier**: a random token (`crypto.randomUUID()`, no PII) held
in the browser's `localStorage` under `tv_anon_id`
(`client/src/utils/analyticsTracking.js`), generated once and reused for the
life of that browser profile. Not a cookie, not derived from IP/user-agent,
never sent to any third party.

**What counts as a session**: exactly one distinct `anonId` observed on one
Israel calendar day. The first `POST /api/v1/track/visit` call for a given
`(anonId, dateKey)` pair inserts a row into `DailyVisit` (unique index on
that pair) and increments `AnalyticsDaily.sessions` for that day; every
subsequent call for the SAME pair hits the unique-index conflict, is treated
as a normal duplicate, and does **not** increment `sessions` again — see
`traffic.service.js#recordVisit`.

**Page refreshes / repeated F5**: the beacon fires on every React Router
route change (`client/src/App.jsx#useStorefrontTracking`), including a
refresh that re-mounts the app — but since `anonId` is stable in
`localStorage` and the dedup key is `(anonId, dateKey)`, any number of
refreshes/route changes by the same visitor on the same day still count as
**one** session. Each such call DOES increment `productPageViews` (a
secondary, non-KPI-critical metric) individually — a burst of page views
from one visitor is expected to inflate `productPageViews`, never
`sessions`, and conversion rate's denominator is `sessions`, not
`productPageViews`.

**Timeout / cross-day behavior**: a session key is scoped to one Israel
calendar day only — the same visitor returning the next day is a new,
separate session (this is the standard "daily active session" definition,
not a rolling-inactivity-timeout session).

**Admin/Warehouse/SuperAdmin traffic is excluded**: `useStorefrontTracking`
explicitly skips every route under `/admin` (`client/src/App.jsx`) — staff
browsing their own tools never inflates the storefront conversion-rate
denominator.

**Conversion numerator**: `paidOrders` — REVENUE_MATCH-qualifying orders
(`paymentStatus: 'paid'`, not cancelled/refunded) for the same period,
exactly the same definition used everywhere else revenue is recognized.
`conversion rate = real paid orders / real deduped sessions`, never an
arbitrary or independently-defined counter.

## 4b. Abandoned-cart lifecycle (requirement #9)

1. **Eligible**: `Cart.items.length > 0` for a given user (real cart, real
   product snapshots — see `Cart.js`).
2. **Cart starts**: the first item is added to a previously-empty cart —
   `cart.service.js#addItem` detects the empty→non-empty transition and
   increments `AnalyticsDaily.cartsStarted` for today (real-time, once per
   transition).
3. **Inactivity threshold passes**: `cleanupCarts.job.js` (daily) finds
   carts with `updatedAt` older than `CART_ABANDONMENT_HOURS` (default 24h)
   that still hold items and have never been marked
   (`lastAbandonedCheckAt: null`).
4. **Counted exactly once**: such a cart is stamped with
   `lastAbandonedCheckAt` and its value is added to
   `AnalyticsDaily.abandonedCarts`/`abandonedCartValue` for the day the job
   ran — the stamp prevents every subsequent daily job run from re-counting
   the same still-stale cart (tested:
   `tests/eventIdempotency.test.js` — "running cleanupCarts.job twice...").
5. **User returns and keeps shopping**: any `addItem`/`updateItem`/
   `removeItem` call touches `updatedAt`, so a cart that's active again
   naturally stops being abandonment-eligible on the next job run — no
   un-marking needed, since `lastAbandonedCheckAt` only gates the *next*
   staleness episode, not the current active state.
6. **User later completes checkout**: the cart is cleared
   (`Cart.items = []`) by the normal checkout flow; `abandonedCarts` for the
   day it was marked stale is **not** retroactively reversed — this mirrors
   how real abandoned-cart analytics work everywhere (a cart that sat idle
   for 3 days and was then recovered was still genuinely idle for those 3
   days). The realized purchase is counted as a `paidOrders` increment on
   its own day, independently.
7. **30-day wipe**: unrelated to the abandonment counter — `CART_CLEANUP_DAYS`
   (unchanged pre-existing behavior) empties truly dead carts' `items`
   array (and resets `lastAbandonedCheckAt`) for storage hygiene, long after
   the abandonment event was already recorded.

No permanent double-counting: a cart can only be freshly abandoned once per
"active episode" (add items → go stale → get marked) — the marker resets to
`null` only at the 30-day wipe, at which point the cart is genuinely gone
and a future re-fill starts a real new episode.

## 5. Historical generator

`server/scripts/generateHistoricalAnalytics.js` — deterministic (seeded
PRNG, `server/utils/deterministicRandom.js`, no `Math.random()`), reads the
**real, live** `Product`/`Category`/`Campaign` collections at run time
(never a hardcoded product list). See the file's own header comment and
inline documentation for the full growth-curve/seasonality/allocation model.
Key guarantees, enforced and tested (`tests/historicalAnalytics.test.js`):

- **Reconciliation**: for every historical month, `SUM(AnalyticsDaily.revenue)`
  across that month's days exactly equals `SUM(ProductSalesMonthly.revenue)`
  across all products for that month (same for `unitsSold`) — both are
  derived from one shared per-day/per-product allocation, never two
  independently-invented numbers.
- **No-sales-before-launch**: each product gets a deterministic
  `historicalLaunchDate` within the window; it never appears in a
  `ProductSalesMonthly` row for a month before that date.
- **Idempotency**: tagged with `HISTORICAL_SEED_SOURCE`; a second `--apply`
  is a safe no-op (verified by test).
- **Production safety**: `--dry-run`/`--apply` required; when
  `NODE_ENV=production`, refuses to run unless `MONGO_URI_PROD` is set and
  non-local and `HISTORICAL_SEED_CONFIRM=TECHVAULT_PRODUCTION` is set. Never
  touches `Product`/`User`/`Order`/`Cart` counts (verified post-write).

## 6. Rebuilding / regenerating

- `ProductSalesMonthly` for real (post-cutoff) months: `node
  server/scripts/rebuildProductSalesMonthly.js --month=YYYY-MM` (unchanged,
  pre-existing tool) or automatically via the real-time event handlers.
- The historical baseline itself is **not** meant to be regenerated
  routinely — it's a one-time initialization. If the generator's logic ever
  needs a deliberate revision, bump `HISTORICAL_SEED_SOURCE` to `v2` (a new,
  reviewed constant) rather than mutating `v1`'s meaning in place.

## 7. What happens when a real event occurs

- A real order is paid → `salesCount`/stock update as before (unchanged) →
  `analyticsHandlers.js` incrementally rebuilds `ProductSalesMonthly` for
  the affected products' current month → the dashboard's next live query
  (or its Socket.IO-triggered refresh) picks it up immediately, since
  "today"/"this month" are always computed live.
- A cart gets its first item → `cartsStarted` increments for today.
- A cart goes stale past the abandonment threshold →
  `cleanupCarts.job.js` records it into `abandonedCarts` once.
- 01:00 daily → `dailySnapshot.job.js` finalizes yesterday into a
  permanent `AnalyticsDaily` row.

## 8. Migration / rollback

Production initialization uses the same script as dev
(`generateHistoricalAnalytics.js`), gated behind the safety checks in §5.
Rollback: since the generator only ever inserts into
`AnalyticsDaily`/`ProductSalesMonthly` (source-tagged rows) /
`BusinessTarget` (source-tagged rows) / two `Product` fields / a small set
of marked `Campaign` documents, a rollback is: delete documents with
`source: 'historical_seed_v1'` from those three collections, `$unset`
`historicalSalesCount`/`historicalRevenue` on `Product`, and delete
`Campaign` documents whose `name` starts with `historical_seed_v1`. No
transactional data is ever at risk.

## 9. Known limitations (see completion report for the full list)

- Target-editing UI (the API exists — `PATCH /admin/targets` — but no admin
  screen calls it yet; the previous non-functional gear icon was removed
  rather than wired to a still-nonexistent editor).
- Inventory analytics beyond the coarse daily event counts on
  `AnalyticsDaily` (no historical per-product stock-level trend).
- Seasonality uses fixed Gregorian-month approximations for Israeli holidays
  (a real Hebrew-calendar model was out of scope).
