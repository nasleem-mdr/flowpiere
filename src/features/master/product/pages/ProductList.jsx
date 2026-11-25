/** src/features/master/product/pages/ProductList.jsx
* ─────────────────────────────────────────────────────────────────────────
* Pages ini bertugas untuk menampilkan daftar Product/Service, disediakan
* tombol untuk mengedit dan mengunduh file dalam format pdf.
* ─────────────────────────────────────────────────────────────────────────
*/
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, Link } from "react-router-dom";

import { BoxIcon } from "@/shared/components/icon";
import { PageHeader, DataTable } from '@/shared/components/setup';

import { idempiereApi, getFirstProductImageBlobUrl } from '@/api/idempiereApi';
import { useOrgInfo } from '@/shared/hooks/useOrgInfo';
import { generateProductPDF } from '../utils/generateProductPDF';
import ProductMobileList from '../components/ProductMobileList';
import '@/App.css';

// Kolom yang boleh diurutkan. Nilai ?sort= di URL masuk ke $orderby, jadi WAJIB di-whitelist.
const SORTABLE_FIELDS = ['Value', 'Name'];

const thumbBoxStyle = {
  width: 44, height: 44, borderRadius: 6, overflow: 'hidden',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};

// Layar sempit (< 768px) memakai daftar kartu (ProductMobileList) alih-alih tabel.
const MOBILE_QUERY = '(max-width: 767px)';
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

const mobileStyles = {
  // maxWidth ikut lebar layar: kartu tidak pernah lebih lebar dari viewport
  page: {
    boxSizing: 'border-box', width: '100%', maxWidth: 'calc(100vw - 24px)', minWidth: 0,
    margin: '0 auto', padding: '14px 12px', background: '#fff', borderRadius: 12,
  },
  titleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  title: { margin: 0, fontSize: 18, color: '#1a1a2e' },
  newBtn: {
    color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6,
    backgroundColor: '#2e7d32', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap',
  },
  search: {
    boxSizing: 'border-box', width: '100%', padding: '10px 12px', fontSize: 14,
    border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 10,
  },
  toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 },
  chip: { padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 999, fontSize: 12.5, background: '#f8fafc' },
};

