import { useState, useCallback } from 'react';
import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';

// ─────────────────────────────────────────────────────────────────────────────
// useProductVendorInfo.jsx
// M_Product_PO adalah tabel master "vendor mana saja yang bisa memasok produk
// X" di iDempiere — dipakai di sini HANYA untuk daftar vendor & penanda
// IsCurrentVendor (default suggestion), TIDAK lagi untuk harga.
//
// Harga suggestion sekarang diambil dari M_PriceList (via M_ProductPrice),
// bukan dari M_Product_PO.PriceList. Urutan penentuan Price List per vendor:
//   1. C_BPartner.PO_PriceList_ID milik vendor tsb, kalau ada.
//   2. Kalau kosong → fallback ke DEFAULT_PURCHASE_PRICELIST_ID di bawah.
// Dari M_PriceList_ID terpilih, dicari M_PriceList_Version yang aktif
// (ValidFrom terbaru yang <= hari ini), lalu M_ProductPrice.PriceList untuk
// produk tsb pada version itu.
//
// Kalau produk sama sekali tidak punya M_Product_PO, vendor harus dipilih
// manual (lihat VendorPickerModal) — harga tetap bisa di-suggest via
// fetchListPrice() begitu vendor dipilih.
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ WAJIB DISESUAIKAN: M_PriceList_ID Purchase Price List default, dipakai
// sebagai fallback kalau vendor tidak punya PO_PriceList_ID sendiri.
// Cek lewat: GET /api/v1/models/m_pricelist?$select=M_PriceList_ID,Name,IsSOPriceList&$filter=IsSOPriceList eq false
const DEFAULT_PURCHASE_PRICELIST_ID = 1000000; // ← GANTI sesuai instance Anda

// Cache sederhana di level modul (bukan state React) supaya tidak query
// berulang-ulang untuk price list / bpartner yang sama dalam satu sesi.
// Catatan: cache ini tidak auto-invalidate — kalau ada perubahan
// PO_PriceList_ID vendor atau versi price list baru saat app masih terbuka,
// perlu refresh halaman. Cukup aman untuk skala pemakaian saat ini.
const priceListVersionCache = new Map(); // M_PriceList_ID -> M_PriceList_Version_ID | null
const bpartnerPriceListCache = new Map(); // C_BPartner_ID -> M_PriceList_ID

