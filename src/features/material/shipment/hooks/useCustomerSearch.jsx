import { useState, useCallback, useRef } from 'react';
import { idempiereApi, fkId } from '@/api/idempiereApi';

// ─────────────────────────────────────────────────────────────────────────────
// useCustomerSearch.jsx
// Padanan useVendorSearch (shared/hooks) tapi untuk Business Partner
// berflag IsCustomer. Bentuk return SAMA dengan useVendorSearch:
//   { customers, loading, search, getDefaultBPLocation }
//
// Kalau useVendorSearch Anda sudah menerima parameter flag (mis. 'IsVendor' /
// 'IsCustomer'), hook ini bisa dibuang dan diganti pemanggilan itu.
// ─────────────────────────────────────────────────────────────────────────────
export function useCustomerSearch() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(false);
  const timerRef = useRef(null);

  const search = useCallback((keyword = '') => {
    clearTimeout(timerRef.current);
    const kw = keyword.trim().toLowerCase().replace(/'/g, "''");
    if (!kw) { setCustomers([]); return; }

    // debounce 300ms supaya tidak spam request saat mengetik
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await idempiereApi(
          `/models/c_bpartner` +
          `?$filter=IsCustomer eq true and IsActive eq true and ` +
          `(contains(tolower(Name),'${kw}') or contains(tolower(Value),'${kw}'))` +
          `&$select=C_BPartner_ID,Name,Value&$orderby=Name&$top=20`
        );
        const records = Array.isArray(res.records) ? res.records : [];
        setCustomers(records.map(r => ({
          C_BPartner_ID: r.id ?? fkId(r.C_BPartner_ID),
          Name:          r.Name,
          Value:         r.Value,
        })));
      } catch (err) {
        console.error('Gagal cari customer:', err.message);
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  // Prioritas: alamat IsShipTo aktif → fallback alamat aktif pertama
  const getDefaultBPLocation = useCallback(async (bpartnerId) => {
    try {
      const shipRes = await idempiereApi(
        `/models/c_bpartner_location` +
        `?$filter=C_BPartner_ID eq ${bpartnerId} and IsActive eq true and IsShipTo eq true` +
        `&$select=C_BPartner_Location_ID&$top=1`
      );
      const ship = Array.isArray(shipRes.records) ? shipRes.records : [];
      if (ship[0]) return ship[0].id ?? fkId(ship[0].C_BPartner_Location_ID);

      const anyRes = await idempiereApi(
        `/models/c_bpartner_location` +
        `?$filter=C_BPartner_ID eq ${bpartnerId} and IsActive eq true` +
        `&$select=C_BPartner_Location_ID&$top=1`
      );
      const any = Array.isArray(anyRes.records) ? anyRes.records : [];
      return any[0] ? (any[0].id ?? fkId(any[0].C_BPartner_Location_ID)) : null;
    } catch {
      return null;
    }
  }, []);

  return { customers, loading, search, getDefaultBPLocation };
}
