'use strict';

module.exports = {
  'order-confirmation':     require('./order-confirmation'),
  'payment-success':        require('./payment-success'),
  'payment-failed':         require('./payment-failed'),
  'refund-processed':       require('./refund-processed'),
  'return-received':        require('./return-received'),
  'return-status':          require('./return-status'),
  'password-changed':       require('./password-changed'),
  'password-reset':         require('./password-reset'),
  'new-login':              require('./new-login'),
  'low-stock-alert':        require('./low-stock-alert'),
  'purchase-order-received': require('./purchase-order-received'),
};
