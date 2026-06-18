'use strict';

const insightsSvc  = require('../services/insights.service');
const notifSvc     = require('../services/adminNotification.service');
const { sendSuccess } = require('../utils/response');

// Throttle: only fire notifications at most once per hour per insight type.
// We use a simple in-process Map (restarts reset it — acceptable for insights).
const NOTIF_COOLDOWN_MS = 60 * 60 * 1_000;
const lastNotified = new Map();

const shouldNotify = (key) => {
  const last = lastNotified.get(key);
  if (!last || Date.now() - last > NOTIF_COOLDOWN_MS) {
    lastNotified.set(key, Date.now());
    return true;
  }
  return false;
};

const fireInsightNotifications = async (insights) => {
  const promises = [];

  for (const alert of insights.alerts) {
    if (!shouldNotify(alert.type)) continue;

    if (alert.type === 'low_stock_risk') {
      promises.push(notifSvc.createForAdmins({
        type:          'inventory',
        severity:      alert.severity,
        title:         'סיכון מלאי נמוך',
        message:       alert.message,
        recipientRole: 'all',
        metadata:      { count: alert.count },
      }));
    }

    if (alert.type === 'sales_drop') {
      promises.push(notifSvc.createForAdmins({
        type:          'analytics',
        severity:      'warning',
        title:         'ירידה במכירות',
        message:       alert.message,
        recipientRole: 'admin',
        metadata:      { count: alert.count },
      }));
    }

    if (alert.type === 'cancellation_spike') {
      promises.push(notifSvc.createForAdmins({
        type:          'analytics',
        severity:      alert.severity,
        title:         'עלייה בביטולים',
        message:       alert.message,
        recipientRole: 'admin',
        metadata:      { count: alert.count },
      }));
    }
  }

  await Promise.allSettled(promises);
};

const getInsights = async (req, res, next) => {
  try {
    const insights = await insightsSvc.getInsights();
    // Fire notifications async — don't let failures block the response
    fireInsightNotifications(insights).catch(() => {});
    sendSuccess(res, insights);
  } catch (err) { next(err); }
};

module.exports = { getInsights };
