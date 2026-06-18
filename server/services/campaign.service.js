'use strict';

const Campaign = require('../models/Campaign');
const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');

const listCampaigns = async () =>
  Campaign.find().sort({ startDate: -1 }).populate('products', 'name sku price').lean();

const createCampaign = async (dto) =>
  Campaign.create(dto);

const updateCampaign = async (id, dto) => {
  const campaign = await Campaign.findByIdAndUpdate(
    id,
    { $set: dto },
    { new: true, runValidators: true }
  ).populate('products', 'name sku price');
  if (!campaign) throw new AppError('Campaign not found', StatusCodes.NOT_FOUND, 'CAMPAIGN_NOT_FOUND');
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

module.exports = { listCampaigns, createCampaign, updateCampaign, deleteCampaign, getActiveDiscountMap };
