import { useNavigate, Link } from 'react-router-dom';
import {
  ShieldCheck, Percent, Star, Clock, UserPlus,
  CheckCircle, Calendar, Bell, Crown, ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useMembership } from '../../hooks/useMembership';
import { useLanguage } from '../../context/LanguageContext';
import { formatJoinedDate, formatNotificationPreference } from '../../features/membership/utils/membershipDisplay';
import s from './ClubPage.module.css';

// Real, currently-enforced facts only — no numeric or feature promises for
// systems that aren't implemented yet (points earning rate, free shipping,
// early access, and VIP support are all deferred to a later phase).
const JOIN_FACTS = [
  { Icon: Crown,   title: 'חברות לכל החיים',      desc: 'תשלום חד-פעמי של ₪50, ללא חיוב חוזר' },
  { Icon: Star,    title: 'סטטוס חברות בחשבון',   desc: 'תג חברות פעיל ותאריך הצטרפות מוצגים בחשבון שלך' },
  { Icon: Percent, title: 'מעקב נקודות מועדון',   desc: 'יתרת הנקודות שלך נשמרת ומוצגת בחשבון' },
  { Icon: Clock,   title: 'הטבות נוספות בדרך',    desc: 'משלוח, מבצעים ותמיכה מורחבת יתווספו למועדון בהמשך' },
];

export default function ClubPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isMember, points, joinedAt, notificationPreference } = useMembership();
  const { language } = useLanguage();

  return (
    <div className={s.page}>
      <div className={s.breadcrumb}>
        <Link to="/"><ArrowRight size={13} /> עמוד ראשי</Link>
        <span>›</span>
        <span className={s.breadcrumbCurrent}>מועדון TechVault</span>
      </div>

      {isMember ? (
        <div className={s.hero}>
          <div className={`${s.heroIcon} ${s.heroIconActive}`}><Crown size={32} strokeWidth={1.4} /></div>
          <div className={`${s.badge} ${s.badgeActive}`}><ShieldCheck size={13} /> מועדון TechVault</div>
          {user?.name && <div className={s.welcome}>ברוכים הבאים, {user.name} 👋</div>}
          <h1 className={s.title}>אתם כבר <span className={s.titleAccent}>חברי</span> מועדון TechVault</h1>
          <p className={s.desc}>החברות שלכם פעילה — הסטטוס והנקודות שלכם מוצגים בחשבון.</p>
          <span className={s.statusPill}><CheckCircle size={13} /> חברות פעילה</span>

          <div className={s.ctaRow}>
            <button className={`${s.btnPrimary} ${s.btnMember}`} onClick={() => navigate('/profile')}>
              <Bell size={16} /> עדכון העדפות התראות
            </button>
            <button className={s.btnSecondary} onClick={() => navigate('/products')}>
              להמשך קניות
            </button>
          </div>

          <div className={s.summarySection}>
            <div className={s.summaryCard}>
              <div className={s.summaryLabel}><CheckCircle size={13} /> סטטוס</div>
              <div className={`${s.summaryVal} ${s.summaryValAccent}`}>פעיל</div>
            </div>
            <div className={s.summaryCard}>
              <div className={s.summaryLabel}><Calendar size={13} /> הצטרפות</div>
              <div className={s.summaryVal}>{formatJoinedDate(joinedAt, language) ?? '—'}</div>
            </div>
            <div className={s.summaryCard}>
              <div className={s.summaryLabel}><Bell size={13} /> עדכוני מועדון</div>
              <div className={s.summaryVal}>{formatNotificationPreference(notificationPreference, language)}</div>
            </div>
          </div>

          <div className={s.summarySection} style={{ gridTemplateColumns: '1fr' }}>
            <div className={s.summaryCard}>
              <div className={s.summaryLabel}><Percent size={13} /> נקודות שנצברו</div>
              <div className={`${s.summaryVal} ${s.summaryValAccent}`} style={{ fontSize: 22 }}>{points.toLocaleString()}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className={s.hero}>
          <div className={s.heroIcon}><ShieldCheck size={32} strokeWidth={1.4} /></div>
          <div className={s.badge}><ShieldCheck size={13} /> מועדון TechVault</div>
          <h1 className={s.title}>הצטרפו ל<span className={s.titleAccent}>מועדון</span> הגיימרים שלנו</h1>
          <p className={s.desc}>
            חברות לכל החיים בתשלום חד-פעמי של ₪50 — סטטוס חברות ונקודות מוצגים בחשבון שלך.
          </p>

          <div className={s.perksGrid}>
            {JOIN_FACTS.map(({ Icon, title, desc }) => (
              <div key={title} className={s.perk}>
                <div className={s.perkIcon}><Icon size={16} /></div>
                <div>
                  <div className={s.perkTitle}>{title}</div>
                  <div className={s.perkDesc}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className={s.ctaRow}>
            <button className={s.btnPrimary} onClick={() => navigate('/club/join')}>
              <UserPlus size={16} /> הצטרפות למועדון — ₪50 בלבד
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
