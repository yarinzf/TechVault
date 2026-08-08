const NOTIFICATION_LABELS_HE = {
  none: 'לא הוגדר',
  email: 'אימייל',
  sms: 'SMS',
  both: 'אימייל ו-SMS',
};

const NOTIFICATION_LABELS_EN = {
  none: 'Not set',
  email: 'Email',
  sms: 'SMS',
  both: 'Email & SMS',
};

export function formatNotificationPreference(preference, language = 'he') {
  const dict = language === 'en' ? NOTIFICATION_LABELS_EN : NOTIFICATION_LABELS_HE;
  return dict[preference] ?? dict.none;
}

export function formatJoinedDate(joinedAt, language = 'he') {
  if (!joinedAt) return null;
  const date = new Date(joinedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(language === 'en' ? 'en-US' : 'he-IL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Same real-date formatting as formatJoinedDate — used for expiresAt/renewal
// date display. Kept as a separate named export (rather than reusing
// formatJoinedDate directly at call sites) so the Club page's intent reads
// clearly wherever it's used.
export const formatExpiryDate = formatJoinedDate;

const PLAN_LABELS_HE = { monthly: 'חודשי', annual: 'שנתי' };
const PLAN_LABELS_EN = { monthly: 'Monthly', annual: 'Annual' };

export function formatPlanLabel(plan, language = 'he') {
  const dict = language === 'en' ? PLAN_LABELS_EN : PLAN_LABELS_HE;
  return plan ? (dict[plan] ?? plan) : null;
}