export function useProductVendorInfo() {
  const [loading, setLoading] = useState(false);

  // Ambil M_PriceList_Version yang aktif untuk sebuah M_PriceList_ID.
  const getActivePriceListVersion = useCallback(async (priceListId) => {
    if (!priceListId) return null;
    if (priceListVersionCache.has(priceListId)) return priceListVersionCache.get(priceListId);

    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await idempiereApi(
        `/models/m_pricelist_version?$filter=M_PriceList_ID eq ${priceListId} and IsActive eq true` +
        ` and ValidFrom le ${today}T00:00:00&$select=M_PriceList_Version_ID,ValidFrom` +
        `&$orderby=ValidFrom desc&$top=1`
      );
      const records = Array.isArray(res.records) ? res.records : [];
      const versionId = records.length
        ? (fkId(records[0].M_PriceList_Version_ID) ?? records[0].id)
        : null;
      priceListVersionCache.set(priceListId, versionId);
      return versionId;
    } catch (err) {
      console.error(`[useProductVendorInfo] gagal ambil versi price list #${priceListId}:`, err);
      priceListVersionCache.set(priceListId, null);
      return null;
    }
  }, []);

  // Ambil PO_PriceList_ID milik vendor. Fallback ke default kalau vendor
  // tidak punya, atau kalau field-nya null.
  const getVendorPriceListId = useCallback(async (bpartnerId) => {
    if (!bpartnerId) return DEFAULT_PURCHASE_PRICELIST_ID;
    if (bpartnerPriceListCache.has(bpartnerId)) return bpartnerPriceListCache.get(bpartnerId);

    try {
      const res = await idempiereApi(`/models/c_bpartner/${bpartnerId}?$select=PO_PriceList_ID`);
      const plId = fkId(res.PO_PriceList_ID) || DEFAULT_PURCHASE_PRICELIST_ID;
      bpartnerPriceListCache.set(bpartnerId, plId);
      return plId;
    } catch (err) {
      console.error(`[useProductVendorInfo] gagal ambil PO_PriceList_ID vendor #${bpartnerId}:`, err);
      bpartnerPriceListCache.set(bpartnerId, DEFAULT_PURCHASE_PRICELIST_ID);
      return DEFAULT_PURCHASE_PRICELIST_ID;
    }
  }, []);

  // Ambil harga M_ProductPrice untuk 1 produk pada 1 price list version
  // tertentu. Mengembalikan { priceStd, priceList } — PriceStd dipakai
  // sebagai suggestion utama (konsisten dengan window PO native, yang
  // mengisi PriceEntered/PriceActual dari PriceStd), PriceList hanya info
  // referensi/pembanding.
  const getProductListPrice = useCallback(async (productId, priceListVersionId) => {
    if (!priceListVersionId) return { priceStd: 0, priceList: 0 };
    try {
      const res = await idempiereApi(
        `/models/m_productprice?$filter=M_Product_ID eq ${productId} and M_PriceList_Version_ID eq ${priceListVersionId}` +
        `&$select=PriceStd,PriceList&$top=1`
      );
      const records = Array.isArray(res.records) ? res.records : [];
      if (!records.length) return { priceStd: 0, priceList: 0 };
      return {
        priceStd:  parseFloat(records[0].PriceStd  || 0),
        priceList: parseFloat(records[0].PriceList || 0),
      };
    } catch (err) {
      console.error(`[useProductVendorInfo] gagal ambil harga produk #${productId}:`, err);
      return { priceStd: 0, priceList: 0 };
    }
  }, []);

  // Helper publik: ambil harga (PriceStd + PriceList) untuk 1 produk +
  // 1 vendor tertentu. Dipakai saat user pilih vendor manual lewat
  // VendorPickerModal, supaya harga ikut ter-suggest ulang sesuai price
  // list vendor yang baru dipilih.
  const fetchListPrice = useCallback(async (productId, bpartnerId) => {
    const priceListId = await getVendorPriceListId(bpartnerId);
    const versionId = await getActivePriceListVersion(priceListId);
    return getProductListPrice(productId, versionId); // { priceStd, priceList }
  }, [getVendorPriceListId, getActivePriceListVersion, getProductListPrice]);

  const fetchVendorOptions = useCallback(async (productId) => {
    try {
      const res = await idempiereApi(
        `/models/m_product_po?$filter=M_Product_ID eq ${productId} and IsActive eq true` +
        `&$select=C_BPartner_ID,IsCurrentVendor&$orderby=IsCurrentVendor desc`
      );
      const records = Array.isArray(res.records) ? res.records : [];

      const options = await Promise.all(records.map(async (v) => {
        const bpartnerId = fkId(v.C_BPartner_ID);
        const { priceStd, priceList } = await fetchListPrice(productId, bpartnerId);
        return {
          C_BPartner_ID: bpartnerId,
          VendorName:    fkLabel(v.C_BPartner_ID),
          Price:         priceStd,   // suggestion utama → sama seperti window PO native
          PriceListRef:  priceList,  // info referensi/pembanding, opsional ditampilkan
          isCurrent:     !!v.IsCurrentVendor,
        };
      }));
      return options;
    } catch (err) {
      console.error(`[useProductVendorInfo] gagal fetch vendor produk #${productId}:`, err);
      return [];
    }
  }, [fetchListPrice]);

  // Ambil satu produk saja (dipakai saat user tambah produk manual via
  // ProductDetailSheet) — mengembalikan langsung suggestion default-nya.
  const fetchDefaultVendor = useCallback(async (productId) => {
    setLoading(true);
    try {
      const options = await fetchVendorOptions(productId);
      const def = options.find(v => v.isCurrent) || options[0] || null;
      return { options, default: def };
    } finally {
      setLoading(false);
    }
  }, [fetchVendorOptions]);

  // Ambil vendor untuk BANYAK produk sekaligus, secara PARALEL (bukan 1 query
  // filter besar) — supaya request tetap pendek & mudah didiagnosis kalau ada
  // yang gagal (pelajaran dari isu filter panjang di modul Goods Receipt).
  const fetchVendorOptionsBatch = useCallback(async (productIds) => {
    const results = await Promise.all(
      productIds.map(async (id) => ({ id, options: await fetchVendorOptions(id) }))
    );
    const map = {};
    results.forEach(r => { map[r.id] = r.options; });
    return map;
  }, [fetchVendorOptions]);

  return {
    loading,
    fetchVendorOptions,
    fetchDefaultVendor,
    fetchVendorOptionsBatch,
    fetchListPrice,
  };
}
