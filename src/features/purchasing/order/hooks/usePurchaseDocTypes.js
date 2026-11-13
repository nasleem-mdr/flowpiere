// src/features/purchasing/order/hooks/usePurchaseDocTypes.js
// Daftar Document Type Purchase Order (DocBaseType 'POO') yang bisa dipilih user,
// mis. satu Document Type per departemen (masing-masing punya document sequence sendiri).
//
//   - Hanya DocType aktif, IsSOTrx = false, milik org login atau org * (AD_Org_ID = 0).
//   - DocType dengan DocSubTypeSO = 'RM' (Return Material, mis. "Vendor Return Material")
//     TIDAK ikut — DocBaseType-nya sama-sama POO tapi itu bukan Purchase Order.
//   - DocType khusus Cash Purchase (CASH_PO_DOCTYPE_NAME) TIDAK ikut — dipakai alur Cash Purchase.
//   - Pilihan terakhir diingat per user (localStorage) supaya user satu departemen
//     tidak perlu memilih ulang tiap kali.
//   - `fallbackId` (hasil resolveDocTypeId lama) dipakai kalau daftar kosong / gagal dimuat,
//     jadi perilaku lama tetap jalan.
import { useState, useEffect, useMemo, useCallback } from "react";
import { idempiereApi } from "@/api/idempiereApi";
import { getLoginInfo } from "@/shared/hooks/useLoginInfo";
import { CASH_PO_DOCTYPE_NAME } from "@/utils/docTypeResolver";

const storageKey = (userId) => `purchasing.poDocTypeId.${userId ?? "anon"}`;

// Kolom Reference "List" dikembalikan REST sebagai objek { id, identifier, ... } — ambil kodenya.
const listCode = (v) => (v && typeof v === "object" ? (v.id ?? v.identifier ?? "") : (v ?? ""));

// DocSubTypeSO yang BUKAN Purchase Order biasa. Difilter di sisi klien (bukan di $filter)
// karena `ne` di SQL membuang baris ber-NULL, padahal PO biasa justru ber-DocSubTypeSO kosong.
const EXCLUDED_SUBTYPES = ["RM"];

const readSaved = (userId) => {
    try { return Number(localStorage.getItem(storageKey(userId))) || null; } catch { return null; }
};
const writeSaved = (userId, id) => {
    try { localStorage.setItem(storageKey(userId), String(id)); } catch { /* storage tidak tersedia */ }
};

export function usePurchaseDocTypes({ fallbackId = null } = {}) {
    const [docTypes, setDocTypes] = useState([]);   // [{ id, name }]
    const [loading, setLoading] = useState(false);
    const [chosenId, setChosenId] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { orgId, userId } = getLoginInfo();
            if (!orgId) return;
            setLoading(true);
            try {
                const res = await idempiereApi(
                    `/models/c_doctype?$select=Name,DocSubTypeSO` +
                    `&$filter=DocBaseType eq 'POO' and IsSOTrx eq false and IsActive eq true` +
                    ` and (AD_Org_ID eq 0 or AD_Org_ID eq ${orgId})` +
                    `&$orderby=Name&$top=100`
                );
                if (cancelled) return;
                const list = (res.records || [])
                    .filter((r) => r.Name !== CASH_PO_DOCTYPE_NAME)
                    .filter((r) => !EXCLUDED_SUBTYPES.includes(listCode(r.DocSubTypeSO)))
                    .map((r) => ({ id: Number(r.id), name: r.Name || `#${r.id}` }));
                setDocTypes(list);
                const saved = readSaved(userId);
                if (saved && list.some((d) => d.id === saved)) setChosenId(saved);
            } catch (err) {
                console.warn("[Purchasing] Gagal memuat daftar Document Type PO:", err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Urutan: pilihan user → default lama (kalau ada di daftar) → item pertama → default lama apa adanya.
    const selectedId = useMemo(() => {
        if (chosenId) return chosenId;
        if (fallbackId && docTypes.some((d) => d.id === Number(fallbackId))) return Number(fallbackId);
        return docTypes[0]?.id ?? fallbackId ?? null;
    }, [chosenId, fallbackId, docTypes]);

    const select = useCallback((id) => {
        const n = Number(id);
        if (!n) return;
        setChosenId(n);
        writeSaved(getLoginInfo().userId, n);
    }, []);

    return { docTypes, loading, selectedId, select };
}

// Named export (untuk `export *` di index.js) + default export (import langsung dari file ini).
export default usePurchaseDocTypes;