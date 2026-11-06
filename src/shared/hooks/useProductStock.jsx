import { useState, useCallback } from 'react';
import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';
import { useUomConversion } from './useUomConversion';

// ─────────────────────────────────────────────────────────────────────────────
// useProductStock.jsx
// Dipakai oleh InventoryPickerModal (tombol "Info Stok" di InternalUseContainer)
// DAN oleh alur tambah-manual/scan — keduanya butuh tahu "produk ini stoknya
// ada di locator mana" (persis window Product Info di iDempiere: qty on hand
// per gudang/locator).
//
// Beda dari Goods Receipt: di Goods Receipt kita resolve SATU locator default
// gudang (tempat barang BARU disimpan). Di Internal Use, barang diambil DARI
// stok yang SUDAH ADA — jadi locator per baris ditentukan dari M_StorageOnHand
// (di mana produk itu benar-benar tersimpan), bukan locator default gudang.
//
// C_Charge_ID (mandatory di M_InventoryLine) di-suggest dari custom field
// M_Product.C_Charge_ID (WAJIB dibuat dulu di Application Dictionary
// — lihat INTEGRASI_INTERNAL_USE.md). Kalau field itu belum ada, query
// fallback otomatis tanpa field tsb (fail-safe), dan user tinggal pilih
// Charge manual lewat ChargePickerModal.
// ─────────────────────────────────────────────────────────────────────────────
export function useProductStock() {
  const [warehouses, setWarehouses] = useState([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);

  const [stockList, setStockList] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);

  const { fetchUomOptions } = useUomConversion();

  const fetchWarehouses = useCallback(async () => {
    setLoadingWarehouses(true);
    try {
      const res = await idempiereApi(
        `/models/m_warehouse?$select=M_Warehouse_ID,Name&$filter=IsActive eq true&$orderby=Name`
      );
      const records = Array.isArray(res.records) ? res.records : [];
      const list = records.map(w => ({
        M_Warehouse_ID: fkId(w.M_Warehouse_ID) ?? w.id,
        Name: w.Name,
      }));
      setWarehouses(list);
      return list;
    } catch (err) {
      console.error('[useProductStock] fetchWarehouses error:', err);
      setWarehouses([]);
      return [];
    } finally {
      setLoadingWarehouses(false);
    }
  }, []);

  // Locator aktif untuk 1 gudang — dipakai untuk scoping query M_StorageOnHand.
  const getLocatorsForWarehouse = useCallback(async (warehouseId) => {
    const res = await idempiereApi(
      `/models/m_locator?$filter=M_Warehouse_ID eq ${warehouseId} and IsActive eq true&$select=M_Locator_ID,Value`
    );
    const records = Array.isArray(res.records) ? res.records : [];
    return records.map(l => ({ M_Locator_ID: fkId(l.M_Locator_ID) ?? l.id, Value: l.Value }));
  }, []);

  // Detail produk (UOM + default charge). Fail-safe: kalau kolom
  // C_Charge_ID belum dibuat di M_Product, otomatis fallback query
  // tanpa field itu supaya tetap jalan (charge tinggal dipilih manual).
  const fetchProductDetail = useCallback(async (productId) => {
    try {
      return await idempiereApi(
        `/models/m_product/${productId}?$select=Name,Value,C_UOM_ID,C_Charge_ID`
      );
    } catch {
      return await idempiereApi(`/models/m_product/${productId}?$select=Name,Value,C_UOM_ID`);
    }
  }, []);

  // Daftar produk + stok di 1 gudang — dipakai InventoryPickerModal (checklist).
  // Hanya produk dengan QtyOnHand > 0 yang ditampilkan (tidak ada gunanya
  // menampilkan produk kosong untuk keperluan Internal Use).
  const fetchProductsWithStock = useCallback(async ({ warehouseId, search = '' }) => {
    if (!warehouseId) return [];
    setLoadingStock(true);
    try {
      const locators = await getLocatorsForWarehouse(warehouseId);
      if (locators.length === 0) { setStockList([]); return []; }

      const locatorFilter = locators.map(l => `M_Locator_ID eq ${l.M_Locator_ID}`).join(' or ');
      const res = await idempiereApi(
        `/models/m_storageonhand?$filter=(${locatorFilter}) and QtyOnHand gt 0` +
        `&$select=M_Product_ID,M_Locator_ID,QtyOnHand`
      );
      const records = Array.isArray(res.records) ? res.records : [];

      // Agregasi per produk: total qty + locator dengan qty terbanyak
      // (jadi target locator pengambilan default).
      const byProduct = new Map();
      records.forEach(r => {
        const pid = fkId(r.M_Product_ID);
        const qty = parseFloat(r.QtyOnHand || 0);
        const locId = fkId(r.M_Locator_ID);
        const locName = fkLabel(r.M_Locator_ID);
        if (!byProduct.has(pid)) {
          byProduct.set(pid, { M_Product_ID: pid, Name: fkLabel(r.M_Product_ID), TotalQty: 0, BestLocatorId: locId, BestLocatorName: locName, BestQty: 0 });
        }
        const entry = byProduct.get(pid);
        entry.TotalQty += qty;
        if (qty > entry.BestQty) {
          entry.BestQty = qty;
          entry.BestLocatorId = locId;
          entry.BestLocatorName = locName;
        }
      });

      let productIds = Array.from(byProduct.keys());

      // Filter search di sisi produk (by Name dari storageonhand identifier
      // dulu; kalau kosong nanti dilengkapi dari fetchProductDetail).
      if (search) {
        const q = search.toLowerCase();
        productIds = productIds.filter(pid => (byProduct.get(pid).Name || '').toLowerCase().includes(q));
      }

      // Detail per produk (UOM + default charge + opsi konversi UOM) —
      // paralel per produk, bukan 1 filter besar (pelajaran dari isu filter
      // panjang sebelumnya).
      const details = await Promise.all(productIds.map(async (pid) => {
        try {
          const d = await fetchProductDetail(pid);
          const baseUomId   = fkId(d?.C_UOM_ID);
          const baseUomName = fkLabel(d?.C_UOM_ID) || 'EA';
          const uomOptions  = await fetchUomOptions(pid, baseUomId, baseUomName);
          return { pid, detail: d, uomOptions };
        } catch (err) {
          console.error(`[useProductStock] gagal fetch detail produk #${pid}:`, err);
          return { pid, detail: null, uomOptions: [] };
        }
      }));

      const list = details.map(({ pid, detail, uomOptions }) => {
        const entry = byProduct.get(pid);
        return {
          M_Product_ID: pid,
          Name:  detail?.Name || entry.Name || `Produk #${pid}`,
          Value: detail?.Value || '',
          C_UOM_ID: fkId(detail?.C_UOM_ID),
          UomName:  fkLabel(detail?.C_UOM_ID) || 'EA',
          QtyOnHand: entry.TotalQty, // SELALU dalam UOM dasar (M_StorageOnHand)
          M_Locator_ID:   entry.BestLocatorId,
          LocatorName:    entry.BestLocatorName,
          DefaultChargeId:   fkId(detail?.C_Charge_ID),
          DefaultChargeName: fkLabel(detail?.C_Charge_ID),
          uomOptions,
          selectedUom: uomOptions[0], // default: UOM dasar (multiplyRate 1)
        };
      }).sort((a, b) => a.Name.localeCompare(b.Name));

      setStockList(list);
      return list;
    } catch (err) {
      console.error('[useProductStock] fetchProductsWithStock error:', err);
      setStockList([]);
      return [];
    } finally {
      setLoadingStock(false);
    }
  }, [getLocatorsForWarehouse, fetchProductDetail, fetchUomOptions]);

  // Versi 1-produk — dipakai saat tambah manual (search/scan) di
  // InternalUseContainer, supaya locator & charge tetap ter-resolve
  // otomatis walau tidak lewat InventoryPickerModal.
  const resolveProductStock = useCallback(async (productId, warehouseId) => {
    try {
      const locators = await getLocatorsForWarehouse(warehouseId);
      if (locators.length === 0) return null;

      const locatorFilter = locators.map(l => `M_Locator_ID eq ${l.M_Locator_ID}`).join(' or ');
      const res = await idempiereApi(
        `/models/m_storageonhand?$filter=M_Product_ID eq ${productId} and (${locatorFilter}) and QtyOnHand gt 0` +
        `&$select=M_Locator_ID,QtyOnHand&$orderby=QtyOnHand desc&$top=1`
      );
      const records = Array.isArray(res.records) ? res.records : [];
      if (records.length === 0) return null; // tidak ada stok produk ini di gudang tsb

      const best = records[0];
      const detail = await fetchProductDetail(productId);
      const baseUomId   = fkId(detail?.C_UOM_ID);
      const baseUomName = fkLabel(detail?.C_UOM_ID) || 'EA';
      const uomOptions  = await fetchUomOptions(productId, baseUomId, baseUomName);

      return {
        M_Locator_ID:   fkId(best.M_Locator_ID),
        LocatorName:    fkLabel(best.M_Locator_ID),
        QtyOnHand:      parseFloat(best.QtyOnHand || 0), // UOM dasar
        DefaultChargeId:   fkId(detail?.C_Charge_ID),
        DefaultChargeName: fkLabel(detail?.C_Charge_ID),
        uomOptions,
        selectedUom: uomOptions[0],
      };
    } catch (err) {
      console.error(`[useProductStock] resolveProductStock error produk #${productId}:`, err);
      return null;
    }
  }, [getLocatorsForWarehouse, fetchProductDetail, fetchUomOptions]);

  return {
    warehouses, loadingWarehouses, fetchWarehouses,
    stockList, loadingStock, fetchProductsWithStock,
    resolveProductStock,
  };
}
