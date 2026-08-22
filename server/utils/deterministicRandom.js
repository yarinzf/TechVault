'use strict';

/**
 * Deterministic, seeded pseudo-random helpers for the historical-analytics
 * generator. Every value the generator produces must be a pure function of
 * (HISTORICAL_SEED_SOURCE + some stable entity key like a SKU or date
 * string) — never Node's Math.random() — so re-running the generator
 * against the same catalog always reproduces the exact same historical
 * numbers (required for the dry-run/apply plan to match, and for the
 * idempotent-rerun test).
 */

// FNV-1a — turns an arbitrary string key into a 32-bit unsigned int seed.
function hashStringToSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 — small, fast, good-enough-for-synthetic-data PRNG. Returns a
// function that yields floats in [0, 1) on each call, advancing its own
// internal state (never global Math.random state).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A fresh, seeded RNG for one logical "key" (e.g. `${SEED_SOURCE}:${sku}` or
// `${SEED_SOURCE}:${dateKey}:sessions`) — deterministic across runs, and
// independent of any other key's draw sequence (so adding/removing one
// product never perturbs another product's generated numbers).
function rngFor(key) {
  return mulberry32(hashStringToSeed(String(key)));
}

// Uniform float in [min, max).
function nextFloat(rng, min, max) {
  return min + rng() * (max - min);
}

// Uniform integer in [min, max] inclusive.
function nextInt(rng, min, max) {
  return Math.floor(nextFloat(rng, min, max + 1));
}

// Pick one element deterministically (weighted by array order via the rng).
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

module.exports = { hashStringToSeed, mulberry32, rngFor, nextFloat, nextInt, pick };
