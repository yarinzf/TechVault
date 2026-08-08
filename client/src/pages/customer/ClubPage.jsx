import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, Star, Percent, Clock, Crown, UserPlus,
  CheckCircle, Calendar, Bell,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useMembership } from '../../hooks/useMembership';
import { useTranslation, useLanguage } from '../../context/LanguageContext';
import { formatJoinedDate, formatNotificationPreference } from '../../features/membership/utils/membershipDisplay';
import { MEMBERSHIP_DISPLAY_PRICE } from '../../features/membership/api/membership.service';
import Breadcrumb from '../../components/ui/Breadcrumb/Breadcrumb';
import Footer from '../../components/layout/customer/Footer';
import s from './ClubPage.module.css';

// Real, currently-enforced facts only — no numeric or feature promises for
// systems that aren't implemented yet (points earning rate, free shipping,
// early access, and VIP support are all deferred to a later phase). See
// server/services/membership.service.js and campaign.service.js — neither
// contains any membership-conditional shipping/points/early-access logic.
const BENEFITS = [
  { Icon: Crown,   titleKey: 'club.page.benefit1_title', descKey: 'club.page.benefit1_desc' },
  { Icon: Star,    titleKey: 'club.page.benefit2_title', descKey: 'club.page.benefit2_desc' },
  { Icon: Percent, titleKey: 'club.page.benefit3_title', descKey: 'club.page.benefit3_desc' },
  { Icon: Clock,   titleKey: 'club.page.benefit4_title', descKey: 'club.page.benefit4_desc' },
];

// Describes the real activation flow (membershipPurchase → payment.controller
// marks the order paid → activateMembershipForOrder flips membership.status
// synchronously) — not a generic "add to cart" step, since membership
// purchases deliberately bypass Cart entirely.
const HOW_STEPS = [
  { titleKey: 'club.page.how_step1_title', descKey: 'club.page.how_step1_desc' },
  { titleKey: 'club.page.how_step2_title', descKey: 'club.page.how_step2_desc' },
  { titleKey: 'club.page.how_step3_title', descKey: 'club.page.how_step3_desc' },
];

const FAQ_ITEMS = [
  { qKey: 'club.page.faq1_q', aKey: 'club.page.faq1_a' },
  { qKey: 'club.page.faq2_q', aKey: 'club.page.faq2_a' },
  { qKey: 'club.page.faq3_q', aKey: 'club.page.faq3_a' },
  { qKey: 'club.page.faq4_q', aKey: 'club.page.faq4_a' },
];

export default function ClubPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isMember, points, joinedAt, notificationPreference } = useMembership();
  const t = useTranslation();
  const { language } = useLanguage();

  const crumbs = [
    { label: t('club.page.breadcrumb_home'), href: '/' },
    { label: t('nav.club') },
  ];

  return (
    <div className={s.page}>
      <div className={s.breadcrumbStrip}>
        <div className={s.breadcrumbInner}>
          <Breadcrumb items={crumbs} className={s.breadcrumbNav} />
        </div>
      </div>

      {isMember ? (
        <div className={s.hero}>
          <div className={`${s.heroBadge} ${s.heroBadgeActive}`}>
            <ShieldCheck size={12} aria-hidden="true" /> {t('club.page.member.badge')}
          </div>
          {user?.name && (
            <div className={s.heroGreeting}>{t('club.page.member.welcome').replace('{name}', user.name)}</div>
          )}
          <h1 className={s.heroTitle}>
            {t('club.page.member.title_pre')}
            <span>{t('club.page.member.title_accent')}</span>
            {t('club.page.member.title_post')}
          </h1>
          <p className={s.heroSub}>{t('club.page.member.sub')}</p>
          <span className={s.statusPill}>
            <CheckCircle size={13} aria-hidden="true" /> {t('club.page.member.status_pill')}
          </span>
        </div>
      ) : (
        <div className={s.hero}>
          <div className={s.heroBadge}>
            <ShieldCheck size={12} aria-hidden="true" /> {t('club.page.nonmember.badge')}
          </div>
          <h1 className={s.heroTitle}>
            {t('club.page.nonmember.title_pre')}
            <span>{t('club.page.nonmember.title_accent')}</span>
            {t('club.page.nonmember.title_post')}
          </h1>
          <p className={s.heroSub}>{t('club.page.nonmember.sub')}</p>
          <div className={s.priceRow}>
            <div className={s.price}>₪{MEMBERSHIP_DISPLAY_PRICE}</div>
            <div className={s.priceSub}>{t('club.page.nonmember.price_sub')}</div>
          </div>
          <button className={s.btnPrimary} onClick={() => navigate('/club/join')}>
            <UserPlus size={16} aria-hidden="true" />
            {t('club.page.nonmember.cta').replace('{price}', MEMBERSHIP_DISPLAY_PRICE)}
          </button>
        </div>
      )}

      <div className={s.pageInner}>
        {isMember ? (
          <>
            <div className={s.section}>
              <div className={s.summaryCompact}>
                <div className={s.summaryCompactPoints}>
                  {points.toLocaleString()} {t('club.page.member.points_label')}
                </div>
                <div className={s.summaryCompactMeta}>
                  <span>
                    <CheckCircle size={12} aria-hidden="true" /> {t('club.page.member.summary_status')}:{' '}
                    <strong>{t('club.page.member.summary_status_val')}</strong>
                  </span>
                  <span>
                    <Calendar size={12} aria-hidden="true" /> {t('club.page.member.summary_joined')}:{' '}
                    <strong>{formatJoinedDate(joinedAt, language) ?? '—'}</strong>
                  </span>
                  <span>
                    <Bell size={12} aria-hidden="true" /> {t('club.page.member.summary_notif')}:{' '}
                    <strong>{formatNotificationPreference(notificationPreference, language)}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className={s.section} style={{ marginBottom: 20 }}>
              <div className={s.memberActions}>
                <button className={s.btnSec} onClick={() => navigate('/profile')}>
                  <Bell size={14} aria-hidden="true" /> {t('club.page.member.cta_notif')}
                </button>
                <button className={s.btnPrimary} onClick={() => navigate('/products')}>
                  {t('club.page.member.cta_shop')}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={s.section}>
              <div className={s.sectionTitle}>{t('club.page.benefits_title')}</div>
              <div className={s.benefitsGrid}>
                {BENEFITS.map(({ Icon, titleKey, descKey }) => (
                  <div key={titleKey} className={s.benefitCard}>
                    <div className={s.benefitIcon}><Icon size={18} aria-hidden="true" /></div>
                    <div className={s.benefitTitle}>{t(titleKey)}</div>
                    <div className={s.benefitDesc}>{t(descKey)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className={s.section}>
              <div className={s.sectionTitle}>{t('club.page.how_title')}</div>
              <div className={s.stepsGrid}>
                {HOW_STEPS.map(({ titleKey, descKey }, i) => (
                  <div key={titleKey} className={s.stepCard}>
                    <div className={s.stepNum}>{i + 1}</div>
                    <div className={s.stepTitle}>{t(titleKey)}</div>
                    <div className={s.stepDesc}>{t(descKey)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className={s.section} style={{ marginBottom: 20 }}>
              <div className={s.sectionTitle}>{t('club.page.faq_title')}</div>
              <div className={s.faqList}>
                {FAQ_ITEMS.map(({ qKey, aKey }) => (
                  <details key={qKey} className={s.faqItem}>
                    <summary>{t(qKey)}</summary>
                    <p>{t(aKey)}</p>
                  </details>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}
