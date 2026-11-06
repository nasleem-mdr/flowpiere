import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { fetchAccountOptions, fetchFactAcctRows } from "@/features/reporting/financial/utils/generalLedgerApi";
import {
    buildLedgerGroups, filterGroupsBySearch, computeGrandTotal, getAccountId,
    NO_PARTNER_KEY, partnerKeyOf, DEFAULT_POSTING_TYPE, getPostingTypeLabel,
} from "@/features/reporting/financial/utils/generalLedger";
/**
 * Data + filter + kalkulasi Buku Besar. Tidak ada JSX di sini.
 * Alur: opsi akun (klasifikasi neraca/laba-rugi) → Fact_Acct s.d. endDate →
 * useMemo: saldo awal & running balance per akun (lihat utils/generalLedger.js).
 */
export function useGeneralLedger() {
    const todayStr = new Date().toISOString().split("T")[0];
    const firstOfMonth = todayStr.slice(0, 8) + "01";

    const [startDate, setStartDate] = useState(firstOfMonth);
    const [endDate, setEndDate] = useState(todayStr);

    const [factLines, setFactLines] = useState([]); // semua posting s.d. endDate
    const [loading, setLoading] = useState(false);

    const [accountOptions, setAccountOptions] = useState([]);
    const [selectedAccountIds, setSelectedAccountIds] = useState([]);
    const [accountSearch, setAccountSearch] = useState("");
    const [selectedPartnerKeys, setSelectedPartnerKeys] = useState([]); // id partner / NO_PARTNER_KEY
    const [postingType, setPostingType] = useState(DEFAULT_POSTING_TYPE);
    // ─── Opsi akun ──────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        fetchAccountOptions()
            .then((opts) => { if (!cancelled) setAccountOptions(opts); })
            .catch((err) => console.error("Gagal mengambil daftar akun:", err.message));
        return () => { cancelled = true; };
    }, []);

    const accountMetaMap = useMemo(() => {
        const map = new Map();
        accountOptions.forEach((a) => {
            map.set(getAccountId(a), {
                accountType: a.AccountType?.id ?? a.AccountType ?? null,
                value: a.Value,
                name: a.Name,
            });
        });
        return map;
    }, [accountOptions]);

    // ─── Fact_Acct (abaikan respons basi bila filter berubah saat loading) ──
    const requestIdRef = useRef(0);
    const fetchReportData = useCallback(async () => {
        const reqId = ++requestIdRef.current;
        setLoading(true);
        try {
            //const rows = await fetchFactAcctRows({ endDate, accountIds: selectedAccountIds });
            const rows = await fetchFactAcctRows({ endDate, accountIds: selectedAccountIds, postingType });

            if (reqId === requestIdRef.current) setFactLines(rows);
        } catch (err) {
            console.error("Gagal mengambil data buku besar:", err.message);
            if (reqId === requestIdRef.current) setFactLines([]);
        } finally {
            if (reqId === requestIdRef.current) setLoading(false);
        }
    }, [endDate, selectedAccountIds, postingType]);
    
    useEffect(() => { fetchReportData(); }, [fetchReportData]);

    // ─── Filter Business Partner (client-side, dari posting yang sudah ter-load) ─
    // Opsi = partner yang muncul di posting s.d. endDate untuk akun terpilih.
    const partnerOptions = useMemo(() => {
        const map = new Map();
        let hasNone = false;
        factLines.forEach((r) => {
            if (r.bpartnerId) map.set(r.bpartnerId, r.bpartnerName || `#${r.bpartnerId}`);
            else hasNone = true;
        });
        const opts = Array.from(map, ([key, name]) => ({ key, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
        if (hasNone) opts.push({ key: NO_PARTNER_KEY, name: "(Tanpa Business Partner)" });
        return opts;
    }, [factLines]);

    // Difilter SEBELUM dikelompokkan: saldo awal, running balance & total dihitung
    // hanya dari posting partner terpilih (konsisten seperti buku besar pembantu).
    const visibleLines = useMemo(() => {
        if (selectedPartnerKeys.length === 0) return factLines;
        const keys = new Set(selectedPartnerKeys);
        return factLines.filter((r) => keys.has(partnerKeyOf(r)));
    }, [factLines, selectedPartnerKeys]);

    const togglePartner = (key) =>
        setSelectedPartnerKeys((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
        );
    const clearPartnerFilter = () => setSelectedPartnerKeys([]);
    const partnerFilterLabel =
        selectedPartnerKeys.length === 0 ? "Semua Partner" : `${selectedPartnerKeys.length} partner dipilih`;
    // Ringkasan untuk header PDF/Excel ("" bila filter tidak aktif)
    const partnerFilterSummary = useMemo(() => {
        if (selectedPartnerKeys.length === 0) return "";
        const names = selectedPartnerKeys.map(
            (k) => partnerOptions.find((o) => o.key === k)?.name || `#${k}`
        );
        
        return names.length <= 3 ? names.join(", ") : `${names.length} partner`;
    }, [selectedPartnerKeys, partnerOptions]);

    // ─── Turunan ────────────────────────────────────────────────────────────
    const groupedByAccount = useMemo(
        () => buildLedgerGroups({ factLines: visibleLines, accountMetaMap, startDate, endDate }),
        [visibleLines, accountMetaMap, startDate, endDate]
    );
    const filteredGroups = useMemo(
        () => filterGroupsBySearch(groupedByAccount, accountSearch),
        [groupedByAccount, accountSearch]
    );
    const grandTotal = useMemo(() => computeGrandTotal(filteredGroups), [filteredGroups]);

    // ─── Multi-select akun ──────────────────────────────────────────────────
    const toggleAccount = (accountId) =>
        setSelectedAccountIds((prev) =>
            prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
        );
    const clearAccountFilter = () => setSelectedAccountIds([]);
    const accountFilterLabel =
        selectedAccountIds.length === 0 ? "Semua Akun" : `${selectedAccountIds.length} akun dipilih`;
    const postingTypeLabel = getPostingTypeLabel(postingType);
    
    return {
        startDate, setStartDate, endDate, setEndDate,
        loading,
        accountOptions, selectedAccountIds, toggleAccount, clearAccountFilter, accountFilterLabel,
        accountSearch, setAccountSearch,
        partnerOptions, selectedPartnerKeys, togglePartner, clearPartnerFilter,
        partnerFilterLabel, partnerFilterSummary,
        filteredGroups, grandTotal,
        postingType, setPostingType, postingTypeLabel,
    };
}