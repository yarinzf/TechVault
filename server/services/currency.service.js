'use strict';

const TTL_COUNTRY = 24 * 60 * 60 * 1000; // 24 h — country→currency mapping
const TTL_RATE    =  1 * 60 * 60 * 1000; // 1 h  — exchange rates

// ── In-memory TTL cache ───────────────────────────────────────────────────────

const _cache = new Map();

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
  return entry.data;
}

function cacheSet(key, data, ttl) {
  _cache.set(key, { data, expiresAt: Date.now() + ttl });
}

// ── Static fallback map ───────────────────────────────────────────────────────
// Used when REST Countries API is unavailable.
const COUNTRY_CURRENCY_FALLBACK = {
  'Israel':         { currencyCode: 'ILS', currencyName: 'Israeli new shekel',    currencySymbol: '₪' },
  'United States':  { currencyCode: 'USD', currencyName: 'United States dollar',  currencySymbol: '$' },
  'United Kingdom': { currencyCode: 'GBP', currencyName: 'British pound sterling', currencySymbol: '£' },
  'Germany':        { currencyCode: 'EUR', currencyName: 'Euro',                   currencySymbol: '€' },
  'France':         { currencyCode: 'EUR', currencyName: 'Euro',                   currencySymbol: '€' },
  'Italy':          { currencyCode: 'EUR', currencyName: 'Euro',                   currencySymbol: '€' },
  'Spain':          { currencyCode: 'EUR', currencyName: 'Euro',                   currencySymbol: '€' },
  'Canada':         { currencyCode: 'CAD', currencyName: 'Canadian dollar',        currencySymbol: '$' },
  'Australia':      { currencyCode: 'AUD', currencyName: 'Australian dollar',      currencySymbol: '$' },
  'Japan':          { currencyCode: 'JPY', currencyName: 'Japanese yen',           currencySymbol: '¥' },
};

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Country → Currency
// ═══════════════════════════════════════════════════════════════════════════════

// Returns { currencyCode, currencyName, currencySymbol }
// Falls back to static map, then to USD if both fail.
async function getCountryCurrency(country) {
  const KEY = `currency::country::${country}`;
  const cached = cacheGet(KEY);
  if (cached) return cached;

  try {
    const encoded = encodeURIComponent(country);
    const data = await fetchJson(
      `https://restcountries.com/v3.1/name/${encoded}?fields=currencies&fullText=true`
    );
    const currencies = data?.[0]?.currencies;
    if (currencies && Object.keys(currencies).length) {
      const [code, info] = Object.entries(currencies)[0];
      const result = {
        currencyCode:   code,
        currencyName:   info.name   || code,
        currencySymbol: info.symbol || code,
      };
      cacheSet(KEY, result, TTL_COUNTRY);
      return result;
    }
  } catch (_) {
    // fall through
  }

  const fallback = COUNTRY_CURRENCY_FALLBACK[country]
    ?? { currencyCode: 'USD', currencyName: 'United States dollar', currencySymbol: '$' };
  cacheSet(KEY, fallback, TTL_COUNTRY);
  return fallback;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Exchange rate conversion
// ═══════════════════════════════════════════════════════════════════════════════

// Returns { rate, convertedAmount } or null if Frankfurter is unavailable.
async function convertAmount(amount, from, to) {
  if (from === to) return { rate: 1, convertedAmount: +amount.toFixed(2) };

  const KEY = `currency::rate::${from}::${to}`;
  const cached = cacheGet(KEY);
  if (cached !== null) {
    return { rate: cached, convertedAmount: +(amount * cached).toFixed(2) };
  }

  try {
    const data = await fetchJson(
      `https://api.frankfurter.app/latest?from=${from}&to=${to}`
    );
    const rate = data?.rates?.[to];
    if (rate != null) {
      cacheSet(KEY, rate, TTL_RATE);
      return { rate, convertedAmount: +(amount * rate).toFixed(2) };
    }
  } catch (_) {
    // fall through
  }

  return null; // caller must handle — do NOT throw, checkout must stay functional
}

module.exports = { getCountryCurrency, convertAmount };
