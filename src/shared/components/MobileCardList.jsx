// src/shared/components/MobileCardList.jsx
// Daftar kartu generik untuk layar mobile + infinite scroll. Presentational: data, isi kartu, dan aksi
// diberikan oleh halaman. Tidak memakai DataTable, jadi lebarnya selalu mengikuti layar dan teks
// panjang otomatis turun baris.
//
//   <MobileCardList
//     items={rows}
//     renderHeader={(it) => <>…judul kartu…</>}
//     getRows={(it) => [{ label: 'Tax ID', value: it.TaxID }]}
//     renderActions={(it) => <button>Edit</button>}
//     loading loadingMore hasMore totalRecords onLoadMore
//   />
import React, { useEffect, useRef } from 'react';

const msgStyle = { textAlign: 'center', padding: '28px 0', color: '#94a3b8', fontSize: 13, margin: 0 };
const cardStyle = {
  boxSizing: 'border-box', width: '100%', minWidth: 0,
  border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginBottom: 10,
  background: '#fff', boxShadow: '0 1px 2px rgba(15,23,42,.05)',
};
const metaRow = { display: 'flex', gap: 8, fontSize: 12.5, padding: '6px 0', borderTop: '1px solid #f1f5f9' };
const metaLabel = { flex: '0 0 92px', color: '#64748b', fontWeight: 600 };
const metaValue = { flex: 1, minWidth: 0, color: '#0f172a', overflowWrap: 'anywhere' };

const show = (v) => (v === undefined || v === null || v === '' ? '-' : v);

export default function MobileCardList({
  items = [],
  getKey = (item) => item.id,
  renderHeader,          // (item) => JSX — bagian atas kartu (judul, badge, dll.)
  getRows,               // (item) => [{ label, value }]
  renderActions,         // (item) => JSX
  loading = false,
  loadingMore = false,
  hasMore = false,
  totalRecords = 0,
  totalLabel = 'data',
  emptyText = 'Tidak ada data ditemukan.',
  onLoadMore,            // () => void — dipanggil sentinel saat mendekati dasar daftar
}) {
  const sentinelRef = useRef(null);

  // Observer dibuat ulang tiap jumlah item berubah → kalau sentinel masih terlihat setelah data
  // ditambahkan (layar tinggi), halaman berikutnya tetap dimuat.
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

  if (loading && items.length === 0) return <p style={msgStyle}>⏳ Memuat...</p>;
  if (items.length === 0) return <p style={msgStyle}>{emptyText}</p>;

  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      {totalRecords > 0 && (
        <div style={{ fontSize: 12, color: '#64748b', margin: '2px 2px 8px' }}>
          {totalRecords} {totalLabel}
        </div>
      )}

      {items.map((item, idx) => (
        <div key={getKey(item) ?? idx} style={cardStyle}>
          <div style={{ marginBottom: 8 }}>{renderHeader?.(item)}</div>

          {(getRows?.(item) || []).map((row) => (
            <div key={row.label} style={metaRow}>
              <span style={metaLabel}>{row.label}</span>
              <span style={metaValue}>{show(row.value)}</span>
            </div>
          ))}

          {renderActions && (
            <div style={{ marginTop: 8, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
              {renderActions(item)}
            </div>
          )}
        </div>
      ))}

      {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
      {loadingMore && <p style={msgStyle}>Memuat lagi...</p>}
      {!hasMore && <p style={{ ...msgStyle, color: '#c1c1c1', fontSize: 12 }}>— Semua data sudah dimuat —</p>}
    </div>
  );
}