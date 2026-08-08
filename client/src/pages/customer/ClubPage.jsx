import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, Percent, Truck, Zap, Clock, Headset, UserPlus,
  CheckCircle, Calendar, Bell, Gift, ExternalLink, Check,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useMembership } from '../../hooks/useMembership';
import { useTranslation, useLanguage } from '../../context/LanguageContext';
import {
  formatJoinedDate, formatExpiryDate, formatPlanLabel, formatNotificationPreference,
} from '../../features/membership/utils/membershipDisplay';
import { MEMBERSHIP_PLANS, MEMBERSHIP_ANNUAL_SAVINGS } from '../../features/membership/api/membership.service';
import { campaignService } from '../../features/campaigns/api/campaign.service';
import Breadcrumb from '../../components/ui/Breadcrumb/Breadcrumb';
import Footer from '../../components/layout/customer/Footer';
import s from './ClubPage.module.css';

// Real Club benefits only. `active` marks whether this is something the
// backend genuinely enforces TODAY (points earning, VIP-only campaign
// pricing, early access, and warehouse order priority are all real —
// see points.service.js / campaign.service.js / order.service.js). Shipping
// is deliberately NOT marked active — see server/models/Product.js /
// Order.js: there is no product weight/dimensions/shipping-zone data yet,
// so no real "VIP shipping" eligibility rule can be computed or enforced.
// The card stays (per the Club/VIP spec — never delete a benefit card just
// because it isn't implemented yet), but never claims to be "active".
const BENEFITS = [
  { key: 'points',      Icon: Percent, titleKey: 'club.page.benefit_points_title',      descKey: 'club.page.benefit_points_desc',      active: true },
  { key: 'shipping',    Icon: Truck,   titleKey: 'club.page.benefit_shipping_title',    descKey: 'club.page.benefit_shipping_desc',    active: false },
  { key: 'prices',      Icon: Zap,     titleKey: 'club.page.benefit_prices_title',      descKey: 'club.page.benefit_prices_desc',      active: true },
  { key: 'earlyaccess', Icon: Clock,   titleKey: 'club.page.benefit_earlyaccess_title', descKey: 'club.page.benefit_earlyaccess_desc', active: true },
  { key: 'priority',    Icon: Headset, titleKey: 'club.page.benefit_priority_title',    descKey: 'club.page.benefit_priority_desc',    active: true },
];

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
  { qKey: 'club.page.faq5_q', aKey: 'club.page.faq5_a' },
  { qKey: 'club.page.faq6_q', aKey: 'club.page.faq6_a' },
  { qKey: 'club.page.faq7_q', aKey: 'club.page.faq7_a' },
  { qKey: 'club.page.faq8_q', aKey: 'club.page.faq8_a' },
];

