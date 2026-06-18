import { Link } from 'react-router-dom';
import s from './LegalPage.module.css';

const SECTIONS = [
  {
    title: '1. מידע שאנו אוספים',
    body: 'אנו אוספים מידע שאתם מספקים ישירות, כגון שם, כתובת אימייל, מספר טלפון וכתובות משלוח. כמו כן, אנו אוספים מידע טכני אוטומטי כגון כתובת IP, סוג דפדפן ופעולות באתר.',
  },
  {
    title: '2. שימוש במידע',
    body: 'המידע שנאסף משמש לעיבוד הזמנות, שיפור השירות, שליחת עדכונים רלוונטיים (בהסכמתכם), ואבטחת החשבון. לעולם לא נמכור את פרטיכם לצדדים שלישיים.',
  },
  {
    title: '3. כניסה דרך ספקי צד-שלישי',
    body: 'אם תבחרו להתחבר דרך Google, Apple או SMS — אנו מקבלים ומאמתים את הזהות שלכם דרך השירות החיצוני, אך TechVault נשארת ספק השירות הבלעדי. איננו שומרים את הטוקנים של ספקים אלה על המשרת שלנו.',
  },
  {
    title: '4. אחסון ואבטחת מידע',
    body: 'הנתונים מאוחסנים בשרתים מאובטחים. סיסמאות מוצפנות בעזרת bcrypt. אסימוני JWT מוגנים בסיסמאות סוד. אנו מיישמים הצפנת TLS לכל התקשורת.',
  },
  {
    title: '5. עוגיות (Cookies)',
    body: 'TechVault משתמשת בעוגיות לצרכי אימות (refresh token HttpOnly), ניתוח שימוש, והתאמה אישית. עוגיית הרענון היא HttpOnly ו-Secure — אינה נגישה ל-JavaScript.',
  },
  {
    title: '6. שיתוף מידע',
    body: 'מידע עשוי להיות משותף עם: ספק עיבוד תשלומים (Stripe) לצרכי עסקאות; שירות SMS (Twilio) לאימות זהות; ספקי שרותי ענן לאחסון. כל השותפים עומדים בתקני GDPR ו-ISO 27001.',
  },
  {
    title: '7. זכויותיכם',
    body: 'זכותכם לגשת למידע האישי שלכם, לתקנו, או למחוק אותו. ניתן לפנות לבקשות מסוג זה בכתובת: privacy@techvault.co.il. נטפל בבקשות תוך 30 יום.',
  },
  {
    title: '8. שמירת מידע',
    body: 'אנו שומרים את המידע שלכם כל עוד חשבונכם פעיל, ולמשך 7 שנים לאחר מכן לצרכים חשבונאיים ומשפטיים. לאחר מחיקת חשבון, נתונים אישיים מוחקים תוך 90 יום.',
  },
  {
    title: '9. שינויים במדיניות',
    body: 'נודיע לכם בדוא"ל על שינויים מהותיים במדיניות זו. שימוש מתמשך לאחר פרסום שינויים מהווה הסכמה.',
  },
  {
    title: '10. יצירת קשר',
    body: 'לכל שאלה בנוגע למדיניות הפרטיות, ניתן לפנות ל: privacy@techvault.co.il',
  },
];

export default function PrivacyPage() {
  return (
    <div className={s.page}>
      <div className={s.inner}>
        <div className={s.header}>
          <h1 className={s.title}>מדיניות הפרטיות</h1>
          <p className={s.meta}>עדכון אחרון: ינואר 2025</p>
          <p className={s.intro}>
            TechVault מחויבת לשמירה על פרטיותכם. מסמך זה מסביר כיצד אנו אוספים, משתמשים ומגנים על המידע שלכם.
          </p>
        </div>

        <div className={s.body}>
          {SECTIONS.map(sec => (
            <section key={sec.title} className={s.section}>
              <h2 className={s.sectionTitle}>{sec.title}</h2>
              <p className={s.sectionBody}>{sec.body}</p>
            </section>
          ))}
        </div>

        <div className={s.footer}>
          <Link to="/terms" className={s.link}>תנאי שימוש ←</Link>
          <Link to="/" className={s.link}>חזרה לדף הבית</Link>
        </div>
      </div>
    </div>
  );
}
