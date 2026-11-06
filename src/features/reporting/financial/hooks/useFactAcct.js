import { useState, useEffect, useCallback, useRef } from "react";
import { fetchAllPages } from "@/api/fetchAllPages";

/** Semua posting Fact_Acct s.d. endDate (di-paginate otomatis). */
export const useFactAcct = (endDate) => {
    const [factLines, setFactLines] = useState([]);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({ loaded: 0, total: null });
    const reqId = useRef(0);

    const reload = useCallback(async () => {
        const myId = ++reqId.current;
        const stale = () => myId !== reqId.current; // abaikan request lama
        setLoading(true);
        setProgress({ loaded: 0, total: null });
        try {
            // 🔧 Tambahkan bila perlu: and PostingType eq 'A' / C_AcctSchema_ID / AD_Org_ID
            const factFilter = `DateAcct le ${endDate}T23:59:59Z`;
            
            const records = await fetchAllPages(
                `/models/fact_acct?$filter=${factFilter}` +
                `&$select=Fact_Acct_ID,DateAcct,Account_ID,AmtAcctDr,AmtAcctCr` +
                `&$orderby=Fact_Acct_ID`, // order UNIK → paging stabil
                {
                    isCancelled: stale,
                    onProgress: (loaded, total) => !stale() && setProgress({ loaded, total }),
                }
            );
            if (stale()) return;

            // Dedupe berdasar id (jaga-jaga bila ada posting baru saat paging)
            const seen = new Map();
            records.forEach((rec) => seen.set(rec.id ?? rec.Fact_Acct_ID, rec));

            setFactLines(
                [...seen.values()].map((rec, idx) => ({
                    key: idx,
                    ts: new Date(rec.DateAcct).getTime(),
                    accountId: rec.Account_ID?.id ?? rec.Account_ID ?? null,
                    debit: parseFloat(rec.AmtAcctDr || 0),
                    credit: parseFloat(rec.AmtAcctCr || 0),
                }))
            );
        } catch (err) {
            if (stale()) return;
            console.error("Gagal mengambil data trend:", err.message);
            setFactLines([]);
        } finally {
            if (!stale()) setLoading(false);
        }
    }, [endDate]);

    useEffect(() => {
        reload();
        return () => { reqId.current++; }; // batalkan saat unmount / endDate berubah
    }, [reload]);

    return { factLines, loading, progress, reload };
};
