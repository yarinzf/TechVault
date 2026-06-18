'use strict';

const Campaign        = require('../models/Campaign');
const campaignService = require('../services/campaign.service');
const audit           = require('../services/audit.service');
const { sendSuccess } = require('../utils/response');
const { StatusCodes } = require('http-status-codes');

const list = async (req, res, next) => {
  try {
    const campaigns = await campaignService.listCampaigns();
    sendSuccess(res, { campaigns }, 'Campaigns retrieved');
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const campaign = await campaignService.createCampaign(req.body);
    audit.log({
      action:   'campaign.created',
      entity:   'Campaign',
      entityId: campaign._id,
      actor:    req.user,
      after:    { name: campaign.name, type: campaign.type, value: campaign.value, isActive: campaign.isActive },
      req,
    });
    sendSuccess(res, { campaign }, 'Campaign created', StatusCodes.CREATED);
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const before = await Campaign.findById(req.params.id).select('name type value isActive').lean();
    const campaign = await campaignService.updateCampaign(req.params.id, req.body);
    audit.log({
      action:   'campaign.updated',
      entity:   'Campaign',
      entityId: campaign._id,
      actor:    req.user,
      before:   before ? { name: before.name, type: before.type, value: before.value, isActive: before.isActive } : null,
      after:    { name: campaign.name, type: campaign.type, value: campaign.value, isActive: campaign.isActive },
      req,
    });
    sendSuccess(res, { campaign }, 'Campaign updated');
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    const before = await Campaign.findById(req.params.id).select('name type value').lean();
    await campaignService.deleteCampaign(req.params.id);
    audit.log({
      action:   'campaign.deleted',
      entity:   'Campaign',
      entityId: req.params.id,
      actor:    req.user,
      before:   before ? { name: before.name, type: before.type, value: before.value } : null,
      after:    null,
      req,
    });
    res.status(StatusCodes.NO_CONTENT).send();
  } catch (err) { next(err); }
};

module.exports = { list, create, update, remove };
