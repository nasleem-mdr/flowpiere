// src/features/master/user/hooks/roleConstants.js

// Kolom Reference "List" di bxservice dikembalikan sebagai objek
// { propertyLabel, id, identifier, model-name } — ambil .id (kode list-nya).
export const listValue = (v) =>
    v && typeof v === "object" ? (v.id ?? v.identifier ?? "") : (v ?? "");

export const isTrue = (v) => v === true || v === "Y";

export const USER_LEVEL_OPTIONS = [
    { value: "CO", label: "Client (CO)" },
    { value: "CL", label: "Client + Organization (CL)" },
    { value: "OR", label: "Organization (OR)" },
    { value: "SS", label: "System (SS)" },
];

export const EMPTY_FORM = {
    name: "", description: "", userLevel: "CO",
    isActive: true, isCanReport: true, isCanExport: true, isShowAcct: false,
    dashboardWidgets: "",
};

// 3 tabel access: endpoint + nama kolom FK-nya
export const ACCESS_DEFS = [
    { key: "org",    label: "🏬 Org Access (AD_Role_OrgAccess)",   table: "ad_role_orgaccess", fk: "AD_Org_ID" },
    { key: "window", label: "🪟 Window Access (AD_Window_Access)", table: "ad_window_access",  fk: "AD_Window_ID" },
    { key: "form",   label: "📋 Form Access (AD_Form_Access)",     table: "ad_form_access",    fk: "AD_Form_ID" },
];

// Window iDempiere yang dipakai aplikasi React ini. Hanya window di daftar ini yang
// tampil di picker Window Access. Tiap entri boleh berupa:
//   - angka            → AD_Window_ID   (DISARANKAN: tidak terpengaruh rename / terjemahan)
//   - string           → AD_Window.Name (cocok persis)
//   - array [..alias..] → "salah satu dari" — untuk window yang namanya beda antar instance,
//                         mis. ["Bank/Cash Statement", "Bank Statement"]
// Entri yang tidak ketemu di instance aktif ditampilkan sebagai peringatan di halaman Role.
const DEFAULT_APP_WINDOWS = [
    "Requisition",
    "Product",
    "Business Partner",
    "Sales Order",
    "Purchase Order",
    "Role",
    "User",
    "Physical Inventory",
    "Purchase Invoice and Credit/Debit Note",
    "Sales Invoice and Credit/Debit Note",
    "Bank/Cash Statement",
    "Payment and Receipt",
    "Sales Invoice",
];

// Override PER INSTANCE tanpa mengubah kode — isi di .env / .env.production, mis.:
//   VITE_APP_WINDOWS=[108,"Requisition",["Bank/Cash Statement","Bank Statement"]]
const readEnvWindows = () => {
    try {
        const raw = import.meta.env?.VITE_APP_WINDOWS;
        const parsed = raw ? JSON.parse(raw) : null;
        return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch (err) {
        console.warn("[APP_WINDOWS] VITE_APP_WINDOWS bukan JSON array yang valid, pakai default:", err.message);
        return null;
    }
};

export const APP_WINDOWS = readEnvWindows() ?? DEFAULT_APP_WINDOWS;