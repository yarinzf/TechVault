'use strict';

const Campaign = require('../models/Campaign');
const Product  = require('../models/Product');
const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');

const WEEKLY_DEAL = 'homepage_weekly_deal';

const listCampaigns = async () => {
  const campaigns = await Campaign.find().sort({ startDate: -1 }).populate('products', 'name sku price').lean();
  // .lean() returns the raw stored document — Mongoose only applies schema
  // defaults when hydrating a real document instance, so a genuinely legacy
  // campaign saved before `placement` existed comes back with the field
  // missing entirely, not defaulted to 'none'. Normalize it here so every
  // list result — new or legacy — always has a stable placement value for
  // the Admin UI to read. This does not write anything back to MongoDB.
  return campaigns.map((campaign) => ({
    ...campaign,
    placement:   campaign.placement ?? 'none',
    isClearance: campaign.isClearance ?? false,
  }));
};

// Single source of truth for campaign-percentage pricing, so the public
// Weekly Deal response and getActiveDiscountMap can never drift apart.
const calculateDiscountedPrice = (price, discountPercent) =>
  Math.round(price * (1 - discountPercent / 100) * 100) / 100;

// ─── Weekly Deal eligibility (product + overlap) ───────────────────────────
//
// Validates the campaign's FINAL merged state — not a partial PATCH body.
// A PATCH that only touches, say, startDate on an existing Weekly Deal must
// still be checked as a Weekly Deal against its (unchanged) product and its
// newly merged date range; Joi alone cannot know this from the request body
// in isolation, since the other fields simply aren't present in that body.
//
// finalState: { placement, products, startDate, endDate }
// excludeId:  the campaign's own _id when editing, so it excludes itself
//             from its own overlap check.
const assertWeeklyDealEligible = async (finalState, excludeId) => {
  if (finalState.placement !== WEEKLY_DEAL) return; // standard campaign — no new restrictions

  const products = finalState.products || [];
  if (products.length === 0) {
    throw new AppError('A Weekly Deal must target exactly one product (none selected)', StatusCodes.BAD_REQUEST, 'WEEKLY_DEAL_NO_PRODUCT');
  }
  if (products.length > 1) {
    throw new AppError('A Weekly Deal must target exactly one product (multiple selected)', StatusCodes.BAD_REQUEST, 'WEEKLY_DEAL_MULTIPLE_PRODUCTS');
  }

  const productId = products[0];
  const product = await Product.findById(productId).select('isPublished isDeleted stock').lean();
  if (!product) {
    throw new AppError('Weekly Deal product not found', StatusCodes.BAD_REQUEST, 'WEEKLY_DEAL_PRODUCT_NOT_FOUND');
  }
  if (product.isDeleted) {
    throw new AppError('Weekly Deal product has been deleted', StatusCodes.BAD_REQUEST, 'WEEKLY_DEAL_PRODUCT_DELETED');
  }
  if (!product.isPublished) {
    throw new AppError('Weekly Deal product is not published', StatusCodes.BAD_REQUEST, 'WEEKLY_DEAL_PRODUCT_UNPUBLISHED');
  }
  if (!(product.stock > 0)) {
    throw new AppError('Weekly Deal product is out of stock', StatusCodes.BAD_REQUEST, 'WEEKLY_DEAL_PRODUCT_OUT_OF_STOCK');
  }

  // Overlap: half-open interval test against every OTHER enabled Weekly
  // Deal (active now or scheduled in the future). A disabled Weekly Deal
  // (isActive:false) never blocks a new one — it is deliberately excluded
  // here, not merely "naturally" ignored by a date filter. Back-to-back
  // ranges (existing.endDate === newStartDate) are allowed by using strict
  // < / > rather than <= / >=.
  const overlapFilter = {
    placement: WEEKLY_DEAL,
    isActive: true,
    startDate: { $lt: finalState.endDate },
    endDate:   { $gt: finalState.startDate },
  };
  if (excludeId) overlapFilter._id = { $ne: excludeId };

  const overlapping = await Campaign.findOne(overlapFilter).select('_id name').lean();
  if (overlapping) {
    throw new AppError(
      `Weekly Deal dates overlap an existing Weekly Deal ("${overlapping.name}")`,
      StatusCodes.CONFLICT,
      'WEEKLY_DEAL_OVERLAP'
    );
  }
};

