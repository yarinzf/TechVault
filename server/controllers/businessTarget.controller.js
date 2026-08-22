'use strict';

const targetService = require('../services/businessTarget.service');
const audit = require('../services/audit.service');
const { sendSuccess } = require('../utils/response');

const list = async (req, res, next) => {
  try {
    const targets = await targetService.listTargets(req.query);
    sendSuccess(res, { targets }, 'Business targets retrieved');
  } catch (err) { next(err); }
};

const upsert = async (req, res, next) => {
  try {
    const target = await targetService.upsertTarget(req.body, req.user._id);
    audit.log({
      action:   'business_target.set',
      entity:   'BusinessTarget',
      entityId: target._id,
      actor:    req.user,
      after:    { metric: target.metric, periodType: target.periodType, periodStart: target.periodStart, targetValue: target.targetValue },
      req,
    });
    sendSuccess(res, { target }, 'Business target saved');
  } catch (err) { next(err); }
};

// GET /admin/targets/progress?metric=daily_revenue&periodType=day&date=2026-08-22
const getProgress = async (req, res, next) => {
  try {
    const { metric, periodType = 'day', date } = req.query;
    const progress = await targetService.getTargetProgress(metric, periodType, date ? new Date(date) : new Date());
    sendSuccess(res, { progress }, 'Target progress retrieved');
  } catch (err) { next(err); }
};

// GET /admin/targets/goals — the full PerformanceGoals widget in one call:
// today's daily goals + this month's monthly goals, all real.
const getGoals = async (req, res, next) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const [daily, monthly] = await Promise.all([
      targetService.getDailyGoalsProgress(date),
      targetService.getMonthlyGoalsProgress(date),
    ]);
    sendSuccess(res, { daily, monthly }, 'Goals progress retrieved');
  } catch (err) { next(err); }
};

module.exports = { list, upsert, getProgress, getGoals };
