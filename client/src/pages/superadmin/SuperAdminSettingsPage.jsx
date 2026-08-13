import { Info, Server } from 'lucide-react';

// Honest structural placeholder — see final report. No system-settings
// backend resource exists anywhere (no model, no route, no controller) —
// same real gap AdminSettingsPage.jsx / WarehouseSettingsPage.jsx already
// have for business/warehouse settings. Rather than build a form that
// silently doesn't persist (as those two pages currently do), this page is
// explicit that nothing here is saved yet.
export default function SuperAdminSettingsPage() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">הגדרות מערכת</h1>
        <p className="text-muted-foreground text-sm mt-1">הגדרות פלטפורמה ברמת המערכת (Super Admin)</p>
      </div>

      <div className="flex items-start gap-3 p-4 bg-[#f59e0b]/5 border border-[#f59e0b]/20 rounded-lg text-sm text-foreground">
        <Info className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">אין עדיין משאב backend להגדרות מערכת</p>
          <p className="text-muted-foreground mt-1">
            לא קיים model/route/controller לשמירת הגדרות מערכת. מסך זה נשאר כמבנה ריק ומתועד במקום להציג טופס
            שלא שומר בפועל.
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Server className="w-4 h-4 text-muted-foreground" /> תצורה נוכחית (קריאה בלבד)
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          כל תצורת המערכת בפועל (סביבת הרצה, גרסת Node, זמינות MongoDB, גיבויים) כבר מוצגת באמת במסך{' '}
          <strong className="text-foreground">סטטוס מערכת</strong> — זהו מקור המידע האמיתי היחיד שקיים כרגע.
        </p>
      </div>
    </div>
  );
}
