import { useState, useEffect, useCallback } from 'react';
import { idempiereApi, fkId } from '@/api/idempiereApi';
import { getLoginInfo } from '@/shared/hooks/useLoginInfo';

// ─────────────────────────────────────────────────────────────────────────────
// useWindowAccess.js
// Fetch daftar AD_Window_Access untuk role aktif (dari sesi login), lalu
// bentuk menjadi Map<AD_Window_ID, { isReadWrite, isActive }> agar pengecekan
// O(1) di komponen lain (Sidebar, ProtectedRoute, tombol aksi).
//
// AD_Window_Access adalah child table dari AD_Role — field pentingnya:
//   AD_Role_ID, AD_Window_ID, IsReadWrite, IsActive
//
// Catatan: hanya window yang EXPLICIT terdaftar di AD_Window_Access untuk role
// tsb yang akan punya entry. Window yang tidak terdaftar = role TIDAK punya
// akses (default deny), sesuai perilaku iDempiere standar.
//
// Paging: bxservice membatasi jumlah baris per request (100) dan mengabaikan
// $top yang lebih besar. Role dengan akses > 100 window akan terpotong jika
// hanya mengambil satu halaman, sehingga window di luar 100 baris pertama
// salah terbaca "tidak punya akses". Karena itu data diambil halaman demi
// halaman dengan $skip sampai semua baris (row-count) terambil.
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 100;
const MAX_PAGES = 50; // pengaman agar tidak loop tanpa akhir (maks 5.000 baris)

async function fetchAllWindowAccess(roleId) {
  const records = [];
  let skip = 0;
  let total = Infinity;

  for (let page = 0; page < MAX_PAGES && skip < total; page++) {
    const res = await idempiereApi(
      `/models/ad_window_access` +
      `?$select=AD_Window_ID,IsReadWrite,IsActive` +
      `&$filter=AD_Role_ID eq ${roleId} and IsActive eq true` +
      `&$orderby=AD_Window_ID` +
      `&$top=${PAGE_SIZE}&$skip=${skip}`
    );

    const batch = Array.isArray(res.records) ? res.records : [];
    if (batch.length === 0) break;

    records.push(...batch);
    skip += batch.length;
    total = typeof res['row-count'] === 'number' ? res['row-count'] : skip;
  }

  return records;
}

export function useWindowAccess() {
  const [accessMap, setAccessMap] = useState(null); // null = belum dimuat
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { roleId } = getLoginInfo();
      if (!roleId) {
        setAccessMap(new Map());
        return;
      }

      const records = await fetchAllWindowAccess(roleId);

      const map = new Map();
      records.forEach(r => {
        const winId = fkId(r.AD_Window_ID);
        if (winId == null) return;
        map.set(winId, {
          isReadWrite: !!r.IsReadWrite,
          isActive: !!r.IsActive,
        });
      });

      setAccessMap(map);
    } catch (err) {
      setError(err.message);
      // Gagal load = fail-closed: anggap tidak ada akses sama sekali,
      // lebih aman daripada fail-open (yang bisa membocorkan akses).
      setAccessMap(new Map());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { accessMap, loading, error, reload: load };
}