// Clearance stock snapshots — one entry per product, since a clearance
// Campaign can target multiple products that each started their clearance
// run at a different stock level. Deterministic and additive-only:
//   - a product that already has a snapshot keeps its EXACT existing value
//     (never re-read from Product.stock, so it can never silently drift as
//     stock sells — that's the whole point of a "starting stock" snapshot);
//   - a product with no existing snapshot gets one built from its real,
//     current Product.stock at this exact moment (covers both a brand-new
//     clearance campaign and a product newly added to one);
//   - a product no longer in the campaign's final `products` list is
//     dropped (no orphan snapshots left behind).
// Returns [] when the campaign's final state isn't clearance — snapshots
// are meaningless outside clearance and never persisted for a normal
// campaign.
async function buildClearanceSnapshots(existingSnapshots, isClearance, productIds) {
  if (!isClearance || productIds.length === 0) return [];

  const existingByProduct = new Map(
    (existingSnapshots || []).map((snap) => [String(snap.product), snap.startingStock])
  );

  const missingIds = productIds.filter((pid) => !existingByProduct.has(String(pid)));
  let stockByProduct = new Map();
  if (missingIds.length > 0) {
    const docs = await Product.find({ _id: { $in: missingIds } }).select('stock').lean();
    stockByProduct = new Map(docs.map((p) => [String(p._id), p.stock]));
  }

  return productIds.map((pid) => {
    const key = String(pid);
    const startingStock = existingByProduct.has(key) ? existingByProduct.get(key) : (stockByProduct.get(key) ?? 0);
    return { product: pid, startingStock };
  });
}

const createCampaign = async (dto) => {
  const finalProducts = dto.products ?? [];
  await assertWeeklyDealEligible(
    {
      placement: dto.placement ?? 'none',
      products:  finalProducts,
      startDate: new Date(dto.startDate),
      endDate:   new Date(dto.endDate),
    },
    null
  );
  const clearanceStockSnapshots = await buildClearanceSnapshots([], dto.isClearance ?? false, finalProducts);
  return Campaign.create({ ...dto, clearanceStockSnapshots });
};

const updateCampaign = async (id, dto) => {
  const existing = await Campaign.findById(id);
  if (!existing) throw new AppError('Campaign not found', StatusCodes.NOT_FOUND, 'CAMPAIGN_NOT_FOUND');

  // Merge the partial PATCH body onto the existing document to determine
  // the campaign's FINAL state — this is what must be validated, since a
  // PATCH that omits `products` or `startDate` still inherits the existing
  // values, and those existing values are exactly what could make this an
  // (already, or newly) invalid Weekly Deal.
  // existing is a hydrated (non-lean) Mongoose document, so Mongoose already
  // applies the schema default for a legacy document with no stored
  // placement — existing.placement should already read 'none'. The `?? 'none'`
  // fallback is kept anyway as an explicit, zero-cost guarantee that the
  // final merged state can never be undefined, regardless of how `existing`
  // was obtained.
  const finalPlacement   = dto.placement    !== undefined ? dto.placement    : (existing.placement ?? 'none');
  const finalProducts    = dto.products     !== undefined ? dto.products     : existing.products.map(String);
  const finalStartDate   = dto.startDate    !== undefined ? new Date(dto.startDate) : existing.startDate;
  const finalEndDate     = dto.endDate      !== undefined ? new Date(dto.endDate)   : existing.endDate;
  const finalIsClearance = dto.isClearance  !== undefined ? dto.isClearance  : (existing.isClearance ?? false);

  await assertWeeklyDealEligible(
    { placement: finalPlacement, products: finalProducts, startDate: finalStartDate, endDate: finalEndDate },
    existing._id
  );

  // Rebuilt from the FINAL merged state every time (not just when isClearance
  // or products are present in this particular PATCH body) — see
  // buildClearanceSnapshots for why this never overwrites an existing
  // product's already-frozen starting stock.
  const clearanceStockSnapshots = await buildClearanceSnapshots(
    existing.clearanceStockSnapshots,
    finalIsClearance,
    finalProducts
  );

  const campaign = await Campaign.findByIdAndUpdate(
    id,
    { $set: { ...dto, clearanceStockSnapshots } },
    { new: true, runValidators: true }
  ).populate('products', 'name sku price');
  return campaign;
};

const deleteCampaign = async (id) => {
  const campaign = await Campaign.findByIdAndDelete(id);
  if (!campaign) throw new AppError('Campaign not found', StatusCodes.NOT_FOUND, 'CAMPAIGN_NOT_FOUND');
  return campaign;
};

// Returns Map<productId string → discountPercent> for all currently live campaigns.
// When a product belongs to multiple active campaigns, the highest discount wins.
const getActiveDiscountMap = async () => {
  const now = new Date();
  const active = await Campaign.find({
    isActive:  true,
    startDate: { $lte: now },
    endDate:   { $gte: now },
  }).select('products discountPercent').lean();

  const map = new Map();
  for (const c of active) {
    for (const pid of c.products) {
      const key = pid.toString();
      if (!map.has(key) || map.get(key) < c.discountPercent) {
        map.set(key, c.discountPercent);
      }
    }
  }
  return map;
};

