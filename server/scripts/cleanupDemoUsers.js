#!/usr/bin/env node
'use strict';

/**
 * cleanupDemoUsers.js — retire the no-longer-needed seeded demo customer
 * accounts (alice/bob/carol@example.com) from production.
 *
 * ─── Why a user might NOT be deleted ──────────────────────────────────────
 * A demo account can still be the subject of real historical/business
 * records — an order, a review, a return, a points transaction, an audit
 * log entry it triggered, etc. Deleting the User document in that case
 * would silently orphan those records (or worse, break any code that
 * assumes `order.user` resolves to a real user). So this script never
 * deletes on faith — for every target it counts references across every
 * collection that can hold a business-meaningful pointer to a user, and
 * only deletes when that count is exactly zero. Otherwise it deactivates
 * the account (isActive=false) and revokes its sessions, preserving the
 * _id and every historical relationship intact.
 *
 * ─── Reference collections checked ────────────────────────────────────────
 * Meaningful/business (ANY of these being non-zero blocks deletion):
 *   Order.user (owns orders), Order.statusHistory.changedBy,
 *   Order.paymentHistory.changedBy, Review.user, ReturnRequest.user,
 *   ReturnRequest.resolvedBy, MembershipPointsTransaction.user,
 *   AuditLog.actorId, InventoryMovement.actor, StockMovement.userId,
 *   Alert.resolvedBy, AdminNotification.readBy, Coupon.userUsage.user.
 * Disposable/personal (deleted ALONGSIDE the user when deletion happens,
 * never on their own — they never block deletion):
 *   Cart.user, Wishlist.user, Session.user, Notification.user.
 *
 * ─── What this never does ─────────────────────────────────────────────────
 * Never deletes an Order, Review, ReturnRequest, points transaction, audit
 * log, or any other business record to "make room" for deleting a user.
 * Never touches an account whose role isn't the expected `user` role for
 * these specific targets — if a demo email were ever repurposed to a real
 * account, this script would skip it rather than delete/deactivate it.
 * Never creates a user.
 *
 * ─── Hard safety model (mirrors the other production scripts) ────────────
 *   - Refuses to run unless NODE_ENV === "production".
 *   - Refuses to run if the resolved Mongo URI/host is localhost/127.0.0.1.
 *   - Refuses to run without CLEANUP_CONFIRM=TECHVAULT_PRODUCTION set.
 *   - --audit is fully read-only: prints the full per-collection reference
 *     breakdown and the resulting delete-vs-deactivate decision for every
 *     target, without writing anything.
 *   - --apply performs exactly the action --audit reported it would.
 *
 * Usage (must be run inside the production application context):
 *   node server/scripts/cleanupDemoUsers.js --audit
 *   node server/scripts/cleanupDemoUsers.js --apply
 */

const mongoose = require('mongoose');

const REQUIRED_CONFIRM_VALUE = 'TECHVAULT_PRODUCTION';

// Fixed, explicit target list.
const TARGETS = [
  { email: 'alice@example.com', expectedRole: 'user' },
  { email: 'bob@example.com',   expectedRole: 'user' },
  { email: 'carol@example.com', expectedRole: 'user' },
];

// ─── Safety guards ───────────────────────────────────────────────────────────
function assertProductionSafety() {
  const errors = [];
  if (process.env.NODE_ENV !== 'production') {
    errors.push(`NODE_ENV must be "production" (got: ${JSON.stringify(process.env.NODE_ENV)})`);
  }
  const uri = process.env.MONGO_URI_PROD || '';
  if (!uri) {
    errors.push('MONGO_URI_PROD is not set');
  } else if (/localhost|127\.0\.0\.1/i.test(uri)) {
    errors.push('MONGO_URI_PROD resolves to localhost — refusing to run against a local database');
  }
  if (process.env.CLEANUP_CONFIRM !== REQUIRED_CONFIRM_VALUE) {
    errors.push(`CLEANUP_CONFIRM must equal exactly "${REQUIRED_CONFIRM_VALUE}"`);
  }
  if (errors.length) {
    throw new Error('ABORT — production safety check failed:\n  - ' + errors.join('\n  - '));
  }
}

function assertConnectionIsNotLocal() {
  const host = mongoose.connection.host || '';
  if (/localhost|127\.0\.0\.1/i.test(host)) {
    throw new Error(`ABORT — connected Mongo host "${host}" looks local, not production`);
  }
}

