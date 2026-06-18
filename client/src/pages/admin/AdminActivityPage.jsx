import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Package,
  Users,
  Tag,
  Ticket,
  Star,
  Warehouse,
  Bell,
  LogIn,
  CreditCard,
  RefreshCw,
  Calendar,
  Globe,
  User as UserIcon,
} from 'lucide-react';
import { adminService } from '../../features/admin/api/admin.service';
import styles from './AdminActivityPage.module.css';

// ── Constants ──────────────────────────────────────────────────────────────────

const ACTION_META = {
  'order.status_changed': { label: 'שינוי סטטוס הזמנה',   color: 'blue',   Icon: ShoppingCart },
  'order.cancelled':      { label: 'הזמנה בוטלה',          color: 'red',    Icon: ShoppingCart },
  'payment.status_changed': { label: 'תשלום אושר',         color: 'green',  Icon: CreditCard   },
  'payment.refunded':     { label: 'החזר בוצע',             color: 'orange', Icon: RefreshCw    },
  'product.created':      { label: 'מוצר נוצר',             color: 'purple', Icon: Package      },
  'product.updated':      { label: 'מוצר עודכן',            color: 'purple', Icon: Package      },
  'product.deleted':      { label: 'מוצר נמחק',             color: 'red',    Icon: Package      },
  'coupon.created':       { label: 'קופון נוצר',             color: 'yellow', Icon: Ticket       },
  'coupon.updated':       { label: 'קופון עודכן',            color: 'yellow', Icon: Ticket       },
  'coupon.deactivated':   { label: 'קופון הושבת',            color: 'orange', Icon: Ticket       },
  'campaign.created':     { label: 'קמפיין נוצר',            color: 'teal',   Icon: Tag          },
  'campaign.updated':     { label: 'קמפיין עודכן',           color: 'teal',   Icon: Tag          },
  'campaign.deleted':     { label: 'קמפיין נמחק',            color: 'red',    Icon: Tag          },
  'user.role_changed':    { label: 'תפקיד משתמש שונה',      color: 'pink',   Icon: Users        },
  'user.deactivated':     { label: 'משתמש הושבת',            color: 'red',    Icon: Users        },
  'user.activated':       { label: 'משתמש הופעל',            color: 'green',  Icon: Users        },
  'review.deleted':       { label: 'ביקורת נמחקה',           color: 'red',    Icon: Star         },
  'review.moderated':     { label: 'ביקורת מוּדרה',          color: 'pink',   Icon: Star         },
  'inventory.scan':       { label: 'סריקת מלאי',             color: 'teal',   Icon: Warehouse    },
  'alert.resolved':       { label: 'התראה נסגרה',            color: 'gray',   Icon: Bell         },
  'admin.login':          { label: 'כניסת מנהל',             color: 'indigo', Icon: LogIn        },
};

const ENTITY_OPTIONS = [
  { value: '',         label: 'כל הישויות' },
  { value: 'Order',    label: 'הזמנות'     },
  { value: 'Product',  label: 'מוצרים'     },
  { value: 'Coupon',   label: 'קופונים'    },
  { value: 'Campaign', label: 'קמפיינים'   },
  { value: 'User',     label: 'משתמשים'    },
  { value: 'Review',   label: 'ביקורות'    },
  { value: 'System',   label: 'מערכת'      },
];

const ACTION_OPTIONS = [
  { value: '', label: 'כל הפעולות' },
  ...Object.entries(ACTION_META).map(([v, m]) => ({ value: v, label: m.label })),
];

