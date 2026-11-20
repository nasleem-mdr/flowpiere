// src/shared/components/ProductCategoryBar.jsx
// Baris chip kategori produk, ditaruh tepat di bawah input search.
// Filter kategori hanya berlaku saat BROWSING (kolom search kosong). Selama ada pencarian
// aktif, chip dinonaktifkan dan pencarian/scan tetap mencari di SEMUA kategori.
import React from 'react';
import { COLOR } from '@/utils/styleTokens';

const chipStyle = (active, disabled) => ({
  flexShrink: 0,
  whiteSpace: 'nowrap',
  padding: '5px 12px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: active ? 700 : 500,
  border: `1px solid ${active ? COLOR.primary : COLOR.border}`,
  background: active ? COLOR.primary : COLOR.bg,
  color: active ? '#fff' : COLOR.textMd,
  cursor: disabled ? 'default' : 'pointer',
  WebkitTapHighlightColor: 'transparent',
});

export default function ProductCategoryBar({
  categories = [],
  selectedId = null,   // null = Semua
  onSelect,            // (id | null) => void
  loading = false,
  searching = false,   // true = ada pencarian aktif → chip dinonaktifkan
}) {
  if (!loading && categories.length === 0) return null;

  return (
    <div style={{
      padding: '8px 50px 8px 30px', background: COLOR.surface,
      borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0,
    }}>
      <div
        role="group"
        aria-label="Kategori produk"
        style={{
          display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px',
          scrollbarWidth: 'thin', opacity: searching ? 0.45 : 1,
        }}
      >
        {loading ? (
          <span style={{ fontSize: '12px', color: COLOR.textLt }}>Memuat kategori...</span>
        ) : (
          <>
            <button
              type="button"
              disabled={searching}
              aria-pressed={selectedId == null}
              onClick={() => onSelect?.(null)}
              style={chipStyle(selectedId == null, searching)}
            >
              Semua
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={searching}
                aria-pressed={selectedId === c.id}
                onClick={() => onSelect?.(selectedId === c.id ? null : c.id)} // klik lagi = lepas filter
                style={chipStyle(selectedId === c.id, searching)}
                title={c.name}
              >
                {c.name}
              </button>
            ))}
          </>
        )}
      </div>

      {searching && (
        <div style={{ fontSize: '11px', color: COLOR.textLt, marginTop: '4px' }}>
          Pencarian & scan mencari di semua kategori. Hapus kata kunci untuk kembali ke filter kategori.
        </div>
      )}
    </div>
  );
}
