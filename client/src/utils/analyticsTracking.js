// First-party, non-PII visit beacon backing the real conversion-rate KPI
// (see server/models/DailyVisit.js / server/services/traffic.service.js).
// anonId is a random token stored in localStorage — never an email, name,
// or IP — used only to dedupe "one session per browser per Israel calendar
// day" server-side. No third-party analytics, no cookies beyond this one
// first-party localStorage key.
const ANON_ID_KEY = 'tv_anon_id';

function getOrCreateAnonId() {
    try {
        let id = localStorage.getItem(ANON_ID_KEY);
        if (!id) {
            id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
            localStorage.setItem(ANON_ID_KEY, id);
        }
        return id;
    } catch {
        return null; // localStorage unavailable (private browsing, etc.) — tracking is best-effort only
    }
}

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

// Best-effort, fire-and-forget — must never throw or block navigation.
// Uses sendBeacon when available (survives the page unloading right after a
// route change) with a fetch(keepalive) fallback.
export function trackVisit(isProductPage = false) {
    const anonId = getOrCreateAnonId();
    if (!anonId) return;

    const payload = JSON.stringify({ anonId, isProductPage });
    const url = `${BASE}/track/visit`;

    try {
        if (navigator.sendBeacon) {
            const blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon(url, blob);
            return;
        }
    } catch {
        // fall through to fetch
    }

    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true })
        .catch(() => {}); // analytics failure must never surface to the user
}
