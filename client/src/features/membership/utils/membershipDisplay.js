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
