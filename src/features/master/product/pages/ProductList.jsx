import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link } from "react-router-dom";

import { BoxIcon } from "@/shared/components/icon";
import { PageHeader, DataTable } from '@/shared/components/setup';

import { idempiereApi, getFirstProductImageBlobUrl } from '@/api/idempiereApi';
import { useOrgInfo } from '@/shared/hooks/useOrgInfo';
import { generateProductPDF } from '../utils/generateProductPDF';
import '@/App.css';

const thumbBoxStyle = {
  width: 44, height: 44, borderRadius: 6, overflow: 'hidden',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};

function ProductList() {
  // ─── Posisi (offset) & kata kunci pencarian disimpan di URL query string,
  // BUKAN di useState biasa — supaya saat komponen ini unmount (pindah ke
  // halaman detail/edit) lalu balik lagi via navigate(-1)/tombol Back,
  // posisi halaman & filter yang terakhir dibuka tidak hilang.
  const [searchParams, setSearchParams] = useSearchParams();
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const search = searchParams.get("q") || "";

  // ─── Filter kategori (multi-select) juga disimpan di URL, format:
  // ?cat=123,456,789 — supaya konsisten dengan pola offset & search di atas
  // (tidak hilang saat back-navigation) dan bisa di-share sebagai link.
  const catParam = searchParams.get("cat") || "";
  const selectedCategories = catParam ? catParam.split(",").filter(Boolean) : [];
  const selectedCategoriesKey = selectedCategories.slice().sort().join(",");

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

  // ─── State untuk daftar kategori (untuk dropdown filter) ───────────────
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef(null);

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
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadThumbnails = async () => {
      thumbUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
      thumbUrlsRef.current = [];

      const entries = await Promise.all(
        products.map(async (p) => {
          const productId = p.id ?? p.M_Product_ID;
          try {
            const url = await getFirstProductImageBlobUrl(productId);
            if (url) thumbUrlsRef.current.push(url);
            return [productId, url];
          } catch {
            return [productId, null];
          }
        })
      );

      if (!cancelled) setThumbnails(Object.fromEntries(entries));
    };

    if (products.length > 0) loadThumbnails();
    else setThumbnails({});

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  useEffect(() => {
    return () => {
      thumbUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
    };
  }, []);

  const columns = [
    { key: 'Thumbnail', label: '' },
    { key: 'Value', label: 'Search Key' },
    { key: 'Name', label: 'Partner Name' },
    { key: 'UPC', label: 'UPC/EAN' },
  ];

  const fetchProduct = useCallback(async (currentOffset, mode) => {
    // mode: 'replace' (desktop pagination / reset filter) atau 'append' (mobile infinite scroll)
    mode === "append" ? setLoadingMore(true) : setLoading(true);

    try {
      const fields = 'Name,Value,Description,IsPurchased,IsSold,UPC';
      let url = `/models/m_product?$select=${fields}&$top=${pageSize}&$skip=${currentOffset}`;

      const filterParts = [];
      if (search) {
        filterParts.push(`contains(tolower(Name),'${search.toLowerCase()}')`);
      }
      if (selectedCategoriesKey) {
        const ids = selectedCategoriesKey.split(",");
        const catFilter = ids.map(id => `M_Product_Category_ID eq ${id}`).join(" or ");
        filterParts.push(ids.length > 1 ? `(${catFilter})` : catFilter);
      }
      if (filterParts.length > 0) {
        url += `&$filter=${filterParts.join(" and ")}`;
      }

      const data = await idempiereApi(url);
      const newRecords = data.records || [];

      setProducts(prev => mode === "append" ? [...prev, ...newRecords] : newRecords);
      setTotalRecords(data['row-count'] ?? 0);
      setHasMore(newRecords.length === pageSize);
    } catch (err) {
      console.error("Fetch Error:", err.message);
      if (mode !== "append") {
        setProducts([]);
        setTotalRecords(0);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selectedCategoriesKey]); // ⬅️ offset tidak masuk deps karena selalu dikirim via parameter

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