// ─── Reference counting ──────────────────────────────────────────────────────
async function countReferences(userId) {
  const Order   = mongoose.model('Order');
  const Review  = mongoose.model('Review');
  const ReturnRequest = mongoose.model('ReturnRequest');
  const MembershipPointsTransaction = mongoose.model('MembershipPointsTransaction');
  const AuditLog = mongoose.model('AuditLog');
  const InventoryMovement = mongoose.model('InventoryMovement');
  const StockMovement = mongoose.model('StockMovement');
  const Alert = mongoose.model('Alert');
  const AdminNotification = mongoose.model('AdminNotification');
  const Coupon = mongoose.model('Coupon');
  const Cart = mongoose.model('Cart');
  const Wishlist = mongoose.model('Wishlist');
  const Session = mongoose.model('Session');
  const Notification = mongoose.model('Notification');

  const [
    ordersOwned, orderStatusActor, orderPaymentActor,
    reviews, returnRequestsOwned, returnRequestsResolvedBy,
    membershipPointsTransactions, auditLogActor, inventoryMovementActor,
    stockMovementActor, alertResolvedBy, adminNotificationReadBy, couponUsage,
    cart, wishlist, sessions, notifications,
  ] = await Promise.all([
    Order.countDocuments({ user: userId }),
    Order.countDocuments({ 'statusHistory.changedBy': userId }),
    Order.countDocuments({ 'paymentHistory.changedBy': userId }),
    Review.countDocuments({ user: userId }),
    ReturnRequest.countDocuments({ user: userId }),
    ReturnRequest.countDocuments({ resolvedBy: userId }),
    MembershipPointsTransaction.countDocuments({ user: userId }),
    AuditLog.countDocuments({ actorId: userId }),
    InventoryMovement.countDocuments({ actor: userId }),
    StockMovement.countDocuments({ userId }),
    Alert.countDocuments({ resolvedBy: userId }),
    AdminNotification.countDocuments({ readBy: userId }),
    Coupon.countDocuments({ 'userUsage.user': userId }),
    Cart.countDocuments({ user: userId }),
    Wishlist.countDocuments({ user: userId }),
    Session.countDocuments({ user: userId }),
    Notification.countDocuments({ user: userId }),
  ]);

  const meaningful = {
    ordersOwned, orderStatusActor, orderPaymentActor,
    reviews, returnRequestsOwned, returnRequestsResolvedBy,
    membershipPointsTransactions, auditLogActor, inventoryMovementActor,
    stockMovementActor, alertResolvedBy, adminNotificationReadBy, couponUsage,
  };
  const disposable = { cart, wishlist, sessions, notifications };

  const meaningfulCount = Object.values(meaningful).reduce((a, b) => a + b, 0);

  return { meaningful, disposable, meaningfulCount };
}

function decide(meaningfulCount) {
  return meaningfulCount === 0 ? 'delete' : 'deactivate';
}

// ─── Audit (read-only) ────────────────────────────────────────────────────
async function runAudit() {
  const User = mongoose.model('User');
  console.log('\nAudit — demo customer account reference breakdown (read-only, no writes):\n');

  const summary = [];

  for (const t of TARGETS) {
    const user = await User.findOne({ email: t.email }).select('email role isActive').lean();
    if (!user) {
      console.log(`- ${t.email}: NOT FOUND in production (nothing to do)`);
      summary.push({ email: t.email, found: false });
      continue;
    }
    if (user.role !== t.expectedRole) {
      console.log(`- ${t.email}: role=${user.role} (EXPECTED ${t.expectedRole} — MISMATCH, would be skipped, not touched)`);
      summary.push({ email: t.email, found: true, skipped: true });
      continue;
    }

    const { meaningful, disposable, meaningfulCount } = await countReferences(user._id);
    const decision = decide(meaningfulCount);

    console.log(`- ${t.email} (role=${user.role}, active=${user.isActive}):`);
    console.log(`    meaningful/business references: ${JSON.stringify(meaningful)}`);
    console.log(`    disposable/personal data:        ${JSON.stringify(disposable)}`);
    console.log(`    decision: ${decision === 'delete' ? 'DELETE (zero meaningful references)' : 'DEACTIVATE (has meaningful references — preserving _id and history)'}`);

    summary.push({ email: t.email, found: true, role: user.role, isActive: user.isActive, meaningfulCount, decision });
  }

  console.log('\nNo data was modified.');
  return summary;
}