// ─── Public Weekly Deal lookup ──────────────────────────────────────────────
//
// Returns a narrow, hydrated deal object for the homepage, or null when no
// valid Weekly Deal currently exists. Re-validates product availability at
// READ time (not just at creation time), since stock/publish/delete state
// can change after the campaign was created.
const getActiveWeeklyDeal = async () => {
  const now = new Date();
  const candidates = await Campaign.find({
    placement: WEEKLY_DEAL,
    isActive:  true,
    startDate: { $lte: now },
    endDate:   { $gte: now },
  }).lean();

  if (candidates.length === 0) return null;

  // Deterministic selection in case inconsistent/concurrent data ever
  // produces more than one match (overlap validation should prevent this
  // in practice): prefer the latest startDate, then the latest updatedAt —
  // never rely on MongoDB's incidental natural order.
  candidates.sort((a, b) => {
    const byStart = new Date(b.startDate) - new Date(a.startDate);
    if (byStart !== 0) return byStart;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
  const campaign = candidates[0];

  const productId = campaign.products?.[0];
  if (!productId) return null;

  const product = await Product.findOne({
    _id: productId,
    isPublished: true,
    isDeleted: false,
    stock: { $gt: 0 },
  }).populate('category', 'name slug').lean();

  if (!product) return null; // product became unavailable — never expose a stale deal

  const specs = product.specs instanceof Map
    ? Object.fromEntries(product.specs)
    : (product.specs || {});

  return {
    campaignId:      String(campaign._id),
    campaignTitle:   campaign.name,
    startDate:       new Date(campaign.startDate).toISOString(),
    endDate:         new Date(campaign.endDate).toISOString(),
    discountPercent: campaign.discountPercent,
    product: {
      id:               String(product._id),
      name:             product.name,
      slug:             product.slug,
      brand:            product.brand ?? null,
      category:         product.category
        ? { name: product.category.name, slug: product.category.slug }
        : null,
      image:            product.images?.[0] ?? null,
      price:            product.price,
      discountedPrice:  calculateDiscountedPrice(product.price, campaign.discountPercent),
      stock:            product.stock,
      specs,
    },
  };
};

// ─── Public Deals page — every currently storefront-eligible campaign ──────
//
// One campaigns query + one batched product query (never one query per
// product) so the Deals page never does N+1 requests. Only exposes fields a
// customer should see — no admin metadata (createdAt/updatedAt/__v etc). A
// campaign whose products are all deleted/unpublished/out of the public set
// is dropped entirely rather than surfaced with an empty product list.
const getActiveCampaigns = async () => {
  const now = new Date();
  const campaigns = await Campaign.find({
    isActive:  true,
    startDate: { $lte: now },
    endDate:   { $gte: now },
  }).sort({ startDate: -1 }).lean();

  if (campaigns.length === 0) return [];

  const productIds = [...new Set(campaigns.flatMap((c) => c.products.map(String)))];
  const products = await Product.find({
    _id:         { $in: productIds },
    isPublished: true,
    isDeleted:   false,
  }).populate('category', 'name slug').lean();

  const productById = new Map(products.map((p) => [String(p._id), p]));

  return campaigns
    .map((c) => {
      const isClearance = c.isClearance ?? false;
      // Per-product starting-stock lookup — see Campaign.js's
      // clearanceStockSnapshots for why this is per-product, not a single
      // campaign-level number.
      const startingStockByProduct = new Map(
        (c.clearanceStockSnapshots || []).map((snap) => [String(snap.product), snap.startingStock])
      );

      return {
        id:              String(c._id),
        name:            c.name,
        discountPercent: c.discountPercent,
        startDate:       new Date(c.startDate).toISOString(),
        endDate:         new Date(c.endDate).toISOString(),
        placement:       c.placement ?? 'none',
        isClearance,
        products: c.products
          .map((pid) => productById.get(String(pid)))
          .filter(Boolean)
          .map((p) => ({
            id:              String(p._id),
            name:            p.name,
            slug:            p.slug,
            brand:           p.brand ?? null,
            category:        p.category ? { name: p.category.name, slug: p.category.slug } : null,
            image:           p.images?.[0] ?? null,
            price:           p.price,
            discountedPrice: calculateDiscountedPrice(p.price, c.discountPercent),
            discountPercent: c.discountPercent,
            stock:           p.stock,
            ratings:         p.ratings ?? { average: 0, count: 0 },
            isClearance,
            // Truthful only — real Product.stock is already on `stock`
            // above; this is ONLY the frozen starting point for the
            // progress bar, and only present when a real snapshot exists.
            clearanceStartingStock: isClearance ? (startingStockByProduct.get(String(p._id)) ?? null) : null,
          })),
      };
    })
    .filter((c) => c.products.length > 0);
};

module.exports = {
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getActiveDiscountMap,
  getActiveWeeklyDeal,
  getActiveCampaigns,
  calculateDiscountedPrice,
};
