/** src/config/fieldRestriction.js
* Pembatasan edit level FIELD per role — pasangan dari windowAccessMap
* (yang membatasi level WINDOW).
* 
* Sumber data: 1 kolom string di AD_Role (RestrictedFields).
* 
* FORMAT isi kolom (dipisah koma / titik-koma / baris baru):
*    <windowKey>.<NamaField>          → field read-only
*    <windowKey>.<NamaField>:hide     → field disembunyikan
*    *.<NamaField>                    → berlaku di semua window
* 
* <windowKey> = key yang sama dengan windowAccessMap / ProtectedRoute
* (mis. product, businessPartner, purchaseOrder). Tidak case-sensitive.
* 
* Contoh isi:
*    product.PriceList, product.PriceStd, purchaseOrder.PriceEntered:hide, *.Discount
*/
export const RESTRICTED_FIELDS_COLUMN = "RestrictedFields";

export const parseRestrictedFields = (raw) => {
    const rules = {}; // { windowKey(lower): { field(lower): 'readonly' | 'hidden' } }
    if (!raw || typeof raw !== "string") return rules;

    raw.split(/[,;\n]+/).forEach((token) => {
        const t = token.trim();
        if (!t) return;
        const [target, mode] = t.split(":").map((s) => s.trim());
        const dot = target.indexOf(".");
        if (dot <= 0 || dot === target.length - 1) {
            console.warn(`RestrictedFields: format tidak valid, dilewati → "${t}"`);
            return;
        }
        const win = target.slice(0, dot).toLowerCase();
        const field = target.slice(dot + 1).toLowerCase();
        if (!rules[win]) rules[win] = {};
        rules[win][field] = mode && mode.toLowerCase() === "hide" ? "hidden" : "readonly";
    });
    return rules;
};

// Return: 'hidden' | 'readonly' | null. 'hidden' menang atas 'readonly'.
export const resolveFieldMode = (rules, windowKey, field) => {
    const w = String(windowKey || "").toLowerCase();
    const f = String(field || "").toLowerCase();
    const specific = rules[w] && rules[w][f];
    const wildcard = rules["*"] && rules["*"][f];
    if (specific === "hidden" || wildcard === "hidden") return "hidden";
    return specific || wildcard || null;
};

// ─── Validasi & normalisasi untuk form Manajemen Role ────────────────────────
const WINDOW_RE = /^(\*|[A-Za-z0-9_]+)$/;
const FIELD_RE  = /^[A-Za-z0-9_]+$/;

// Return { entries: [{ windowKey, field, mode: 'readonly'|'hide' }], invalid: [token] }
export const analyzeRestrictedFields = (raw) => {
    const entries = [];
    const invalid = [];
    if (!raw || typeof raw !== "string") return { entries, invalid };

    raw.split(/[,;\n]+/).forEach((token) => {
        const t = token.trim();
        if (!t) return;
        const [target, mode] = t.split(":").map((s) => s.trim());
        const dot = target.indexOf(".");
        const windowKey = dot > 0 ? target.slice(0, dot) : "";
        const field = dot > 0 ? target.slice(dot + 1) : "";
        const modeOk = mode === undefined || ["hide", "readonly"].includes(mode.toLowerCase());
        if (!WINDOW_RE.test(windowKey) || !FIELD_RE.test(field) || !modeOk) {
            invalid.push(t);
            return;
        }
        entries.push({
            windowKey,
            field,
            mode: mode && mode.toLowerCase() === "hide" ? "hide" : "readonly",
        });
    });
    return { entries, invalid };
};

// Bentuk kanonik untuk disimpan: "pos.PriceEntered, product.PriceList:hide"
export const normalizeRestrictedFields = (raw) =>
    analyzeRestrictedFields(raw).entries
        .map((e) => `${e.windowKey}.${e.field}${e.mode === "hide" ? ":hide" : ""}`)
        .join(", ");

/**  ─── Helper editor (Role Management) ─────────────────────────────────────────
 *  Berbeda dengan parseRestrictedFields (yang meng-lowercase key untuk pencocokan),
 *  dua fungsi ini mempertahankan huruf asli agar bisa diedit & disimpan balik.
 * 
 *  "product.PriceStd, *.Discount:hide" → [{ windowKey, field, mode }]
*/
export const parseRestrictedRows = (raw) => {
    const rows = [];
    if (!raw || typeof raw !== "string") return rows;
    raw.split(/[,;\n]+/).forEach((token) => {
        const t = token.trim();
        if (!t) return;
        const [target, mode] = t.split(":").map((s) => s.trim());
        const dot = target.indexOf(".");
        if (dot <= 0 || dot === target.length - 1) return;
        rows.push({
            windowKey: target.slice(0, dot),
            field: target.slice(dot + 1),
            mode: mode && mode.toLowerCase() === "hide" ? "hidden" : "readonly",
        });
    });
    return rows;
};

// Kebalikannya. Baris belum lengkap / tidak valid / duplikat dilewati.
export const serializeRestrictedRows = (rows) => {
    const seen = new Set();
    const out = [];
    (rows || []).forEach((r) => {
        const w = (r.windowKey || "").trim();
        const f = (r.field || "").trim();
        if (!w || !f || /[.,;:\s]/.test(w) || /[.,;:\s]/.test(f)) return;
        const key = `${w}.${f}`.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(`${w}.${f}${r.mode === "hidden" ? ":hide" : ""}`);
    });
    return out.join(", ");
};
