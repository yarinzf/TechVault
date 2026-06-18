import { ShoppingCart, Package, AlertCircle, CheckCircle, TrendingUp, Bell } from 'lucide-react';
import { useTranslation } from '../../../context/LanguageContext';

const REL_FMT = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });

function relativeTime(iso) {
  const diff = (new Date(iso) - Date.now()) / 1000; // seconds, negative = past
  if (diff > -60)   return REL_FMT.format(Math.ceil(diff),         'seconds');
  if (diff > -3600) return REL_FMT.format(Math.ceil(diff / 60),    'minutes');
  if (diff > -86400) return REL_FMT.format(Math.ceil(diff / 3600), 'hours');
  return REL_FMT.format(Math.ceil(diff / 86400), 'days');
}

function getIcon(type) {
  switch (type) {
    case 'order':     return <ShoppingCart className="w-4 h-4" />;
    case 'inventory': return <Package      className="w-4 h-4" />;
    case 'alert':     return <AlertCircle  className="w-4 h-4" />;
    case 'payment':   return <CheckCircle  className="w-4 h-4" />;
    case 'analytics': return <TrendingUp   className="w-4 h-4" />;
    default:          return <Bell         className="w-4 h-4" />;
  }
}

function getColor(type, severity) {
  if (severity === 'critical') return 'bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20';
  if (severity === 'warning')  return 'bg-[#fbbf24]/10 text-[#fbbf24] border-[#fbbf24]/20';
  switch (type) {
    case 'order':     return 'bg-[#2563eb]/10 text-[#2563eb] border-[#2563eb]/20';
    case 'payment':   return 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20';
    case 'inventory': return 'bg-[#fbbf24]/10 text-[#fbbf24] border-[#fbbf24]/20';
    case 'analytics': return 'bg-[#7c3aed]/10 text-[#7c3aed] border-[#7c3aed]/20';
    default:          return 'bg-secondary text-muted-foreground border-border';
  }
}

export function LiveNotifications({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  loading,
  hasMore,
  onMarkRead,
  onMarkAllRead,
  onLoadMore,
}) {
  const t = useTranslation();

  if (!isOpen) return null;

  const getSeverityLabel = (severity) => {
    if (severity === 'critical') return t('notif.severity.critical');
    if (severity === 'warning')  return t('notif.severity.warning');
    return null;
  };

  return (
    <div
      className="absolute left-0 top-full mt-2 w-96 bg-card border border-border rounded-lg shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150"
      dir="rtl"
    >
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="text-foreground">{t('notif.header')} ({unreadCount} {t('notif.unread')})</h3>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-xs text-[#2563eb] hover:underline"
          >
            {t('notif.mark_all_read')}
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-96 overflow-y-auto">
        {loading && notifications.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">{t('notif.loading')}</div>
        ) : notifications.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">{t('notif.empty')}</div>
        ) : (
          notifications.map((n) => (
            <div
              key={n._id}
              onClick={() => !n.isRead && onMarkRead(n._id)}
              className={`p-4 border-b border-border transition-colors cursor-pointer ${
                n.isRead ? 'hover:bg-secondary/10' : 'bg-secondary/10 hover:bg-secondary/20'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg border flex-shrink-0 ${getColor(n.type, n.severity)}`}>
                  {getIcon(n.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-foreground leading-snug">{n.message}</p>
                    {getSeverityLabel(n.severity) && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                          n.severity === 'critical'
                            ? 'bg-[#ef4444]/20 text-[#ef4444]'
                            : 'bg-[#fbbf24]/20 text-[#fbbf24]'
                        }`}
                      >
                        {getSeverityLabel(n.severity)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {n.createdAt ? relativeTime(n.createdAt) : ''}
                  </p>
                </div>

                {!n.isRead && (
                  <div className="w-2 h-2 bg-[#2563eb] rounded-full flex-shrink-0 mt-2" />
                )}
              </div>
            </div>
          ))
        )}

        {hasMore && !loading && (
          <button
            type="button"
            onClick={onLoadMore}
            className="w-full p-3 text-xs text-[#2563eb] hover:bg-secondary/10 transition-colors"
          >
            {t('notif.load_more')}
          </button>
        )}
        {loading && notifications.length > 0 && (
          <div className="p-3 text-center text-xs text-muted-foreground">{t('notif.loading')}</div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-[#2563eb] hover:underline w-full text-center"
        >
          {t('notif.close')}
        </button>
      </div>
    </div>
  );
}
