'use strict';

const mongoose = require('mongoose');
const { connect, clearAll } = require('./helpers/db');
const {
  buildPlan,
  applyPlan,
  verifyApplied,
} = require('../server/scripts/backfillCampaignDisplayFields');

beforeAll(async () => {
  await connect();
});

afterEach(clearAll);

// Simulates the exact real-world incident: campaign documents created (and,
// critically, READ by the migration's own plan-building step) under a
// Mongoose schema that has never heard of `title` — precisely the schema
// shape the currently-running, not-yet-redeployed backend container still
// uses. A distinct model name (not 'Campaign') avoids clashing with the
// real, title-aware Campaign model other test files may already have
// registered in this same Jest process — this model exists ONLY to seed
// data exactly as the legacy schema would, never to run the migration.
const LegacyCampaignSchema = new mongoose.Schema({
  name: { type: String, required: true },
  discountPercent: Number,
  isActive: { type: Boolean, default: true },
  isClearance: Boolean,
  membershipOnly: Boolean,
}, { collection: 'campaigns' });

function LegacyCampaign() {
  return mongoose.models.LegacyCampaignForBackfillTest
    || mongoose.model('LegacyCampaignForBackfillTest', LegacyCampaignSchema);
}

const rawCampaigns = () => mongoose.connection.collection('campaigns');

describe('backfillCampaignDisplayFields — schema-independent title backfill', () => {
  it('persists title via the raw collection even though the schema used to create the documents has no title field', async () => {
    const Legacy = LegacyCampaign();
    const doc = await Legacy.create({ name: 'LOCAL-QA-CLUBVIP — Test', discountPercent: 10, isActive: true });

    // Sanity check: the legacy schema genuinely doesn't know about title —
    // reading back through THAT model shows no title property at all.
    const legacyRead = await Legacy.findById(doc._id).lean();
    expect(legacyRead.title).toBeUndefined();

    const plan = await buildPlan();
    const target = plan.find((c) => c.id.toString() === doc._id.toString());
    expect(target).toBeDefined();
    expect(target.internalName).toBe('LOCAL-QA-CLUBVIP — Test');
    expect(target.computedTitle).toBe('על מוצרים נבחרים');

    const result = await applyPlan([target]);
    expect(result.planned).toBe(1);
    expect(result.matched).toBe(1);
    expect(result.modified).toBe(1);
    expect(result.skippedAlreadyFixed).toBe(0);
    expect(result.failed).toHaveLength(0);

    // Ground truth: raw collection read, bypassing every Mongoose model.
    const raw = await rawCampaigns().findOne({ _id: doc._id });
    expect(raw.title).toBe('על מוצרים נבחרים');
    expect(raw.name).toBe('LOCAL-QA-CLUBVIP — Test'); // internal name unchanged
    expect(raw.discountPercent).toBe(10); // unrelated field unchanged

    const problems = await verifyApplied([target]);
    expect(problems).toEqual([]);
  });

  it('is idempotent — a second run skips already-fixed campaigns instead of re-modifying or double-counting them', async () => {
    const Legacy = LegacyCampaign();
    const doc = await Legacy.create({ name: 'Second Run Test', discountPercent: 15, membershipOnly: true });

    const plan1 = await buildPlan();
    const result1 = await applyPlan(plan1);
    expect(result1.modified).toBe(plan1.length);

    // buildPlan should no longer find this document — title is now set.
    const plan2 = await buildPlan();
    expect(plan2.find((c) => c.id.toString() === doc._id.toString())).toBeUndefined();

    // Even against a stale (pre-fix) plan entry, the write-time re-check
    // must skip it rather than re-modifying or double-counting it.
    const staleReplan = [{
      id: doc._id, internalName: 'Second Run Test', computedTitle: 'בלעדי לחברי מועדון VIP',
      isClearance: false, membershipOnly: true, discountPercent: 15, isActive: true,
    }];
    const result2 = await applyPlan(staleReplan);
    expect(result2.modified).toBe(0);
    expect(result2.skippedAlreadyFixed).toBe(1);
    expect(result2.failed).toHaveLength(0);

    const raw = await rawCampaigns().findOne({ _id: doc._id });
    expect(raw.title).toBe('בלעדי לחברי מועדון VIP'); // unchanged from the first run
  });

  it('never touches unrelated fields (products, dates, pointsMultiplier, placement)', async () => {
    const Legacy = LegacyCampaign();
    const startDate = new Date('2026-01-01T00:00:00Z');
    const endDate   = new Date('2026-02-01T00:00:00Z');
    const productId = new mongoose.Types.ObjectId();
    const doc = await Legacy.create({ name: 'Field Preservation Test', discountPercent: 22, isActive: true });

    // Fields the legacy schema above doesn't declare, set directly via the
    // raw collection — exactly like real production documents carry fields
    // the old app's Mongoose schema predates.
    await rawCampaigns().updateOne(
      { _id: doc._id },
      { $set: { products: [productId], startDate, endDate, pointsMultiplier: 3, placement: 'none' } }
    );

    const plan = await buildPlan();
    const target = plan.find((c) => c.id.toString() === doc._id.toString());
    await applyPlan([target]);

    const raw = await rawCampaigns().findOne({ _id: doc._id });
    expect(raw.title).toBe('על מוצרים נבחרים');
    expect(raw.discountPercent).toBe(22);
    expect(raw.products).toHaveLength(1);
    expect(raw.products[0].toString()).toBe(productId.toString());
    expect(raw.startDate.toISOString()).toBe(startDate.toISOString());
    expect(raw.endDate.toISOString()).toBe(endDate.toISOString());
    expect(raw.pointsMultiplier).toBe(3);
    expect(raw.placement).toBe('none');
  });

  it('cannot report false success — a matched-but-unmodified write is surfaced as a failure, never silently counted as modified', async () => {
    // This exact response shape (acknowledged, matched, but NOT modified)
    // is the real failure mode that caused the original production
    // incident: the loop completed and "looked" successful, but no title
    // ever actually persisted.
    const Legacy = LegacyCampaign();
    const doc = await Legacy.create({ name: 'Fake Success Guard', discountPercent: 8 });

    const plan = await buildPlan(); // real read, before mocking anything
    const target = plan.filter((c) => c.id.toString() === doc._id.toString());
    expect(target).toHaveLength(1);

    const spy = jest.spyOn(mongoose.connection, 'collection').mockImplementation(() => ({
      updateOne: async () => ({ acknowledged: true, matchedCount: 1, modifiedCount: 0 }),
    }));

    let result;
    try {
      result = await applyPlan(target);
    } finally {
      spy.mockRestore();
    }

    expect(result.matched).toBe(1);
    expect(result.modified).toBe(0);
    expect(result.skippedAlreadyFixed).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toMatch(/matched but modifiedCount was 0/);

    // And, unmocked, the real document genuinely never received a title —
    // proving this failure mode is caught, not silently reported as fixed.
    const raw = await rawCampaigns().findOne({ _id: doc._id });
    expect(raw.title).toBeUndefined();
  });
});
