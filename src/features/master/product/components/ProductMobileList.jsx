// src/features/master/product/components/ProductMobileList.jsx
// Daftar produk versi mobile: satu kartu per produk (thumbnail, nama, search key, kategori, UPC, aksi)
// + infinite scroll. Presentational — data & aksi datang dari ProductList. Tidak memakai DataTable,
// jadi lebarnya selalu mengikuti layar dan teks panjang otomatis turun baris.
import React, { useEffect, useRef } from 'react';

const msgStyle = { textAlign: 'center', padding: '28px 0', color: '#94a3b8', fontSize: 13, margin: 0 };

const cardStyle = {
  boxSizing: 'border-box', width: '100%', minWidth: 0,
  border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginBottom: 10,
  background: '#fff', boxShadow: '0 1px 2px rgba(15,23,42,.05)',
};
const nameStyle = {
  fontWeight: 700, fontSize: 14, color: '#0f172a', lineHeight: 1.3,
  overflowWrap: 'anywhere', wordBreak: 'break-word',
};
const keyStyle = { fontSize: 12, color: '#64748b', marginTop: 2, overflowWrap: 'anywhere' };
const metaRow = {
  display: 'flex', gap: 8, fontSize: 12.5, padding: '6px 0',
  borderTop: '1px solid #f1f5f9',
};
const metaLabel = { flex: '0 0 84px', color: '#64748b', fontWeight: 600 };
const metaValue = { flex: 1, minWidth: 0, color: '#0f172a', overflowWrap: 'anywhere' };

const show = (v) => (v === undefined || v === null || v === '' ? '-' : v);

export default function ProductMobileList({
  items = [],          // baris dari ProductList: { id, Name, Value, UPC, Category, Thumbnail(JSX), ... }
  loading = false,
  loadingMore = false,
  hasMore = false,
  totalRecords = 0,
  onLoadMore,          // () => void — dipanggil sentinel saat mendekati dasar daftar
  renderActions,       // (item) => JSX
}) {
  const sentinelRef = useRef(null);

  // Observer dibuat ulang tiap jumlah item berubah → kalau sentinel masih terlihat setelah
  // data ditambahkan (layar tinggi), halaman berikutnya tetap dimuat.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!hasMore || !el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !loading && !loadingMore) onLoadMore?.(); },
      { rootMargin: '300px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, loadingMore, onLoadMore, items.length]);

  if (loading && items.length === 0) return <p style={msgStyle}>⏳ Memuat produk...</p>;
  if (items.length === 0) return <p style={msgStyle}>Tidak ada produk ditemukan.</p>;

  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      {totalRecords > 0 && (
        <div style={{ fontSize: 12, color: '#64748b', margin: '2px 2px 8px' }}>{totalRecords} produk</div>
      )}

      {items.map((item) => {
        const id = item.id ?? item.M_Product_ID;
        return (
          <div key={id} style={cardStyle}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ flexShrink: 0 }}>{item.Thumbnail}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={nameStyle}>{show(item.Name)}</div>
                <div style={keyStyle}>{show(item.Value)}</div>
              </div>
            </div>

            <div style={metaRow}>
              <span style={metaLabel}>Category</span>
              <span style={metaValue}>{show(item.Category)}</span>
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>UPC/EAN</span>
              <span style={metaValue}>{show(item.UPC)}</span>
            </div>

            {renderActions && (
              <div style={{ marginTop: 8, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                {renderActions(item)}
              </div>
            )}
          </div>
        );
      })}

      {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
      {loadingMore && <p style={msgStyle}>Memuat lagi...</p>}
      {!hasMore && <p style={{ ...msgStyle, color: '#c1c1c1', fontSize: 12 }}>— Semua produk sudah dimuat —</p>}
    </div>
  );
}