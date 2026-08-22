'use strict';

const mongoose = require('mongoose');

/**
 * First-party, non-PII visitor-dedup ledger backing AnalyticsDaily.sessions.
 * `anonId` is a client-generated random token (see
 * client/src/utils/analyticsTracking.js) stored in localStorage — never an
 * IP, email, name, or anything else identifying — used ONLY to answer "has
 * this browser already been counted as a session today", so a visitor
 * loading 10 pages in one day is 1 session, not 10.
 *
 * Deliberately NOT a general pageview event log (no per-pageview documents,
 * no URL/referrer/user-agent capture) — the narrowest representation that
 * can still answer the one question the conversion-rate feature needs. Rows
 * expire automatically after 45 days (far longer than any dedup window
 * needs, just a storage-growth bound) — AnalyticsDaily.sessions is the
 * durable record; this collection is disposable working state.
 */
const dailyVisitSchema = new mongoose.Schema(
  {
    anonId:  { type: String, required: true, maxlength: 100 },
    dateKey: { type: String, required: true }, // Israel 'YYYY-MM-DD', see server/utils/timezone.js
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

dailyVisitSchema.index({ anonId: 1, dateKey: 1 }, { unique: true });
dailyVisitSchema.index({ createdAt: 1 }, { expireAfterSeconds: 45 * 24 * 60 * 60 });

module.exports = mongoose.model('DailyVisit', dailyVisitSchema);
