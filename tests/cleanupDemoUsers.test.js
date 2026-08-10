'use strict';

const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');
const User = require('../server/models/User');
const Order = require('../server/models/Order');
const Review = require('../server/models/Review');
const Cart = require('../server/models/Cart');
const Wishlist = require('../server/models/Wishlist');
const Session = require('../server/models/Session');
const Notification = require('../server/models/Notification');
const MembershipPointsTransaction = require('../server/models/MembershipPointsTransaction');
require('../server/models/Product');
require('../server/models/ReturnRequest');
require('../server/models/AuditLog');
require('../server/models/InventoryMovement');
require('../server/models/StockMovement');
require('../server/models/Alert');
require('../server/models/AdminNotification');
require('../server/models/Coupon');

const { TARGETS, countReferences, decide, runApply } = require('../server/scripts/cleanupDemoUsers');

const ALICE_TARGET = TARGETS.find((t) => t.email === 'alice@example.com');
const BOB_TARGET = TARGETS.find((t) => t.email === 'bob@example.com');

beforeAll(async () => {
  await connect();
});

afterEach(async () => {
  await clearAll();
});

async function makeUser(overrides = {}) {
  return User.create({
    name: 'Demo', email: overrides.email, password: 'Fixture-Passw0rd!!',
    role: overrides.role ?? 'user', isActive: overrides.isActive ?? true,
  });
}

async function makeMembershipOrder(userId, overrides = {}) {
  return Order.create({
    orderNumber: overrides.orderNumber ?? `ORD-TEST-${new mongoose.Types.ObjectId()}`,
    user: userId,
    items: [{
      itemType: 'membership', name: 'Club Membership', sku: 'CLUB-1', unitPrice: 99, quantity: 1, totalPrice: 99,
    }],
    subtotal: 99, taxAmount: 0, total: 99,
  });
}

describe('cleanupDemoUsers — decide (delete vs deactivate)', () => {
  it('decides "delete" when meaningfulCount is exactly zero, "deactivate" otherwise', () => {
    expect(decide(0)).toBe('delete');
    expect(decide(1)).toBe('deactivate');
    expect(decide(5)).toBe('deactivate');
  });
});

describe('cleanupDemoUsers — countReferences', () => {
  it('counts a real order under ordersOwned, contributing to meaningfulCount', async () => {
    const user = await makeUser({ email: ALICE_TARGET.email });
    await makeMembershipOrder(user._id);

    const { meaningful, meaningfulCount } = await countReferences(user._id);
    expect(meaningful.ordersOwned).toBe(1);
    expect(meaningfulCount).toBeGreaterThanOrEqual(1);
  });

  it('counts a review under reviews, contributing to meaningfulCount', async () => {
    const user = await makeUser({ email: ALICE_TARGET.email });
    await Review.create({ user: user._id, product: new mongoose.Types.ObjectId(), rating: 5 });

    const { meaningful, meaningfulCount } = await countReferences(user._id);
    expect(meaningful.reviews).toBe(1);
    expect(meaningfulCount).toBeGreaterThanOrEqual(1);
  });

  it('counts a points transaction under membershipPointsTransactions', async () => {
    const user = await makeUser({ email: ALICE_TARGET.email });
    await MembershipPointsTransaction.create({ user: user._id, type: 'earn', points: 10 });

    const { meaningful } = await countReferences(user._id);
    expect(meaningful.membershipPointsTransactions).toBe(1);
  });

  it('does NOT count disposable/personal data (cart, wishlist, session, notification) toward meaningfulCount', async () => {
    const user = await makeUser({ email: ALICE_TARGET.email });
    await Cart.create({ user: user._id, items: [] });
    await Wishlist.create({ user: user._id, products: [] });
    await Session.create({
      user: user._id, refreshTokenHash: 'x'.repeat(64), deviceName: 'Test', browser: 'Test', os: 'Test',
      isActive: true, expiresAt: new Date(Date.now() + 86400000),
    });
    await Notification.create({ user: user._id, type: 'system', title: 'Hi', message: 'Hi' });

    const { meaningfulCount, disposable } = await countReferences(user._id);
    expect(meaningfulCount).toBe(0);
    expect(disposable).toEqual({ cart: 1, wishlist: 1, sessions: 1, notifications: 1 });
  });

  it('a user with zero references anywhere reports meaningfulCount 0 and all-zero disposable counts', async () => {
    const user = await makeUser({ email: ALICE_TARGET.email });
    const { meaningful, disposable, meaningfulCount } = await countReferences(user._id);
    expect(meaningfulCount).toBe(0);
    expect(Object.values(meaningful).every((v) => v === 0)).toBe(true);
    expect(Object.values(disposable).every((v) => v === 0)).toBe(true);
  });
});

