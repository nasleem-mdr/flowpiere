import { useState, useCallback, useRef, useEffect } from 'react';
import { idempiereApi, fkId } from '@/api/idempiereApi';

export function useCustomerSearch() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  // Query 1 — search-as-you-type, select minimal, robust di semua instance
  const runSearch = useCallback(async (query) => {
    const q = (query || '').trim();
    if (!q) { setCustomers([]); return; }
    setLoading(true);
    try {
      const safeQ = q.toUpperCase().replace(/'/g, "''");
      const res = await idempiereApi(
        `/models/c_bpartner?$select=C_BPartner_ID,Name,Value` +
        `&$filter=IsActive eq true and IsCustomer eq true and contains(toupper(Name),'${safeQ}')` +
        `&$orderby=Name&$top=20`
      );
      const records = Array.isArray(res.records) ? res.records : [];
      setCustomers(records.map(r => ({
        C_BPartner_ID: fkId(r.C_BPartner_ID) ?? r.id ?? r.C_BPartner_ID,
        Name: r.Name,
        Value: r.Value,
      })));
    } catch (err) {
      console.error('Gagal mencari customer:', err);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Query 2 — BARU: fetch M_PriceList_ID terpisah, hanya dipanggil saat user KLIK pilih customer
  const fetchCustomerPriceList = useCallback(async (bpartnerId) => {
    try {
      const res = await idempiereApi(
        `/models/c_bpartner?$filter=C_BPartner_ID eq ${bpartnerId}&$top=1`
        // ← TANPA $select — full record, biar M_PriceList_ID ikut kebawa
      );
      const records = Array.isArray(res.records) ? res.records : [];
      if (records.length === 0) return null;
      return fkId(records[0].M_PriceList_ID) ?? null;
    } catch (err) {
      console.error('Gagal fetch price list customer:', err.message);
      return null;
    }
  }, []);

  const searchCustomer = useCallback((query) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 300);
  }, [runSearch]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const getDefaultBPLocation = useCallback(async (bpartnerId) => {
    try {
      const res = await idempiereApi(
        `/models/c_bpartner_location?$select=C_BPartner_Location_ID` +
        `&$filter=C_BPartner_ID eq ${bpartnerId} and IsActive eq true&$top=1`
      );
      const records = Array.isArray(res.records) ? res.records : [];
      if (records.length === 0) return null;
      return fkId(records[0].C_BPartner_Location_ID) ?? records[0].id ?? null;
    } catch (err) {
      console.error('Gagal fetch lokasi customer:', err.message);
      return null;
    }
  }, []);

  // ── BARU: resolve M_PriceList_Version_ID yang aktif dari sebuah PriceList ──
  // Ambil versi dengan ValidFrom <= hari ini, terbaru (orderby ValidFrom desc),
  // ini pola standar iDempiere untuk cari versi price list yang sedang berlaku.
  const getActivePriceListVersion = useCallback(async (priceListId) => {
    if (!priceListId) return null;
    try {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const res = await idempiereApi(
        `/models/m_pricelist_version?$select=M_PriceList_Version_ID,ValidFrom` +
        `&$filter=M_PriceList_ID eq ${priceListId} and IsActive eq true and ValidFrom le ${today}` +
        `&$orderby=ValidFrom desc&$top=1`
      );
      const records = Array.isArray(res.records) ? res.records : [];
      if (records.length === 0) return null;
      return fkId(records[0].M_PriceList_Version_ID) ?? records[0].id ?? null;
    } catch (err) {
      console.error('Gagal fetch price list version:', err.message);
      return null;
    }
  }, []);

  // ── BARU: gabungan — dari bpartner (yang sudah punya M_PriceList_ID dari
  // hasil search) langsung dapat M_PriceList_Version_ID yang siap dipakai
  // untuk query M_ProductPrice saat menambahkan produk ke cart.
  const resolveCustomerPricing = useCallback(async (bpartner) => {
    const bpId = bpartner?.C_BPartner_ID;
    if (!bpId) {
      return { priceListId: null, priceListVersionId: null };
    }
  
    // ── BARU: fetch M_PriceList_ID terpisah (bukan baca dari objek search result) ──
    const priceListId = await fetchCustomerPriceList(bpId);
    if (!priceListId) {
      return { priceListId: null, priceListVersionId: null };
    }
  
    const priceListVersionId = await getActivePriceListVersion(priceListId);
    return { priceListId, priceListVersionId };
  }, [fetchCustomerPriceList, getActivePriceListVersion]);

  return {
    customers, loading, searchCustomer,
    getDefaultBPLocation,
    getActivePriceListVersion,
    resolveCustomerPricing,   // ← ini yang dipanggil dari container
  };
}