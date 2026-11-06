// src/shared/hooks/useFieldRestrictions.js
import { useEffect, useState } from 'react';
import { idempiereApi } from '@/api/idempiereApi';
import { getLoginInfo } from '@/shared/hooks';
import { RESTRICTED_FIELDS_COLUMN, parseRestrictedFields } from '@/config/fieldRestriction';

/**
 * Ambil kolom RestrictedFields dari AD_Role role yang sedang login,
 * parse jadi aturan. Dipakai oleh AccessProvider (fetch sekali).
 *
 * PENGAMAN: jika kolom RestrictedFields belum ada di AD_Role (atau kosong),
 * hasilnya aturan kosong = tidak ada pembatasan. Gagal fetch (mis. tidak ada
 * izin baca AD_Role) juga fail-open; hanya dicatat di console.
 *
 * ASUMSI: getLoginInfo() mengembalikan { roleId }. Kalau nama key-nya
 * beda, ubah satu baris di bawah.
 *
 * Jangan diekspor lewat '@/shared/hooks/index' (hindari import melingkar).
 */
export const useFieldRestrictions = () => {
    const roleId = getLoginInfo()?.roleId;
    const [rules, setRules] = useState({});
    const [loading, setLoading] = useState(!!roleId);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!roleId) {
            setRules({});
            setLoading(false);
            return undefined;
        }
        let cancelled = false;
        setLoading(true);
        // Sengaja TANPA $select: kalau kolom RestrictedFields belum dibuat di
        // AD_Role, $select ke kolom yang tidak ada akan ditolak REST (error).
        // Tanpa $select, kolom yang belum ada cukup tidak muncul di respons
        // → tidak ada pembatasan, tanpa error.
        idempiereApi(`/models/ad_role/${roleId}`)
            .then((res) => {
                if (cancelled) return;
                const raw = res?.[RESTRICTED_FIELDS_COLUMN];
                // Kolom belum dibuat / kosong / bukan string → tidak ada pembatasan.
                setRules(typeof raw === 'string' ? parseRestrictedFields(raw) : {});
                setError(null);
            })
            .catch((err) => {
                if (cancelled || err?.name === 'AbortError') return;
                console.error('Gagal mengambil RestrictedFields:', err.message);
                setRules({});
                setError(err.message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [roleId]);

    return { rules, loading, error };
};

export default useFieldRestrictions;
