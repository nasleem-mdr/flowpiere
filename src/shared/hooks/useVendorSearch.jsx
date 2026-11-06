import { useState, useCallback, useRef, useEffect } from 'react';
import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';

// ─────────────────────────────────────────────────────────────────────────────
// useVendorSearch.jsx
// Hook ringan untuk mencari C_BPartner yang berperan sebagai Vendor
// (IsVendor eq true). Dipakai di GoodsReceiptContainer untuk memilih
// "diterima dari vendor mana" — mirip pola useProductSearch tapi lebih
// sederhana (tanpa UOM/PO scoping).
//
// Selain nama vendor, hook ini juga menyediakan getDefaultBPLocation() untuk
// mengambil C_BPartner_Location_ID pertama yang aktif — dibutuhkan iDempiere
// saat Complete dokumen M_InOut (header wajib punya lokasi BP).
// ─────────────────────────────────────────────────────────────────────────────
export function useVendorSearch({ debounceMs = 400 } = {}) {
  const [vendors, setVendors]         = useState([]);
  const [loading, setLoading]         = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const fetchVendors = useCallback(async (query = '') => {
    try {
      setLoading(true);
      const safeQ = query.toUpperCase().replace(/'/g, "''");

      let filter = 'IsVendor eq true and IsActive eq true';
      if (query) {
        filter += ` and (contains(toupper(Name),'${safeQ}') or contains(toupper(Value),'${safeQ}'))`;
      }

      const res = await idempiereApi(
        `/models/c_bpartner?$select=C_BPartner_ID,Name,Value&$filter=${filter}&$orderby=Name&$top=30`
      );
      const records = Array.isArray(res.records) ? res.records : [];

      const list = records.map(v => ({
        C_BPartner_ID: fkId(v.C_BPartner_ID) ?? v.id,
        Name:  v.Name,
        Value: v.Value,
      }));

      setVendors(list);
      return list;
    } catch (err) {
      console.error('[useVendorSearch] error:', err);
      setVendors([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const search = useCallback((query) => {
    setSearchValue(query);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchVendors(query), debounceMs);
  }, [fetchVendors, debounceMs]);

  // Ambil C_BPartner_Location_ID pertama yang aktif untuk vendor tersebut.
  // iDempiere mewajibkan field ini terisi di header M_InOut sebelum Complete.
  const getDefaultBPLocation = useCallback(async (bpartnerId) => {
    if (!bpartnerId) return null;
    try {
      const res = await idempiereApi(
        `/models/c_bpartner_location?$select=C_BPartner_Location_ID,Name&$filter=C_BPartner_ID eq ${bpartnerId} and IsActive eq true&$top=1`
      );
      const records = Array.isArray(res.records) ? res.records : [];
      if (records.length === 0) return null;
      return fkId(records[0].C_BPartner_Location_ID) ?? records[0].id;
    } catch (err) {
      console.error('[useVendorSearch] getDefaultBPLocation error:', err);
      return null;
    }
  }, []);

  return {
    vendors, loading,
    searchValue, setSearchValue,
    fetchVendors, search,
    getDefaultBPLocation,
  };
}
