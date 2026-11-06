// src/features/master/user/hooks/restrictedFieldsApi.js
import { idempiereApi } from "@/api/idempiereApi";
import { RESTRICTED_FIELDS_COLUMN } from "@/config/fieldRestriction";

/**
 * Cek apakah kolom RestrictedFields sudah ada di AD_Role (via AD_Column).
 * Kalau belum ada / gagal dicek → false, sehingga input Field Restriction
 * disembunyikan dan kolom TIDAK ikut dikirim saat simpan role (kalau
 * dikirim ke kolom yang tidak ada, seluruh simpan role akan ditolak REST).
 */
export const checkRestrictedColumnExists = async () => {
    try {
        const t = await idempiereApi(
            `/models/ad_table?$filter=TableName eq 'AD_Role'&$select=AD_Table_ID&$top=1`
        );
        const tableId = t?.records?.[0]?.id;
        if (!tableId) return false;

        const c = await idempiereApi(
            `/models/ad_column?$filter=AD_Table_ID eq ${tableId}` +
            ` and ColumnName eq '${RESTRICTED_FIELDS_COLUMN}' and IsActive eq true` +
            `&$select=ColumnName&$top=1`
        );
        return (c?.records?.length || 0) > 0;
    } catch (err) {
        console.warn("Gagal cek kolom RestrictedFields di AD_Column:", err.message);
        return false;
    }
};