function ProductList() {
  // ─── Posisi (offset) & kata kunci pencarian disimpan di URL query string,
  // BUKAN di useState biasa — supaya saat komponen ini unmount (pindah ke
  // halaman detail/edit) lalu balik lagi via navigate(-1)/tombol Back,
  // posisi halaman & filter yang terakhir dibuka tidak hilang.
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const search = searchParams.get("q") || "";

  // ─── Filter kategori (multi-select) juga disimpan di URL, format:
  // ?cat=123,456,789 — supaya konsisten dengan pola offset & search di atas
  // (tidak hilang saat back-navigation) dan bisa di-share sebagai link.
  const catParam = searchParams.get("cat") || "";
  const selectedCategories = catParam ? catParam.split(",").filter(Boolean) : [];
  const selectedCategoriesKey = selectedCategories.slice().sort().join(",");

  // ─── Pengurutan (Search Key / Product Name) juga disimpan di URL: ?sort=Name&dir=desc
  const sortParam = searchParams.get("sort") || "";
  const sortKey = SORTABLE_FIELDS.includes(sortParam) ? sortParam : "";   // "" = urutan bawaan server
  const sortDir = searchParams.get("dir") === "desc" ? "desc" : "asc";

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);   // loading nambah data
  const [hasMore, setHasMore] = useState(true);

  const pageSize = 10;
  const [totalRecords, setTotalRecords] = useState(0);
  const [downloadingId, setDownloadingId] = useState(null);
  const { orgInfo } = useOrgInfo();   // logo organisasi untuk header PDF
  const [thumbnails, setThumbnails] = useState({});
  const thumbUrlsRef = useRef([]);
  const thumbCacheRef = useRef(new Map());   // id produk → blob URL | null (hanya muat yang belum ada)
  const reqIdRef = useRef(0);                // hasil request lama (kalah cepat) dibuang

  // ─── State untuk daftar kategori (untuk dropdown filter) ───────────────
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef(null);

  // id kategori → nama, dipakai kolom Category di tabel (daftar ini sudah dimuat untuk dropdown filter)
  const categoryNameById = useMemo(
    () => new Map(categoryOptions.map((c) => [Number(c.id ?? c.M_Product_Category_ID), c.Name])),
    [categoryOptions]
  );

  // Fetch daftar kategori sekali saat mount
  useEffect(() => {
    let cancelled = false;
    const loadCategories = async () => {
      setCategoryLoading(true);
      try {
        const data = await idempiereApi(
          `/models/m_product_category?$select=Name&$orderby=Name&$top=200`
        );
        if (!cancelled) setCategoryOptions(data.records || []);
      } catch (err) {
        console.error("Fetch Category Error:", err.message);
        if (!cancelled) setCategoryOptions([]);
      } finally {
        if (!cancelled) setCategoryLoading(false);
      }
    };
    loadCategories();
    return () => { cancelled = true; };
  }, []);

  // Tutup dropdown kategori saat klik di luar area-nya
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
        setCategoryDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  // Thumbnail dimuat INKREMENTAL: hanya produk yang belum pernah dimuat. Penting untuk daftar mobile
  // yang terus bertambah (infinite scroll) — tanpa ini semua gambar diminta ulang di setiap append.
  useEffect(() => {
    const cache = thumbCacheRef.current;
    const missing = products
      .map((p) => p.id ?? p.M_Product_ID)
      .filter((pid) => !cache.has(pid));

    if (missing.length === 0) {
      setThumbnails(Object.fromEntries(cache));
      return;
    }

    (async () => {
      const entries = await Promise.all(
        missing.map(async (pid) => {
          try {
            const url = await getFirstProductImageBlobUrl(pid);
            if (url) thumbUrlsRef.current.push(url);
            return [pid, url || null];
          } catch {
            return [pid, null];
          }
        })
      );
      entries.forEach(([pid, url]) => cache.set(pid, url));
      setThumbnails(Object.fromEntries(cache));
    })();
  }, [products]);

  useEffect(() => {
    return () => {
      thumbUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
    };
  }, []);

  // Klik pertama = A→Z (asc), klik berikutnya pada kolom yang sama membalik asc ⇄ desc.
  // Ganti kolom → mulai lagi dari asc. Offset selalu kembali ke 0.
  const handleSort = useCallback((field) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      const curKey = p.get("sort");
      const curDir = p.get("dir") === "desc" ? "desc" : "asc";
      p.set("sort", field);
      p.set("dir", curKey === field && curDir === "asc" ? "desc" : "asc");
      p.set("offset", "0");
      return p;
    });
  }, [setSearchParams]);

  // Label header kolom berupa tombol pengurutan: ⇅ (belum aktif), ▲ (A→Z), ▼ (Z→A)
  const sortLabel = (label, field) => {
    const active = sortKey === field;
    const nextDir = active && sortDir === "asc" ? "Z→A" : "A→Z";
    return (
      <button
        type="button"
        onClick={() => handleSort(field)}
        title={`Urutkan ${label} ${nextDir}`}
        style={{
          background: 'none', border: 'none', padding: 0, margin: 0,
          font: 'inherit', color: 'inherit', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
        }}
      >
        {label}
        <span style={{ fontSize: 11, opacity: active ? 1 : 0.35 }}>
          {active ? (sortDir === "asc" ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    );
  };

  const columns = [
    { key: 'Thumbnail', label: '' },
    { key: 'Value', label: sortLabel('Search Key', 'Value') },
    { key: 'Name', label: sortLabel('Product Name', 'Name') },
    { key: 'Category', label: 'Category' },
    { key: 'UPC', label: 'UPC/EAN' },
  ];

  const fetchProduct = useCallback(async (currentOffset, mode) => {
    // mode: 'replace' (desktop pagination / reset filter) atau 'append' (mobile infinite scroll)
    const reqId = ++reqIdRef.current;
    mode === "append" ? setLoadingMore(true) : setLoading(true);

    try {
      const fields = 'Name,Value,Description,IsPurchased,IsSold,UPC,M_Product_Category_ID';
      let url = `/models/m_product?$select=${fields}&$top=${pageSize}&$skip=${currentOffset}`;

      const filterParts = [];
      if (search) {
        filterParts.push(`contains(tolower(Name),'${search.toLowerCase().replace(/'/g, "''")}')`);
      }
      if (selectedCategoriesKey) {
        const ids = selectedCategoriesKey.split(",");
        const catFilter = ids.map(id => `M_Product_Category_ID eq ${id}`).join(" or ");
        filterParts.push(ids.length > 1 ? `(${catFilter})` : catFilter);
      }
      if (filterParts.length > 0) {
        url += `&$filter=${filterParts.join(" and ")}`;
      }
      if (sortKey) {
        // Nama bisa kembar → Value sebagai pembeda supaya paging ($skip) tetap stabil
        url += `&$orderby=${sortKey} ${sortDir}` + (sortKey === 'Name' ? `,Value ${sortDir}` : '');
      }

      const data = await idempiereApi(url);
      if (reqId !== reqIdRef.current) return; // sudah digantikan request yang lebih baru
      const newRecords = data.records || [];

      setProducts(prev => mode === "append" ? [...prev, ...newRecords] : newRecords);
      setTotalRecords(data['row-count'] ?? 0);
      setHasMore(newRecords.length === pageSize);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      console.error("Fetch Error:", err.message);
      if (mode !== "append") {
        setProducts([]);
        setTotalRecords(0);
      }
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selectedCategoriesKey, sortKey, sortDir]); // ⬅️ offset tidak masuk deps karena selalu dikirim via parameter

  // ─── Fetch data setiap kali offset, search, ATAU kategori (dari URL) berubah ───
  useEffect(() => {
    fetchProduct(offset, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchProduct, offset]);

  // Dipanggil onPageChange dari DataTable (desktop)
  const handlePageChange = useCallback((newOffset) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("offset", newOffset);
      return p;
    });
  }, [setSearchParams]);

  // Dipanggil sentinel infinite scroll (mobile)
  const loadMore = useCallback(() => {
    const nextOffset = offset + pageSize;
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("offset", nextOffset);
        return p;
      },
      { replace: true } // replace biar tidak numpuk history tiap scroll
    );
    fetchProduct(nextOffset, "append");
  }, [offset, setSearchParams, fetchProduct]);

  // Dipanggil dari PageHeader saat user mengetik pencarian baru —
  // search baru selalu mulai dari offset 0. Kategori yang sedang aktif dipertahankan.
  const handleSearchChange = useCallback((val) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("q", val);
      p.set("offset", "0");
      return p;
    });
  }, [setSearchParams]);

  // Toggle satu kategori di dalam filter multi-select — offset direset ke 0
  const handleCategoryToggle = useCallback((categoryId) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      const current = (p.get("cat") || "").split(",").filter(Boolean);
      const idStr = String(categoryId);
      const next = current.includes(idStr)
        ? current.filter((id) => id !== idStr)
        : [...current, idStr];

      if (next.length > 0) {
        p.set("cat", next.join(","));
      } else {
        p.delete("cat");
      }
      p.set("offset", "0");
      return p;
    });
  }, [setSearchParams]);

  const handleClearCategories = useCallback(() => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete("cat");
      p.set("offset", "0");
      return p;
    });
  }, [setSearchParams]);

  // Mobile: tambah halaman berikutnya TANPA mengubah ?offset= di URL. (loadMore di atas mengubah
  // offset → efek 'replace' ikut jalan dan menimpa daftar dengan halaman baru saja.)
  // Offset = jumlah item yang sudah tampil (diambil dari closure render yang sama dengan sentinel,
  // bukan dari ref yang diperbarui di efek — efek anak berjalan SEBELUM efek induk).
  const loadMoreMobile = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    fetchProduct(products.length, "append");
  }, [loading, loadingMore, hasMore, fetchProduct, products.length]);

  // Kolom cari mobile (PageHeader tidak dipakai di mobile): debounce lalu masuk ke URL ?q=
  const [mobileSearch, setMobileSearch] = useState(search);
  useEffect(() => { setMobileSearch(search); }, [search]);
  useEffect(() => {
    if (!isMobile || mobileSearch === search) return undefined;
    const t = setTimeout(() => handleSearchChange(mobileSearch), 400);
    return () => clearTimeout(t);
  }, [mobileSearch, search, isMobile, handleSearchChange]);

  const handleDownload = async (item) => {
    const productId = item.id ?? item.M_Product_ID;
    setDownloadingId(productId);
    try {
      await generateProductPDF(productId, { logoUrl: orgInfo?.logoUrl });
    } catch (err) {
      console.error("Gagal generate PDF:", err.message);
      alert("Gagal membuat dokumen PDF.");
    } finally {
      setDownloadingId(null);
    }
  };

  const actionRenderer = (item) => {
    const isEditDisabled = item.IsActive === 'N';
    const isDownloading = downloadingId === (item.id ?? item.M_Product_ID);

    return (
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => !isDownloading && handleDownload(item)}
          disabled={isDownloading}
          className="btn-action-view"
          style={{ cursor: isDownloading ? 'not-allowed' : 'pointer', opacity: isDownloading ? 0.6 : 1 }}
        >
          {isDownloading ? '⏳ ...' : '⬇️ Download'}
        </button>

        <Link
          to={isEditDisabled ? '#' : `/product-detail/edit/${item.id}`}
          style={{ pointerEvents: isEditDisabled ? 'none' : 'auto' }}
        >
          <button
            disabled={isEditDisabled}
            className="btn-action-edit"
            style={{
              color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px',
              opacity: isEditDisabled ? 0.5 : 1,
              cursor: isEditDisabled ? 'not-allowed' : 'pointer',
              backgroundColor: isEditDisabled ? '#6c757d' : '#e0a800'
            }}
          >
            Edit
          </button>
        </Link>
      </div>
    );
  };

  const tableData = products.map((p) => {
    const productId = p.id ?? p.M_Product_ID;
    const url = thumbnails[productId];

    return {
      ...p,
      Category: categoryNameById.get(Number(p.M_Product_Category_ID?.id)) || p.M_Product_Category_ID?.identifier || '-',
      Thumbnail: url ? (
        <div style={{ ...thumbBoxStyle, background: '#f1f5f9' }}>
          <img src={url} alt={p.Name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ) : (
        <div style={{ ...thumbBoxStyle, background: '#1a1a2e', color:'#ffffff'}}>
          <BoxIcon />
        </div>
      ),
    };
  });

  // ─── UI dropdown filter kategori (multi-select) ─────────────────────────
  const categoryFilterUI = (
    <div ref={categoryDropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setCategoryDropdownOpen((v) => !v)}
        style={{
          padding: '8px 14px',
          borderRadius: '4px',
          border: '1px solid #cbd5e1',
          backgroundColor: selectedCategories.length > 0 ? '#e0f2fe' : '#fff',
          cursor: 'pointer',
          fontWeight: 500,
        }}
      >
        Category{selectedCategories.length > 0 ? ` (${selectedCategories.length})` : ''} ▾
      </button>

      {categoryDropdownOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 20,
            minWidth: 220,
            maxHeight: 280,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            padding: '8px',
          }}
        >
          {categoryLoading && <div style={{ padding: '6px 4px', color: '#64748b' }}>Loading...</div>}

          {!categoryLoading && categoryOptions.length === 0 && (
            <div style={{ padding: '6px 4px', color: '#64748b' }}>Tidak ada kategori</div>
          )}

          {!categoryLoading && categoryOptions.map((cat) => {
            const catId = cat.id ?? cat.M_Product_Category_ID;
            const checked = selectedCategories.includes(String(catId));
            return (
              <label
                key={catId}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '6px 4px', cursor: 'pointer', fontSize: '14px',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleCategoryToggle(catId)}
                />
                {cat.Name}
              </label>
            );
          })}

          {selectedCategories.length > 0 && (
            <button
              type="button"
              onClick={handleClearCategories}
              style={{
                marginTop: '6px', width: '100%', padding: '6px',
                border: 'none', borderRadius: '4px', backgroundColor: '#f1f5f9',
                cursor: 'pointer', fontSize: '13px', color: '#334155',
              }}
            >
              Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div style={mobileStyles.page}>
        <div style={mobileStyles.titleRow}>
          <h2 style={mobileStyles.title}>Product / Service</h2>
          <Link to="/product-detail/new">
            <button type="button" style={mobileStyles.newBtn}>+ New</button>
          </Link>
        </div>

        <input
          type="search"
          value={mobileSearch}
          onChange={(e) => setMobileSearch(e.target.value)}
          placeholder="Cari nama produk..."
          style={mobileStyles.search}
        />

        <div style={mobileStyles.toolbar}>
          {categoryFilterUI}
          <span style={{ fontSize: 12, color: '#64748b' }}>Urutkan:</span>
          <span style={mobileStyles.chip}>{sortLabel('Search Key', 'Value')}</span>
          <span style={mobileStyles.chip}>{sortLabel('Product Name', 'Name')}</span>
        </div>

        <ProductMobileList
          items={tableData}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          totalRecords={totalRecords}
          onLoadMore={loadMoreMobile}
          renderActions={actionRenderer}
        />
      </div>
    );
  }

  return (
    <div className="card-container">
      <PageHeader
        title="Product / Service"
        onSearch={handleSearchChange}
        extraAction={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {categoryFilterUI}
            <Link to="/product-detail/new">
              <button
                className="btn-action-edit"
                style={{
                  color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px',
                  backgroundColor: '#2e7d32', cursor: 'pointer', fontWeight: 'bold',
                }}
              >
                + New
              </button>
            </Link>
          </div>
        }
      />
     <DataTable
        columns={columns}
        data={tableData}
        loading={loading}
        offset={offset}
        pageSize={pageSize}
        totalRecords={totalRecords}
        onPageChange={handlePageChange}   // ⬅️ bukan inline setOffset lagi
        renderActions={actionRenderer}
        infiniteScroll={{
          fetchMore: loadMore,
          hasMore,
          loadingMore,
        }}
      />
    </div>
  );
}

export default ProductList;