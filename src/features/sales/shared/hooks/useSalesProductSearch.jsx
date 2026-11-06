import { useState, useCallback, useRef, useEffect } from 'react';
import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';

const PAGE_SIZE = 20;
const NO_WH_TOP = PAGE_SIZE;
const WH_POOL_CAP = 150;

export function useSalesProductSearch({ debounceMs = 420 } = {}) {
  const [products, setProducts]       = useState([]);
  const [loading, setLoading]         = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const debounceRef = useRef(null);

  // ← tambahan priceListVersionId di params yang diingat untuk loadMore
  const lastParamsRef = useRef({ query: '', warehouseId: null, priceListVersionId: null });
  const skipRef        = useRef(0);
  const poolRef         = useRef([]);
  const visibleCountRef = useRef(PAGE_SIZE);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  // ── BARU: fetch harga dari M_ProductPrice untuk sekumpulan product IDs ──
  // Filter pakai M_PriceList_Version_ID (bukan M_PriceList_ID langsung),
  // karena harga sebenarnya nempel di level Version — pola sama seperti
  // useProductVendorInfo di sisi Purchasing tapi sumbernya M_ProductPrice,
  // bukan M_Product_PO.
  const fetchPriceMap = useCallback(async (productIds, priceListVersionId) => {
    const priceMap = new Map();
    if (!priceListVersionId || productIds.length === 0) return priceMap;

    // chunk biar filter OR tidak kepanjangan (sama pola CHUNK_SIZE storage/uom)
    const CHUNK_SIZE = 40;
    const chunks = [];
    for (let i = 0; i < productIds.length; i += CHUNK_SIZE) {
      chunks.push(productIds.slice(i, i + CHUNK_SIZE));
    }

    const chunkResults = await Promise.all(
      chunks.map(chunk => {
        const idFilter = chunk.map(id => `M_Product_ID eq ${id}`).join(' or ');
        return idempiereApi(
          `/models/m_productprice?$select=M_Product_ID,PriceStd,PriceList,PriceLimit` +
          `&$filter=M_PriceList_Version_ID eq ${priceListVersionId} and IsActive eq true and (${idFilter})`
        ).catch(err => {
          console.warn('[useSalesProductSearch] fetchPriceMap chunk error:', err);
          return { records: [] };
        });
      })
    );

    chunkResults.forEach(data => {
      const records = Array.isArray(data.records) ? data.records : [];
      records.forEach(r => {
        const pid = fkId(r.M_Product_ID);
        if (!pid) return;
        priceMap.set(pid, {
          PriceStd:  parseFloat(r.PriceStd  || 0),
          PriceList: parseFloat(r.PriceList || 0),
        });
      });
    });

    return priceMap;
  }, []);

  // ── buildProducts: terima priceMap opsional, isi Price/PriceActual ──────
  const buildProducts = useCallback((rawProducts, uomRecords, qtyMap = new Map(), priceMap = new Map()) => {
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

    return rawProducts.map(p => {
      const pid       = fkId(p.M_Product_ID) ?? p.id;
      const baseUomId = fkId(p.C_UOM_ID);
      const baseUom   = { C_UOM_ID: baseUomId, Name: fkLabel(p.C_UOM_ID) || 'EA', multiplyRate: 1 };
      const convUoms  = uomConvMap.get(pid) || [];
      const allUoms   = [baseUom, ...convUoms.filter(u => u.C_UOM_ID !== baseUomId)];
      const priceInfo = priceMap.get(pid); // undefined kalau customer belum dipilih / tidak ada harga

      return {
        M_Product_ID: pid,
        Name:         p.Name,
        Value:        p.Value,
        UPC:          p.UPC || null,
        C_UOM_ID:     baseUomId,
        C_UOM_Name:   baseUom.Name,
        Description:  p.Description || null,
        uomOptions:   allUoms,
        QtyOnHand:    qtyMap.get(pid) ?? 0,
        // ── BARU: harga dari price list customer (0 kalau tidak ditemukan) ──
        Price:        priceInfo?.PriceStd ?? 0,
        PriceActual:  priceInfo?.PriceStd ?? 0,
        hasPriceListMatch: !!priceInfo, // opsional: buat kasih indikator "harga belum ada di price list" di UI
      };
    });
  }, []);

  const fetchWarehouseLocatorIds = useCallback(async (warehouseId) => {
    if (!warehouseId) return null;
    try {
      const data = await idempiereApi(
        `/models/m_locator?$select=M_Locator_ID&$filter=M_Warehouse_ID eq ${warehouseId} and IsActive eq true&$top=500`
      );
      return (data.records || []).map(r => fkId(r.M_Locator_ID)).filter(Boolean);
    } catch (err) {
      console.warn('[useSalesProductSearch] fetchWarehouseLocatorIds error:', err);
      return null;
    }
  }, []);

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

  // ── enrich: sekarang juga terima priceListVersionId, fetch M_ProductPrice
  // paralel bareng uom-conversion & storage ──────────────────────────────
  const enrichAndSort = useCallback(async (rawProducts, query, safeQ, warehouseId = null, priceListVersionId = null) => {
    if (rawProducts.length === 0) return [];

    const productIds = rawProducts.map(p => fkId(p.M_Product_ID) ?? p.id).filter(Boolean);
    const idScopeFilter = productIds.map(id => `M_Product_ID eq ${id}`).join(' or ');
    let storageFilter = `(${idScopeFilter})`;
    if (warehouseId) {
      storageFilter += ` and M_Locator_ID/M_Warehouse_ID eq ${warehouseId}`;
    }

    const [uomConvData, storageData, priceMap] = await Promise.all([
      idempiereApi(`/models/c_uom_conversion?$select=C_UOM_Conversion_ID,M_Product_ID,C_UOM_ID,C_UOM_To_ID,MultiplyRate,DivideRate&$filter=IsActive eq true and (${idScopeFilter})`),
      idempiereApi(`/models/m_storage?$select=M_Product_ID,QtyOnHand&$filter=${storageFilter}`),
      fetchPriceMap(productIds, priceListVersionId),
    ]);

    const uomRecords = Array.isArray(uomConvData.records) ? uomConvData.records : [];
    const storageRecords = Array.isArray(storageData.records) ? storageData.records : [];

    const qtyMap = new Map();
    storageRecords.forEach(r => {
      const pid = fkId(r.M_Product_ID);
      if (!pid) return;
      qtyMap.set(pid, (qtyMap.get(pid) || 0) + parseFloat(r.QtyOnHand || 0));
    });

    const finalProducts = buildProducts(rawProducts, uomRecords, qtyMap, priceMap);

    return query
      ? [...finalProducts].sort((a, b) => scoreMatch(b, safeQ) - scoreMatch(a, safeQ))
      : finalProducts;
  }, [buildProducts, scoreMatch, fetchPriceMap]);

  // ── path A: tanpa filter warehouse ──────────────────────────────────────
  const fetchNoWarehousePage = useCallback(async (query, skip, priceListVersionId = null) => {
    const safeQ = query.toUpperCase().replace(/'/g, "''");
    let productFilter = 'IsSold eq true and IsActive eq true';
    if (query) {
      productFilter += ` and (contains(toupper(Name),'${safeQ}') or contains(toupper(Value),'${safeQ}') or contains(toupper(UPC),'${safeQ}') or contains(toupper(Description),'${safeQ}'))`;
    }

    const productData = await idempiereApi(
      `/models/m_product?$select=M_Product_ID,Name,Value,UPC,C_UOM_ID,M_Locator_ID,Description,Updated` +
      `&$filter=${productFilter}&$orderby=Updated desc&$top=${NO_WH_TOP}&$skip=${skip}`
    );
    const rawProducts = Array.isArray(productData.records) ? productData.records : [];
    const page = await enrichAndSort(rawProducts, query, safeQ, null, priceListVersionId);
    return { page, rawCount: rawProducts.length };
  }, [enrichAndSort]);

  // ── path B: dengan filter warehouse ─────────────────────────────────────
  const fetchWarehousePool = useCallback(async (query, warehouseId, priceListVersionId = null) => {
    const safeQ = query.toUpperCase().replace(/'/g, "''");
    let productFilter = 'IsSold eq true and IsActive eq true';
    if (query) {
      productFilter += ` and (contains(toupper(Name),'${safeQ}') or contains(toupper(Value),'${safeQ}') or contains(toupper(UPC),'${safeQ}') or contains(toupper(Description),'${safeQ}'))`;
    }

    const locatorIds = await fetchWarehouseLocatorIds(warehouseId);
    if (locatorIds !== null && locatorIds.length === 0) return [];

    if (locatorIds === null) {
      const productData = await idempiereApi(
        `/models/m_product?$select=M_Product_ID,Name,Value,UPC,C_UOM_ID,M_Locator_ID,Description,Updated` +
        `&$filter=${productFilter}&$orderby=Updated desc&$top=${WH_POOL_CAP}`
      );
      const rawProducts = Array.isArray(productData.records) ? productData.records : [];
      return enrichAndSort(rawProducts, query, safeQ, warehouseId, priceListVersionId);
    }

    const CHUNK_SIZE = 15;
    const chunks = [];
    for (let i = 0; i < locatorIds.length; i += CHUNK_SIZE) {
      chunks.push(locatorIds.slice(i, i + CHUNK_SIZE));
    }

    const chunkResults = await Promise.all(
      chunks.map(chunk => {
        const locFilter = chunk.map(id => `M_Locator_ID/id eq ${id}`).join(' or ');
        return idempiereApi(
          `/models/m_product?$select=M_Product_ID,Name,Value,UPC,C_UOM_ID,M_Locator_ID,Description,Updated` +
          `&$filter=${productFilter} and (${locFilter})&$orderby=Updated desc&$top=${WH_POOL_CAP}`
        ).catch(() => ({ records: [] }));
      })
    );

    const seen = new Set();
    const rawProducts = chunkResults
      .flatMap(data => Array.isArray(data.records) ? data.records : [])
      .filter(p => {
        const pid = fkId(p.M_Product_ID) ?? p.id;
        if (seen.has(pid)) return false;
        seen.add(pid);
        return true;
      })
      .slice(0, WH_POOL_CAP);

    return enrichAndSort(rawProducts, query, safeQ, warehouseId, priceListVersionId);
  }, [enrichAndSort, fetchWarehouseLocatorIds]);

  // ── fetchProducts: tambah parameter priceListVersionId ──────────────────
  const fetchProducts = useCallback(async (query = '', warehouseId = null, priceListVersionId = null) => {
    lastParamsRef.current = { query, warehouseId, priceListVersionId };
    setLoading(true);
    try {
      if (warehouseId) {
        const pool = await fetchWarehousePool(query, warehouseId, priceListVersionId);
        poolRef.current = pool;
        visibleCountRef.current = PAGE_SIZE;
        setProducts(pool.slice(0, PAGE_SIZE));
        setHasMore(pool.length > PAGE_SIZE);
      } else {
        skipRef.current = 0;
        const { page, rawCount } = await fetchNoWarehousePage(query, 0, priceListVersionId);
        skipRef.current = rawCount;
        poolRef.current = [];
        setProducts(page);
        setHasMore(rawCount === NO_WH_TOP);
      }
      return true;
    } catch (err) {
      console.error('[useSalesProductSearch] fetchProducts error:', err);
      setProducts([]);
      setHasMore(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchWarehousePool, fetchNoWarehousePage]);

  const loadMore = useCallback(async () => {
    const { query, warehouseId, priceListVersionId } = lastParamsRef.current;

    if (warehouseId) {
      const nextCount = visibleCountRef.current + PAGE_SIZE;
      visibleCountRef.current = nextCount;
      setProducts(poolRef.current.slice(0, nextCount));
      setHasMore(poolRef.current.length > nextCount);
      return;
    }

    setLoadingMore(true);
    try {
      const { page, rawCount } = await fetchNoWarehousePage(query, skipRef.current, priceListVersionId);
      skipRef.current += rawCount;
      setProducts(prev => [...prev, ...page]);
      setHasMore(rawCount === NO_WH_TOP);
    } catch (err) {
      console.error('[useSalesProductSearch] loadMore error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchNoWarehousePage]);

  const searchByUPC = useCallback(async (upc, priceListVersionId = null) => {
    if (!upc) return null;
    try {
      setLoading(true);
      const safeUPC = upc.trim().replace(/'/g, "''");

      const productData = await idempiereApi(`/models/m_product?$select=M_Product_ID,Name,Value,UPC,C_UOM_ID,Description&$filter=IsSold eq true and IsActive eq true and UPC eq '${safeUPC}'&$top=1`);
      const rawProducts = Array.isArray(productData.records) ? productData.records : [];
      if (rawProducts.length === 0) return null;

      const targetProductId = fkId(rawProducts[0].M_Product_ID) ?? rawProducts[0].id;

      const [uomConvData, priceMap] = await Promise.all([
        idempiereApi(`/models/c_uom_conversion?$select=C_UOM_Conversion_ID,M_Product_ID,C_UOM_ID,C_UOM_To_ID,MultiplyRate,DivideRate&$filter=IsActive eq true and M_Product_ID eq ${targetProductId}`),
        fetchPriceMap([targetProductId], priceListVersionId),
      ]);
      const uomRecords = Array.isArray(uomConvData.records) ? uomConvData.records : [];

      const results = buildProducts(rawProducts, uomRecords, new Map(), priceMap);
      return results[0] ?? null;
    } catch (err) {
      console.error('[useSalesProductSearch] searchByUPC error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [buildProducts, fetchPriceMap]);

  const search = useCallback((query, warehouseId = null, priceListVersionId = null) => {
    setSearchValue(query);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchProducts(query, warehouseId, priceListVersionId), debounceMs);
  }, [fetchProducts, debounceMs]);

  const searchImmediate = useCallback((query, warehouseId = null, priceListVersionId = null) => {
    clearTimeout(debounceRef.current);
    setSearchValue(query);
    return fetchProducts(query, warehouseId, priceListVersionId);
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