// ─── Apply ────────────────────────────────────────────────────────────────
async function runApply() {
  const User = mongoose.model('User');
  const authService = require('../services/auth.service');
  const Cart = mongoose.model('Cart');
  const Wishlist = mongoose.model('Wishlist');
  const Session = mongoose.model('Session');
  const Notification = mongoose.model('Notification');

  const results = [];

  for (const t of TARGETS) {
    const user = await User.findOne({ email: t.email }).select('email role isActive');
    if (!user) {
      results.push({ email: t.email, outcome: 'skipped', reason: 'account not found in production' });
      continue;
    }
    if (user.role !== t.expectedRole) {
      results.push({ email: t.email, outcome: 'skipped', reason: `role is "${user.role}", expected "${t.expectedRole}" — refusing to touch` });
      continue;
    }

    const { meaningful, disposable, meaningfulCount } = await countReferences(user._id);
    const decision = decide(meaningfulCount);

    if (decision === 'delete') {
      // Disposable/personal data only — never a business record.
      const [cartDeleted, wishlistDeleted, sessionsDeleted, notificationsDeleted] = await Promise.all([
        Cart.deleteMany({ user: user._id }),
        Wishlist.deleteMany({ user: user._id }),
        Session.deleteMany({ user: user._id }),
        Notification.deleteMany({ user: user._id }),
      ]);
      await User.deleteOne({ _id: user._id });

      results.push({
        email: t.email, outcome: 'deleted', role: user.role,
        disposableRemoved: {
          cart: cartDeleted.deletedCount, wishlist: wishlistDeleted.deletedCount,
          sessions: sessionsDeleted.deletedCount, notifications: notificationsDeleted.deletedCount,
        },
      });
    } else {
      const wasActive = user.isActive;
      user.isActive = false;
      await user.save();
      let sessionsRevoked = 0;
      try {
        const before = await Session.countDocuments({ user: user._id, isActive: true });
        await authService.logoutAll(user._id);
        sessionsRevoked = before;
      } catch (err) {
        results.push({ email: t.email, outcome: 'deactivate_session_revoke_failed', role: user.role, error: err.message });
        continue;
      }
      results.push({
        email: t.email, outcome: 'deactivated', role: user.role,
        wasActive, sessionsRevoked, meaningfulReferences: meaningful, disposableReferences: disposable,
      });
    }
  }

  return results;
}

function printResults(results) {
  console.log('\nCleanup results:\n');
  for (const r of results) {
    if (r.outcome === 'deleted') {
      console.log(`- ${r.email}: DELETED — role=${r.role}, disposable data removed: ${JSON.stringify(r.disposableRemoved)}`);
    } else if (r.outcome === 'deactivated') {
      console.log(`- ${r.email}: DEACTIVATED — role=${r.role}, sessionsRevoked=${r.sessionsRevoked}, preserved due to meaningful references: ${JSON.stringify(r.meaningfulReferences)}`);
    } else if (r.outcome === 'skipped') {
      console.log(`- ${r.email}: skipped — ${r.reason}`);
    } else {
      console.log(`- ${r.email}: ${r.outcome} — ${r.reason || r.error || ''}`);
    }
  }
}

async function runAsCli() {
  const args = process.argv.slice(2);
  const mode = args.includes('--apply') ? 'apply' : args.includes('--audit') ? 'audit' : null;

  if (!mode) {
    console.error('Usage: node server/scripts/cleanupDemoUsers.js --audit | --apply');
    console.error('No flag was provided — refusing to run.');
    process.exit(1);
  }

  assertProductionSafety();

  const { connectDB } = require('../config/db');
  require('../models/User');
  require('../models/Order');
  require('../models/Review');
  require('../models/ReturnRequest');
  require('../models/MembershipPointsTransaction');
  require('../models/AuditLog');
  require('../models/InventoryMovement');
  require('../models/StockMovement');
  require('../models/Alert');
  require('../models/AdminNotification');
  require('../models/Coupon');
  require('../models/Cart');
  require('../models/Wishlist');
  require('../models/Session');
  require('../models/Notification');
  await connectDB();
  assertConnectionIsNotLocal();

  try {
    if (mode === 'audit') {
      await runAudit();
      return;
    }

    const results = await runApply();
    printResults(results);

    const failed = results.filter((r) => !['deleted', 'deactivated', 'skipped'].includes(r.outcome));
    const actedCount = results.filter((r) => r.outcome === 'deleted' || r.outcome === 'deactivated').length;

    console.log(`\nActed on: ${actedCount}. Skipped: ${results.filter((r) => r.outcome === 'skipped').length}. Failed: ${failed.length}.`);

    if (failed.length > 0) {
      console.error('\nONE OR MORE CLEANUP ACTIONS FAILED — see above.');
      process.exitCode = 1;
      return;
    }

    console.log('\nDemo user cleanup completed.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runAsCli().catch((err) => {
    console.error('\nCleanup failed:', err.message);
    process.exit(1);
  });
}

module.exports = { TARGETS, countReferences, decide, runAudit, runApply };
