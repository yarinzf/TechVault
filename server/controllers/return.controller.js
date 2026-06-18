'use strict';

const returnService   = require('../services/return.service');
const { sendSuccess } = require('../utils/response');
const { StatusCodes } = require('http-status-codes');

// ── Customer ──────────────────────────────────────────────────────────────────

const requestReturn = async (req, res, next) => {
  try {
    const rr = await returnService.requestReturn(
      req.user._id,
      req.params.id,
      { items: req.body.items, customerNote: req.body.customerNote ?? '' },
      req
    );
    sendSuccess(res, { returnRequest: rr }, 'Return request submitted', StatusCodes.CREATED);
  } catch (err) { next(err); }
};

const listMyReturns = async (req, res, next) => {
  try {
    const returns = await returnService.getMyReturns(req.user._id, req.params.id);
    sendSuccess(res, { returns });
  } catch (err) { next(err); }
};

// ── Admin / warehouse ─────────────────────────────────────────────────────────

const listReturns = async (req, res, next) => {
  try {
    const { returns, meta } = await returnService.listReturns(req.query);
    sendSuccess(res, { returns }, undefined, StatusCodes.OK, meta);
  } catch (err) { next(err); }
};

const getReturn = async (req, res, next) => {
  try {
    const rr = await returnService.getReturn(req.params.id);
    sendSuccess(res, { returnRequest: rr });
  } catch (err) { next(err); }
};

const approveReturn = async (req, res, next) => {
  try {
    const rr = await returnService.approveReturn(req.params.id, { adminNote: req.body.adminNote ?? '' }, req.user, req);
    sendSuccess(res, { returnRequest: rr }, 'Return request approved');
  } catch (err) { next(err); }
};

const rejectReturn = async (req, res, next) => {
  try {
    const rr = await returnService.rejectReturn(req.params.id, { adminNote: req.body.adminNote ?? '' }, req.user, req);
    sendSuccess(res, { returnRequest: rr }, 'Return request rejected');
  } catch (err) { next(err); }
};

const markReceived = async (req, res, next) => {
  try {
    const rr = await returnService.markReceived(
      req.params.id,
      { itemConditions: req.body.itemConditions ?? [] },
      req.user,
      req
    );
    sendSuccess(res, { returnRequest: rr }, 'Return marked as received');
  } catch (err) { next(err); }
};

const processRefund = async (req, res, next) => {
  try {
    const result = await returnService.processRefund(
      req.params.id,
      {
        refundAmount: req.body.refundAmount,
        refundType:   req.body.refundType ?? 'original_payment',
        adminNote:    req.body.adminNote  ?? '',
      },
      req.user,
      req
    );
    sendSuccess(res, result, 'Refund processed');
  } catch (err) { next(err); }
};

module.exports = {
  requestReturn,
  listMyReturns,
  listReturns,
  getReturn,
  approveReturn,
  rejectReturn,
  markReceived,
  processRefund,
};
