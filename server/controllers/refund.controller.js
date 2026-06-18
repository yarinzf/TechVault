'use strict';

const refundService   = require('../services/refund.service');
const { sendSuccess } = require('../utils/response');

const refundOrder = async (req, res, next) => {
  try {
    const order = await refundService.refundOrder(
      req.params.id,
      {
        amount: req.body.amount,
        reason: req.body.reason ?? '',
        note:   req.body.note   ?? '',
      },
      req.user
    );
    sendSuccess(res, { order }, 'Refund processed successfully');
  } catch (err) { next(err); }
};

module.exports = { refundOrder };
