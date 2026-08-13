import { ShieldCheck, Terminal, Info } from 'lucide-react';

// Honest structural placeholder — see final report. No HTTP
// credential-rotation/security-management API exists anywhere in the
// backend today; the only real capability is a one-time CLI script
// (server/scripts/rotateProductionCredentials.js) that rotates a fixed list
// of demo/seed account passwords via env vars, run manually by a developer/
// operator with server access — never through the web UI. Rather than
// invent fake "rotate now" buttons wired to nothing, this page documents
// the real, current state.
export default function SuperAdminSecurityPage() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">אבטחה</h1>
        <p className="text-muted-foreground text-sm mt-1">מצב אבטחה ברמת הפלטפורמה</p>
      </div>

      <div className="flex items-start gap-3 p-4 bg-[#f59e0b]/5 border border-[#f59e0b]/20 rounded-lg text-sm text-foreground">
        <Info className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">אין עדיין API לניהול אבטחה/סיסמאות מהממשק</p>
          <p className="text-muted-foreground mt-1">
            כרגע אין endpoint בצד השרת לסבב (rotation) של סיסמאות/אישורים דרך ממשק הניהול. יכולת זו קיימת רק כסקריפט
            הפעלה חד-פעמי בשרת עצמו.
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-muted-foreground" /> סבב אישורים (Credential Rotation)
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          קיים סקריפט אמיתי: <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">server/scripts/rotateProductionCredentials.js</code>.
          הוא מסבב סיסמאות של חשבונות דמו/seed קבועים דרך משתני סביבה, ומופעל ידנית בשרת — לא דרך דפדפן, ולא דרך
          חשבון Super Admin.
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" /> מנגנון ההרשאות הקיים
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          כל בקשה מאומתת מחדש מול בסיס הנתונים בכל קריאה (<code className="bg-secondary px-1.5 py-0.5 rounded text-xs">authenticate</code> +{' '}
          <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">authorize(...)</code> ב-<code className="bg-secondary px-1.5 py-0.5 rounded text-xs">server/middleware/auth.js</code>)
          — שינוי הרשאות משתמש נכנס לתוקף באופן מיידי, ואינו תלוי בתוכן טוקן ישן.
        </p>
      </div>
    </div>
  );
}
