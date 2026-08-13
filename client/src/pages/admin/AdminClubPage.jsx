import { Crown, Info, ShieldAlert } from 'lucide-react';

// Category D honesty note (see final report): the backend has no
// admin-facing membership/club listing endpoint. The only way to view or
// edit a user's membership fields today is PATCH /admin/users/:id, which is
// superadmin-only (server/routes/admin.routes.js) because that same
// endpoint also changes a user's ROLE. Widening it to plain admin would let
// a compromised/malicious admin account escalate its own or another
// account's role to superadmin — a real authorization weakening this task
// explicitly must not introduce. Building a new, narrowly-scoped read
// endpoint (list members, membership status/plan/points only, no role
// field) would be the safe way to make this page real, but that is new
// backend work outside this role-architecture reorg's scope — reported
// here honestly rather than faked.
export default function AdminClubPage() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">מועדון לקוחות</h1>
        <p className="text-muted-foreground text-sm mt-1">ניהול חברי מועדון TechVault Club</p>
      </div>

      <div className="flex items-start gap-3 p-4 bg-[#f59e0b]/5 border border-[#f59e0b]/20 rounded-lg text-sm text-foreground">
        <Info className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">מסך זה עדיין ללא חיבור לנתונים אמיתיים</p>
          <p className="text-muted-foreground mt-1">
            אין כרגע endpoint בצד השרת המיועד לרשימת חברי מועדון עבור מנהלים (Admin). הפעולה היחידה הקיימת כיום
            לעדכון שדות חברות (<code>membership.status</code>, נקודות וכו׳) היא <code>PATCH /admin/users/:id</code>,
            שמוגבלת ל-Super Admin בלבד — מכיוון שאותו endpoint גם משנה תפקידי משתמשים (role), הרחבתה ל-Admin רגיל
            הייתה פרצת הרשאות אמיתית (אפשרות להעלאת הרשאות עצמית). לכן מסך זה לא הוצג עם נתונים מזויפים.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 bg-card border border-border rounded-lg text-sm">
        <ShieldAlert className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-foreground font-medium">הצעה לפיתוח עתידי</p>
          <p className="text-muted-foreground mt-1">
            endpoint חדש וממוקד, לדוגמה <code>GET /admin/members</code>, המחזיר רק שם/אימייל/סטטוס חברות/תוכנית/נקודות
            — ללא אפשרות לשנות role — יאפשר למסך זה להיות אמיתי מבלי להרחיב את הרשאות ניהול המשתמשים.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-16 text-center opacity-60">
        <Crown className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-muted-foreground text-sm">אין עדיין נתוני חברי מועדון להצגה</p>
      </div>
    </div>
  );
}