describe('cleanupDemoUsers — runApply', () => {
  it('deletes a reference-free user AND removes its disposable data (cart/wishlist/session/notification)', async () => {
    const user = await makeUser({ email: ALICE_TARGET.email });
    await Cart.create({ user: user._id, items: [] });
    await Wishlist.create({ user: user._id, products: [] });
    await Session.create({
      user: user._id, refreshTokenHash: 'x'.repeat(64), deviceName: 'Test', browser: 'Test', os: 'Test',
      isActive: true, expiresAt: new Date(Date.now() + 86400000),
    });
    await Notification.create({ user: user._id, type: 'system', title: 'Hi', message: 'Hi' });

    const results = await runApply();
    const r = results.find((x) => x.email === ALICE_TARGET.email);
    expect(r.outcome).toBe('deleted');
    expect(r.disposableRemoved).toEqual({ cart: 1, wishlist: 1, sessions: 1, notifications: 1 });

    expect(await User.findById(user._id)).toBeNull();
    expect(await Cart.countDocuments({ user: user._id })).toBe(0);
    expect(await Wishlist.countDocuments({ user: user._id })).toBe(0);
    expect(await Session.countDocuments({ user: user._id })).toBe(0);
    expect(await Notification.countDocuments({ user: user._id })).toBe(0);
  });

  it('deactivates (never deletes) a user with a real order, preserving _id, role, and the order itself; invalidates sessions', async () => {
    const user = await makeUser({ email: ALICE_TARGET.email });
    const order = await makeMembershipOrder(user._id);
    await Session.create({
      user: user._id, refreshTokenHash: 'x'.repeat(64), deviceName: 'Test', browser: 'Test', os: 'Test',
      isActive: true, expiresAt: new Date(Date.now() + 86400000),
    });

    const results = await runApply();
    const r = results.find((x) => x.email === ALICE_TARGET.email);
    expect(r.outcome).toBe('deactivated');
    expect(r.sessionsRevoked).toBe(1);

    const fresh = await User.findById(user._id);
    expect(fresh).not.toBeNull(); // never deleted
    expect(fresh._id.toString()).toBe(user._id.toString()); // _id preserved
    expect(fresh.isActive).toBe(false);
    expect(fresh.role).toBe('user'); // role never changed

    const freshOrder = await Order.findById(order._id);
    expect(freshOrder).not.toBeNull(); // the business record itself is never touched
    expect(freshOrder.user.toString()).toBe(user._id.toString());

    const freshSession = await Session.findOne({ user: user._id });
    expect(freshSession.isActive).toBe(false);
  });

  it('skips (does not touch) a target whose role no longer matches "user" — e.g. repurposed to admin', async () => {
    const user = await makeUser({ email: ALICE_TARGET.email, role: 'admin' });

    const results = await runApply();
    const r = results.find((x) => x.email === ALICE_TARGET.email);
    expect(r.outcome).toBe('skipped');
    expect(r.reason).toMatch(/role/i);

    const fresh = await User.findById(user._id);
    expect(fresh).not.toBeNull();
    expect(fresh.isActive).toBe(true);
    expect(fresh.role).toBe('admin');
  });

  it('skips a target that does not exist, without error', async () => {
    const results = await runApply();
    const r = results.find((x) => x.email === ALICE_TARGET.email);
    expect(r.outcome).toBe('skipped');
    expect(r.reason).toMatch(/not found/i);
  });

  it('handles multiple targets independently — one deleted, one deactivated, one skipped', async () => {
    const alice = await makeUser({ email: ALICE_TARGET.email }); // zero references -> delete
    const bob = await makeUser({ email: BOB_TARGET.email });     // has an order -> deactivate
    await makeMembershipOrder(bob._id);
    // carol@example.com intentionally not created -> skipped (not found)

    const results = await runApply();
    expect(results.find((x) => x.email === ALICE_TARGET.email).outcome).toBe('deleted');
    expect(results.find((x) => x.email === BOB_TARGET.email).outcome).toBe('deactivated');
    expect(results.find((x) => x.email === 'carol@example.com').outcome).toBe('skipped');

    expect(await User.findById(alice._id)).toBeNull();
    const freshBob = await User.findById(bob._id);
    expect(freshBob.isActive).toBe(false);
  });

  it('never deletes or modifies the order/review/points-transaction business records themselves during deactivation', async () => {
    const user = await makeUser({ email: ALICE_TARGET.email });
    const order = await makeMembershipOrder(user._id);
    const review = await Review.create({ user: user._id, product: new mongoose.Types.ObjectId(), rating: 4, comment: 'Great' });
    const points = await MembershipPointsTransaction.create({ user: user._id, type: 'earn', points: 20 });

    await runApply();

    expect(await Order.findById(order._id)).not.toBeNull();
    expect(await Review.findById(review._id)).not.toBeNull();
    expect(await MembershipPointsTransaction.findById(points._id)).not.toBeNull();
  });

  it('never touches an unrelated user account', async () => {
    await makeUser({ email: ALICE_TARGET.email }); // deletable
    const unrelated = await makeUser({ email: 'not-a-target@example.com' });

    await runApply();

    const freshUnrelated = await User.findById(unrelated._id);
    expect(freshUnrelated).not.toBeNull();
    expect(freshUnrelated.isActive).toBe(true);
  });
});
