import { useState, useEffect } from "react";
import { fetchAllPages } from "@/api/fetchAllPages";

/** Metadata akun (Value + AccountType) — SEMUA akun, bukan hanya 100 pertama. */
export const useAccountMeta = () => {
    const [accountMeta, setAccountMeta] = useState(new Map());
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const records = await fetchAllPages(
                    `/models/c_elementvalue?$filter=IsActive eq true` +
                    `&$select=Value,AccountType&$orderby=C_ElementValue_ID`,
                    { isCancelled: () => cancelled }
                );
                if (cancelled) return;
                const map = new Map();
                records.forEach((a) => {
                    map.set(a.id ?? a.C_ElementValue_ID, {
                        value: a.Value,
                        accountType: a.AccountType?.id ?? a.AccountType ?? null,
                    });
                });
                setAccountMeta(map);
            } catch (err) {
                console.error("Gagal mengambil metadata akun:", err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    return { accountMeta, loading };
};