function BenefitsGrid({ t, showActiveTags }) {
  return (
    <div className={s.benefitsGrid}>
      {BENEFITS.map(({ key, Icon, titleKey, descKey, active }) => (
        <div key={key} className={s.benefitCard}>
          <div className={s.benefitIcon}><Icon size={18} aria-hidden="true" /></div>
          <div className={s.benefitTitle}>{t(titleKey)}</div>
          {showActiveTags ? (
            active
              ? <span className={s.activeTag}><Check size={11} aria-hidden="true" /> {t('club.page.benefit_active_tag')}</span>
              : <div className={s.benefitDesc}>{t(descKey)}</div>
          ) : (
            <div className={s.benefitDesc}>{t(descKey)}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function CampaignCard({ t, pointsCampaign, navigate }) {
  return (
    <div className={s.campaignCard}>
      <div className={s.campaignIcon}><Gift size={20} aria-hidden="true" /></div>
      {pointsCampaign ? (
        <>
          <span className={s.campaignBadge}>{t('club.page.campaign_badge')}</span>
          <div className={s.campaignEyebrow}>{t('club.page.campaign_title')}</div>
          <div className={s.campaignName}>
            {t('club.page.campaign_active_name').replace('{multiplier}', pointsCampaign.pointsMultiplier).replace('{name}', pointsCampaign.name)}
          </div>
          <p className={s.campaignDesc}>{t('club.page.campaign_active_desc')}</p>
          <button className={s.campaignCta} onClick={() => navigate('/deals')}>
            <ExternalLink size={14} aria-hidden="true" /> {t('club.page.campaign_cta')}
          </button>
        </>
      ) : (
        <>
          <div className={s.campaignEyebrow}>{t('club.page.campaign_empty_title')}</div>
          <p className={s.campaignDesc}>{t('club.page.campaign_empty')}</p>
        </>
      )}
    </div>
  );
}

export default function ClubPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isMember, points, plan, joinedAt, expiresAt, notificationPreference } = useMembership();
  const t = useTranslation();
  const { language } = useLanguage();

  const [selectedPlan, setSelectedPlan] = useState('annual'); // best-value preselected
  const [clubData, setClubData] = useState({ pointsCampaign: null, vipDeals: [] });

  useEffect(() => {
    campaignService.getClubSummary().then(setClubData);
  }, []);

  const crumbs = [
    { label: t('club.page.breadcrumb_home'), href: '/' },
    { label: t('nav.club') },
  ];

  const goJoin = (planKey) => navigate('/club/join', { state: { plan: planKey } });

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
          <h1 className={s.heroTitle}>{t('club.page.member.title')}</h1>
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

          <div className={s.planChooser}>
            <button
              type="button"
              className={`${s.planCard} ${selectedPlan === 'monthly' ? s.planCardSelected : ''}`}
              onClick={() => setSelectedPlan('monthly')}
            >
              <div className={s.planLabel}>{t('club.page.plan_monthly_label')}</div>
              <div className={s.planPrice}>₪{MEMBERSHIP_PLANS.monthly.price}</div>
              <div className={s.planSub}>{t('club.page.plan_monthly_sub')}</div>
            </button>
            <button
              type="button"
              className={`${s.planCard} ${s.planCardAnnual} ${selectedPlan === 'annual' ? s.planCardSelected : ''}`}
              onClick={() => setSelectedPlan('annual')}
            >
              <span className={s.planBestValue}>{t('club.page.plan_best_value')}</span>
              <div className={s.planLabel}>{t('club.page.plan_annual_label')}</div>
              <div className={s.planPrice}>₪{MEMBERSHIP_PLANS.annual.price}</div>
              <div className={s.planSub}>{t('club.page.plan_annual_sub')}</div>
              <div className={s.planSavings}>{t('club.page.plan_annual_savings').replace('{amount}', MEMBERSHIP_ANNUAL_SAVINGS)}</div>
            </button>
          </div>
          <p className={s.planNote}>{t('club.page.plan_note')}</p>

          <button className={s.btnPrimary} onClick={() => goJoin(selectedPlan)}>
            <UserPlus size={16} aria-hidden="true" />
            {t('club.page.plan_cta').replace('{price}', MEMBERSHIP_PLANS[selectedPlan].price)}
          </button>
        </div>
      )}

      <div className={s.pageInner}>
        {isMember ? (
          <>
            <div className={s.section}>
              <div className={s.sectionTitle}>{t('club.page.member.benefits_title')}</div>
              <BenefitsGrid t={t} showActiveTags />
            </div>

            <div className={s.section}>
              <CampaignCard t={t} pointsCampaign={clubData.pointsCampaign} navigate={navigate} />
            </div>

            <div className={s.section}>
              <div className={s.summaryCompact}>
                <div className={s.pointsHeading}>{t('club.page.points_heading')}</div>
                <div className={s.pointsValue}>{points.toLocaleString()}</div>
                <div className={s.pointsLabel}>{t('club.page.points_label')}</div>
                <div className={s.summaryCompactMeta}>
                  <span><strong>{formatPlanLabel(plan, language) ?? '—'}</strong> {t('club.page.summary_plan')}</span>
                  <span><Calendar size={12} aria-hidden="true" /> {t('club.page.summary_since')}: <strong>{formatJoinedDate(joinedAt, language) ?? '—'}</strong></span>
                  {expiresAt && (
                    <span>{t('club.page.summary_renewal')}: <strong>{formatExpiryDate(expiresAt, language)}</strong></span>
                  )}
                  <span><Bell size={12} aria-hidden="true" /> {t('club.page.summary_notif')}: <strong>{formatNotificationPreference(notificationPreference, language)}</strong></span>
                </div>
              </div>
            </div>

            <div className={s.section}>
              <div className={s.sectionTitle}>{t('club.page.vip_deals_title')}</div>
              {clubData.vipDeals.length > 0 ? (
                <div className={s.vipDealsGrid}>
                  {clubData.vipDeals.map((deal) => (
                    <a key={deal.id} href={`/products/${deal.slug}`} className={s.vipDealCard}>
                      <div className={s.vipDealImg}>
                        {deal.image ? <img src={deal.image} alt={deal.name} /> : <Gift size={28} aria-hidden="true" />}
                      </div>
                      <div className={s.vipDealBody}>
                        {deal.brand && <div className={s.vipDealBrand}>{deal.brand}</div>}
                        <div className={s.vipDealName}>{deal.name}</div>
                        <div className={s.vipDealPriceRow}>
                          <span className={s.vipDealPriceLabel}>{t('club.page.vip_price_label')}</span>
                          <span className={s.vipDealPrice}>₪{deal.vipPrice.toLocaleString()}</span>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <p className={s.vipDealsEmpty}>{t('club.page.vip_deals_empty')}</p>
              )}
            </div>

            <div className={s.section} style={{ marginBottom: 20 }}>
              <div className={s.memberActions}>
                <button className={s.btnSec} onClick={() => navigate('/profile')}>
                  <Bell size={14} aria-hidden="true" /> {t('club.page.member.cta_notif')}
                </button>
                <button className={s.btnSec} onClick={() => goJoin(plan ?? 'monthly')}>
                  {t('club.page.member.cta_renew')}
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
              <BenefitsGrid t={t} showActiveTags={false} />
            </div>

            <div className={s.section}>
              <CampaignCard t={t} pointsCampaign={clubData.pointsCampaign} navigate={navigate} />
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