const ROLE_LABELS = {
  superadmin: 'סופר-מנהל',
  admin:      'מנהל',
  warehouse:  'מחסן',
  user:       'משתמש',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ActionBadge({ action }) {
  const meta = ACTION_META[action] ?? { label: action, color: 'gray', Icon: Activity };
  const { label, color, Icon } = meta;
  return (
    <span className={`${styles.badge} ${styles[`badge_${color}`]}`}>
      <Icon className={styles.badgeIcon} />
      {label}
    </span>
  );
}

function RoleBadge({ role }) {
  const label = ROLE_LABELS[role] ?? role;
  const cls = role === 'superadmin' ? styles.roleSuper
            : role === 'admin'      ? styles.roleAdmin
            : role === 'warehouse'  ? styles.roleWarehouse
            : styles.roleUser;
  return <span className={`${styles.roleBadge} ${cls}`}>{label}</span>;
}

function DiffPanel({ before, after }) {
  if (!before && !after) return <p className={styles.noDiff}>אין מידע נוסף</p>;

  const allKeys = Array.from(new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after  ?? {}),
  ]));

  return (
    <div className={styles.diffGrid}>
      <div>
        <p className={styles.diffHeader}>לפני</p>
        {before
          ? allKeys.map(k => (
            <div key={k} className={styles.diffRow}>
              <span className={styles.diffKey}>{k}:</span>
              <span className={`${styles.diffVal} ${String(before[k]) !== String((after ?? {})[k]) ? styles.diffChanged : ''}`}>
                {JSON.stringify(before[k])}
              </span>
            </div>
          ))
          : <span className={styles.diffEmpty}>—</span>
        }
      </div>
      <div>
        <p className={styles.diffHeader}>אחרי</p>
        {after
          ? allKeys.map(k => (
            <div key={k} className={styles.diffRow}>
              <span className={styles.diffKey}>{k}:</span>
              <span className={`${styles.diffVal} ${String(after[k]) !== String((before ?? {})[k]) ? styles.diffNew : ''}`}>
                {JSON.stringify(after[k])}
              </span>
            </div>
          ))
          : <span className={styles.diffEmpty}>—</span>
        }
      </div>
    </div>
  );
}

