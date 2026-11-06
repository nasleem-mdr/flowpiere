import { useState, useCallback, useRef, useEffect } from 'react';
import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';

const PAGE_SIZE = 20; // jumlah produk per "halaman" infinite scroll (server-side skip/top)

export function useProductSearch({ debounceMs = 420 } = {}) {
  const [products, setProducts]       = useState([]);
  const [loading, setLoading]         = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const debounceRef = useRef(null);

  // Menyimpan parameter pencarian terakhir + state pagination internal
  const lastParamsRef  = useRef({ query: '', warehouseId: null });
  const skipRef        = useRef(0);     // server-side skip, dipakai di semua mode sekarang
  const locatorIdsRef  = useRef(null);  // cache locator IDs utk warehouse terpilih (HANYA utk scoping QtyOnHand, bukan filter produk)

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  // ── shared helper: build product objects dari raw API records ──────────────
  const buildProducts = useCallback((rawProducts, poRecords, uomRecords, qtyMap = new Map()) => {
    const vendorMap = new Map();
    poRecords.forEach(po => {
      const pid = fkId(po.M_Product_ID);
      if (pid && !vendorMap.has(pid)) {
        vendorMap.set(pid, {
          vendorId:   fkId(po.C_BPartner_ID),
          vendorName: fkLabel(po.C_BPartner_ID),
        });
      }
    });

    const uomConvMap = new Map();
    uomRecords.forEach(conv => {
      const pid       = fkId(conv.M_Product_ID);
      const fromUomId = fkId(conv.C_UOM_ID);
      const toUomId   = fkId(conv.C_UOM_To_ID);
      const toUomName = fkLabel(conv.C_UOM_To_ID);
      const fromName  = fkLabel(conv.C_UOM_ID);

      if (!pid) return;
      if (!uomConvMap.has(pid)) uomConvMap.set(pid, []);
      const list = uomConvMap.get(pid);

      if (fromUomId && !list.find(u => u.C_UOM_ID === fromUomId)) {
        list.push({ C_UOM_ID: fromUomId, Name: fromName || `UOM#${fromUomId}`, multiplyRate: 1 });
      }
      if (toUomId && !list.find(u => u.C_UOM_ID === toUomId)) {
        list.push({ C_UOM_ID: toUomId, Name: toUomName || `UOM#${toUomId}`, multiplyRate: conv.MultiplyRate ?? 1 });
      }
    });

    return rawProducts
      .filter(p => vendorMap.has(fkId(p.M_Product_ID) ?? p.id))
      .map(p => {
        const pid       = fkId(p.M_Product_ID) ?? p.id;
        const vendor    = vendorMap.get(pid);
        const baseUomId = fkId(p.C_UOM_ID);
        const baseUom   = { C_UOM_ID: baseUomId, Name: fkLabel(p.C_UOM_ID) || 'EA', multiplyRate: 1 };
        const convUoms  = uomConvMap.get(pid) || [];
        const allUoms   = [baseUom, ...convUoms.filter(u => u.C_UOM_ID !== baseUomId)];

        return {
          M_Product_ID: pid,
          Name:         p.Name,
          Value:        p.Value,
          UPC:          p.UPC || null,
          C_UOM_ID:     baseUomId,
          C_UOM_Name:   baseUom.Name,
          Description:  p.Description || null,
          VendorId:     vendor?.vendorId,
          VendorName:   vendor?.vendorName,
          uomOptions:   allUoms,
          QtyOnHand:    qtyMap.get(pid) ?? 0,
        };
      });
  }, []);

  // Ambil daftar locator milik satu warehouse — HANYA dipakai untuk men-scope
  // QtyOnHand yang ditampilkan (mis. "stok di gudang X"), TIDAK PERNAH dipakai
  // untuk menyaring/mengecualikan produk dari daftar. Produk yang belum
  // punya Default Locator, atau Default Locator-nya di gudang lain, tetap
  // harus muncul — Requisition/Purchasing adalah tahap SEBELUM produk itu
  // punya histori stok/lokasi, jadi tidak boleh disyaratkan gudang tertentu.
  const fetchWarehouseLocatorIds = useCallback(async (warehouseId) => {
    if (!warehouseId) return null;
    try {
      const data = await idempiereApi(
        `/models/m_locator?$select=M_Locator_ID&$filter=M_Warehouse_ID eq ${warehouseId} and IsActive eq true&$top=500`
      );
      return (data.records || []).map(r => r.id ?? fkId(r.M_Locator_ID)).filter(Boolean);
    } catch (err) {
      console.warn('[useProductSearch] fetchWarehouseLocatorIds error:', err);
      return null;
    }
  }, []);

  // ── scoring: prioritas Value/Name di atas UPC/Description ──────────────────
  const scoreMatch = useCallback((product, safeQ) => {
    if (!safeQ) return 0;

    const value       = (product.Value || '').toUpperCase();
    const name        = (product.Name || '').toUpperCase();
    const upc         = (product.UPC || '').toUpperCase();
    const description = (product.Description || '').toUpperCase();

    let score = 0;

    if (value === safeQ) score = Math.max(score, 100);
    else if (value.startsWith(safeQ)) score = Math.max(score, 90);
    else if (value.includes(safeQ)) score = Math.max(score, 70);

    if (name === safeQ) score = Math.max(score, 95);
    else if (name.startsWith(safeQ)) score = Math.max(score, 80);
    else if (name.includes(safeQ)) score = Math.max(score, 60);

    if (upc === safeQ) score = Math.max(score, 85);
    else if (upc.includes(safeQ)) score = Math.max(score, 50);

    if (description.includes(safeQ)) score = Math.max(score, 20);

    return score;
  }, []);

  // ── enrich: ambil PO + UOM (+ QtyOnHand ter-scope locator, opsional) ───────
  // locatorIds di sini HANYA mempersempit query m_storage (buat angka QtyOnHand
  // yang ditampilkan), sama sekali tidak menyaring rawProducts.
  const enrichAndSort = useCallback(async (rawProducts, query, safeQ, locatorIds = null) => {
    if (rawProducts.length === 0) return [];

    const productIds = rawProducts.map(p => fkId(p.M_Product_ID) ?? p.id).filter(Boolean);
    const idScopeFilter = productIds.map(id => `M_Product_ID eq ${id}`).join(' or ');
    let storageFilter = `(${idScopeFilter})`;
    if (locatorIds && locatorIds.length > 0) {
      const locOrClause = locatorIds.map(id => `M_Locator_ID eq ${id}`).join(' or ');
      storageFilter += ` and (${locOrClause})`;
    }

    const [productPoData, uomConvData, storageData] = await Promise.all([
      idempiereApi(`/models/m_product_po?$select=M_Product_ID,C_BPartner_ID,IsCurrentVendor&$filter=IsActive eq true and IsCurrentVendor eq true and (${idScopeFilter})`),
      idempiereApi(`/models/c_uom_conversion?$select=C_UOM_Conversion_ID,M_Product_ID,C_UOM_ID,C_UOM_To_ID,MultiplyRate,DivideRate&$filter=IsActive eq true and (${idScopeFilter})`),
      idempiereApi(`/models/m_storage?$select=M_Product_ID,QtyOnHand&$filter=${storageFilter}`),
    ]);

    const poRecords      = Array.isArray(productPoData.records) ? productPoData.records : [];
    const uomRecords     = Array.isArray(uomConvData.records)   ? uomConvData.records   : [];
    const storageRecords = Array.isArray(storageData.records)   ? storageData.records   : [];

    // Agregasi QtyOnHand per produk — 1 produk bisa punya banyak baris
    // M_Storage (beda locator/lot), dijumlahkan.
    const qtyMap = new Map();
    storageRecords.forEach(r => {
      const pid = fkId(r.M_Product_ID);
      if (!pid) return;
      qtyMap.set(pid, (qtyMap.get(pid) || 0) + parseFloat(r.QtyOnHand || 0));
    });

    const finalProducts = buildProducts(rawProducts, poRecords, uomRecords, qtyMap);

    return query
      ? [...finalProducts].sort((a, b) => scoreMatch(b, safeQ) - scoreMatch(a, safeQ))
      : finalProducts;
  }, [buildProducts, scoreMatch]);

  // ── fetch satu halaman produk — server-side skip/top, TIDAK pernah
  //    difilter berdasarkan warehouse/locator. locatorIds cuma diteruskan
  //    ke enrichAndSort supaya QtyOnHand yang tampil relevan dgn gudang
  //    terpilih (kalau ada) — murni kosmetik, bukan syarat kemunculan. ────────
  const fetchProductsPage = useCallback(async (query, skip, locatorIds) => {
    const safeQ = query.toUpperCase().replace(/'/g, "''");
    let productFilter = 'IsPurchased eq true and IsActive eq true';
    if (query) {
      productFilter += ` and (contains(toupper(Name),'${safeQ}') or contains(toupper(Value),'${safeQ}') or contains(toupper(UPC),'${safeQ}') or contains(toupper(Description),'${safeQ}'))`;
    }

    const productData = await idempiereApi(
      `/models/m_product?$select=M_Product_ID,Name,Value,UPC,C_UOM_ID,M_Locator_ID,Description,Updated` +
      `&$filter=${productFilter}&$orderby=Updated desc&$top=${PAGE_SIZE}&$skip=${skip}`
    );
    const rawProducts = Array.isArray(productData.records) ? productData.records : [];
    const page = await enrichAndSort(rawProducts, query, safeQ, locatorIds);
    return { page, rawCount: rawProducts.length };
  }, [enrichAndSort]);

  // ── fetchFilledPage: bungkus fetchProductsPage supaya "halaman kosong
  //    palsu" tidak pernah nyampe ke UI. ──────────────────────────────────────
  //    Filter vendor (M_Product_PO.IsCurrentVendor) jalan di CLIENT setelah
  //    $skip/$top dieksekusi di SERVER. Jadi satu halaman mentah 20 produk
  //    bisa saja hasil akhirnya 0 (semua kebetulan belum ada vendor aktif),
  //    padahal produk valid masih ada di skip berikutnya. Fungsi ini otomatis
  //    lanjut scan skip demi skip sampai terkumpul minimal PAGE_SIZE produk
  //    valid, ATAU server benar-benar habis (rawCount < PAGE_SIZE), ATAU
  //    batas MAX_SCAN_ROUNDS tercapai (jaga-jaga jangan scan tanpa henti
  //    kalau memang mayoritas katalog belum ada vendor-nya).
  const MAX_SCAN_ROUNDS = 10; // maksimal 10 x PAGE_SIZE = 200 produk mentah di-scan per aksi
  const fetchFilledPage = useCallback(async (query, startSkip, locatorIds) => {
    let skip = startSkip;
    let collected = [];
    let serverExhausted = false;

    for (let round = 0; round < MAX_SCAN_ROUNDS; round++) {
      const { page, rawCount } = await fetchProductsPage(query, skip, locatorIds);
      skip += rawCount;
      collected = collected.concat(page);

      if (rawCount < PAGE_SIZE) { serverExhausted = true; break; }
      if (collected.length >= PAGE_SIZE) break;
    }

    if (!serverExhausted && collected.length === 0) {
      console.warn(`[useProductSearch] ${MAX_SCAN_ROUNDS * PAGE_SIZE} produk di-scan tanpa hasil — mayoritas katalog mungkin belum punya vendor aktif (M_Product_PO.IsCurrentVendor).`);
    }

    return { items: collected, nextSkip: skip, serverExhausted };
  }, [fetchProductsPage]);

  // ── fetchProducts: reset ke halaman pertama ─────────────────────────────────
  const fetchProducts = useCallback(async (query = '', warehouseId = null) => {
    lastParamsRef.current = { query, warehouseId };
    setLoading(true);
    try {
      // locatorIds cuma dipakai utk scoping QtyOnHand tampilan, sekali per
      // fetchProducts (bukan per fetchWarehousePool lama) — di-cache di ref
      // supaya loadMore tidak perlu fetch m_locator berulang tiap halaman.
      locatorIdsRef.current = warehouseId ? await fetchWarehouseLocatorIds(warehouseId) : null;

      skipRef.current = 0;
      const { items, nextSkip, serverExhausted } = await fetchFilledPage(query, 0, locatorIdsRef.current);
      skipRef.current = nextSkip;
      setProducts(items);
      setHasMore(!serverExhausted);
      return true;
    } catch (err) {
      console.error('[useProductSearch] fetchProducts error:', err);
      setProducts([]);
      setHasMore(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchWarehouseLocatorIds, fetchFilledPage]);

  // ── loadMore: dipanggil sentinel infinite scroll ────────────────────────────
  const loadMore = useCallback(async () => {
    const { query } = lastParamsRef.current;

    setLoadingMore(true);
    try {
      const { items, nextSkip, serverExhausted } = await fetchFilledPage(query, skipRef.current, locatorIdsRef.current);
      skipRef.current = nextSkip;
      setProducts(prev => [...prev, ...items]);
      setHasMore(!serverExhausted);
    } catch (err) {
      console.error('[useProductSearch] loadMore error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchFilledPage]);

  // ── searchByUPC: exact match, tanpa debounce, tidak terpengaruh pagination ──
  const searchByUPC = useCallback(async (upc) => {
    if (!upc) return null;
    try {
      setLoading(true);
      const safeUPC = upc.trim().replace(/'/g, "''");

      const productData = await idempiereApi(`/models/m_product?$select=M_Product_ID,Name,Value,UPC,C_UOM_ID,Description&$filter=IsPurchased eq true and IsActive eq true and UPC eq '${safeUPC}'&$top=1`);
      const rawProducts = Array.isArray(productData.records) ? productData.records : [];
      if (rawProducts.length === 0) return null;

      const targetProductId = fkId(rawProducts[0].M_Product_ID) ?? rawProducts[0].id;

      const [productPoData, uomConvData] = await Promise.all([
        idempiereApi(`/models/m_product_po?$select=M_Product_ID,C_BPartner_ID,IsCurrentVendor&$filter=IsActive eq true and IsCurrentVendor eq true and M_Product_ID eq ${targetProductId}`),
        idempiereApi(`/models/c_uom_conversion?$select=C_UOM_Conversion_ID,M_Product_ID,C_UOM_ID,C_UOM_To_ID,MultiplyRate,DivideRate&$filter=IsActive eq true and M_Product_ID eq ${targetProductId}`),
      ]);

      const poRecords  = Array.isArray(productPoData.records) ? productPoData.records : [];
      const uomRecords = Array.isArray(uomConvData.records)   ? uomConvData.records   : [];

      const results = buildProducts(rawProducts, poRecords, uomRecords);
      return results[0] ?? null;
    } catch (err) {
      console.error('[useProductSearch] searchByUPC error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [buildProducts]);

  const search = useCallback((query, warehouseId = null) => {
    setSearchValue(query);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchProducts(query, warehouseId), debounceMs);
  }, [fetchProducts, debounceMs]);

  const searchImmediate = useCallback((query, warehouseId = null) => {
    clearTimeout(debounceRef.current);
    setSearchValue(query);
    return fetchProducts(query, warehouseId);
  }, [fetchProducts]);

  return {
    products, loading, loadingMore, hasMore,
    searchValue, setSearchValue,
    fetchProducts,
    loadMore,
    search,
    searchImmediate,
    searchByUPC,
  };
}