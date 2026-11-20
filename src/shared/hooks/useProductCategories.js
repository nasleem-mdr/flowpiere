// src/shared/hooks/useProductCategories.js
// Daftar kategori produk aktif (M_Product_Category) untuk chip filter di bawah input search.
// Dimuat sekali saat komponen mount (dengan paging, karena server membatasi ±100 record/halaman).
import { useState, useEffect } from 'react';
import { idempiereApi, fkId } from '@/api/idempiereApi';

const PAGE_SIZE = 100;
const MAX_PAGES = 20; // pengaman

export function useProductCategories() {
  const [categories, setCategories] = useState([]); // [{ id: number, name: string }]
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const all = [];
        let skip = 0;
        for (let i = 0; i < MAX_PAGES; i++) {
          const res = await idempiereApi(
            `/models/m_product_category` +
            `?$filter=IsActive eq true` +
            `&$select=M_Product_Category_ID,Name` +
            `&$orderby=Name&$top=${PAGE_SIZE}&$skip=${skip}`
          );
          const page = Array.isArray(res.records) ? res.records : [];
          if (page.length === 0) break;
          all.push(...page);
          skip += page.length;
          const total = res['row-count'];
          if (typeof total === 'number' && skip >= total) break;
        }
        if (cancelled) return;
        setCategories(
          all
            .map((r) => ({ id: Number(r.id ?? fkId(r.M_Product_Category_ID)), name: r.Name }))
            .filter((c) => Number.isFinite(c.id) && c.name)
        );
      } catch (err) {
        console.error('Gagal memuat kategori produk:', err.message);
        if (!cancelled) setCategories([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return { categories, loading };
}

export default useProductCategories;