function LogRow({ log }) {
  const [expanded, setExpanded] = useState(false);
  const meta = ACTION_META[log.action] ?? { Icon: Activity };
  const { Icon } = meta;
  const actorName  = log.actorId?.name  ?? 'Unknown';
  const actorEmail = log.actorId?.email ?? '';

  return (
    <>
      <tr className={styles.row} onClick={() => setExpanded(p => !p)}>
        <td className={styles.tdDot}>
          <span className={`${styles.dot} ${styles[`dot_${ACTION_META[log.action]?.color ?? 'gray'}`]}`} />
        </td>
        <td className={styles.tdAction}>
          <ActionBadge action={log.action} />
        </td>
        <td className={styles.tdEntity}>
          <Icon className={styles.entityIcon} />
          <span className={styles.entityName}>{log.entity}</span>
          <span className={styles.entityId}>{String(log.entityId).slice(-6)}</span>
        </td>
        <td className={styles.tdActor}>
          <UserIcon className={styles.actorIcon} />
          <span className={styles.actorName}>{actorName}</span>
          <RoleBadge role={log.actorRole} />
        </td>
        <td className={styles.tdTime}>
          <Calendar className={styles.timeIcon} />
          {formatDate(log.createdAt)}
        </td>
        <td className={styles.tdIp}>
          {log.ip
            ? <><Globe className={styles.ipIcon} />{log.ip}</>
            : <span className={styles.noIp}>—</span>
          }
        </td>
        <td className={styles.tdExpand}>
          {expanded ? <ChevronUp className={styles.chevron} /> : <ChevronDown className={styles.chevron} />}
        </td>
      </tr>
      {expanded && (
        <tr className={styles.expandRow}>
          <td colSpan={7} className={styles.expandCell}>
            <div className={styles.expandInner}>
              {actorEmail && (
                <p className={styles.actorEmail}>
                  <span className={styles.expandLabel}>אימייל:</span> {actorEmail}
                </p>
              )}
              {log.userAgent && (
                <p className={styles.uaLine}>
                  <span className={styles.expandLabel}>סוכן:</span> {log.userAgent}
                </p>
              )}
              <DiffPanel before={log.before} after={log.after} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminActivityPage() {
  const [logs, setLogs]           = useState([]);
  const [meta, setMeta]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const [search,     setSearch]     = useState('');
  const [action,     setAction]     = useState('');
  const [entityType, setEntityType] = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [page,       setPage]       = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 25 };
      if (search)     params.search     = search;
      if (action)     params.action     = action;
      if (entityType) params.entityType = entityType;
      if (dateFrom)   params.dateFrom   = dateFrom;
      if (dateTo)     params.dateTo     = dateTo;

      const { logs: data, meta: m } = await adminService.listAuditLogs(params);
      setLogs(data);
      setMeta(m);
    } catch {
      setError('שגיאה בטעינת יומן הפעילות');
    } finally {
      setLoading(false);
    }
  }, [search, action, entityType, dateFrom, dateTo, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Reset page when filters change (but not on page change itself)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resetPage = () => setPage(1);
  const handleSearch = (v) => { setSearch(v);     resetPage(); };
  const handleAction = (v) => { setAction(v);     resetPage(); };
  const handleEntity = (v) => { setEntityType(v); resetPage(); };
  const handleFrom   = (v) => { setDateFrom(v);   resetPage(); };
  const handleTo     = (v) => { setDateTo(v);     resetPage(); };

  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className={styles.page} dir="rtl">
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>יומן פעילות מנהלים</h1>
          <p className={styles.subtitle}>
            רשומות ביקורת לכל פעולה אדמינסטרטיבית במערכת
          </p>
        </div>
        <button type="button" className={styles.refreshBtn} onClick={fetchLogs} title="רענן">
          <RefreshCw className={styles.refreshIcon} />
        </button>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchWrap}>
          <Search className={styles.searchIcon} />
          <input
            type="text"
            placeholder="חיפוש לפי שחקן, ישות..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterGroup}>
          <Filter className={styles.filterIcon} />

          <select value={action} onChange={e => handleAction(e.target.value)} className={styles.select}>
            {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <select value={entityType} onChange={e => handleEntity(e.target.value)} className={styles.select}>
            {ENTITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={e => handleFrom(e.target.value)}
            className={styles.dateInput}
            title="מתאריך"
          />
          <span className={styles.dateSep}>—</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => handleTo(e.target.value)}
            className={styles.dateInput}
            title="עד תאריך"
          />
        </div>
      </div>

      {/* Stats bar */}
      {meta && (
        <div className={styles.statsBar}>
          <span className={styles.statItem}>
            <Activity className={styles.statIcon} />
            {meta.total?.toLocaleString() ?? 0} רשומות
          </span>
          {meta.total > 0 && (
            <span className={styles.statItem}>
              עמוד {meta.page} מתוך {meta.totalPages}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className={styles.tableWrap}>
        {loading ? (
          <div className={styles.stateBox}>
            <div className={styles.spinner} />
            <p className={styles.stateText}>טוען יומן פעילות...</p>
          </div>
        ) : error ? (
          <div className={styles.stateBox}>
            <p className={styles.errorText}>{error}</p>
            <button type="button" className={styles.retryBtn} onClick={fetchLogs}>נסה שוב</button>
          </div>
        ) : logs.length === 0 ? (
          <div className={styles.stateBox}>
            <Activity className={styles.emptyIcon} />
            <p className={styles.stateText}>לא נמצאו רשומות</p>
            {(search || action || entityType || dateFrom || dateTo) && (
              <button
                type="button"
                className={styles.retryBtn}
                onClick={() => { setSearch(''); setAction(''); setEntityType(''); setDateFrom(''); setDateTo(''); resetPage(); }}
              >
                נקה פילטרים
              </button>
            )}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr className={styles.thead}>
                <th className={styles.thDot} />
                <th className={styles.th}>פעולה</th>
                <th className={styles.th}>ישות</th>
                <th className={styles.th}>שחקן</th>
                <th className={styles.th}>תאריך</th>
                <th className={styles.th}>IP</th>
                <th className={styles.thExpand} />
              </tr>
            </thead>
            <tbody>
              {logs.map(log => <LogRow key={log._id} log={log} />)}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            <ChevronRight className={styles.pageIcon} />
          </button>

          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = totalPages <= 7 ? i + 1
              : page <= 4             ? i + 1
              : page >= totalPages - 3 ? totalPages - 6 + i
              : page - 3 + i;
            return (
              <button
                key={p}
                type="button"
                className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ''}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            );
          })}

          <button
            type="button"
            className={styles.pageBtn}
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            <ChevronLeft className={styles.pageIcon} />
          </button>
        </div>
      )}
    </div>
  );
}
