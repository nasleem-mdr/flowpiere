import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '@/css/Components.css';
import '@/css/Header.css';
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { HomeIcon, SearchIcon2, SearchIcon } from '@/shared/components/icon';

// filters: [{ value: 'ALL', label: 'Semua' }, { value: 'DR', label: 'Draft' }, ...]
// activeFilter / onFilterChange: controlled dari parent. Kalau `filters` tidak
// diberikan, baris tab filter tidak ditampilkan sama sekali (backward-compatible
// untuk halaman lain yang masih pakai PageHeader tanpa filter).
export default function PageHeader({
  title,
  onSearch,
  extraAction,
  filters,
  activeFilter,
  onFilterChange,
}) {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  const handleSearchChange = (val) => {
    setSearchValue(val);
    onSearch(val);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    if (searchValue) handleSearchChange('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="page-header-container">
        <div className="page-header-left">
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: 'rgb(99 102 241)',
              borderRadius: RADIUS.sm, padding: '6px 10px', cursor: 'pointer',
              fontSize: '13px', fontWeight: 600, WebkitTapHighlightColor: 'transparent',
              flexShrink: 0,
            }}
          ><HomeIcon size={24} className='home-color'/>
          </button>

          {/* Judul disembunyikan saat search terbuka di layar sempit, supaya
              input pencarian punya ruang penuh (mirip pola search Shopee). */}
          {!searchOpen && <h2 className="page-header-title">{title}</h2>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: searchOpen ? 1 : 'initial', minWidth: 0 }}>
          {searchOpen ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px', flex: 1,
              background: COLOR?.bg || '#f3f4f6', border: `1.5px solid ${COLOR?.border || '#e5e7eb'}`,
              borderRadius: RADIUS?.md || '8px', padding: '4px 6px 4px 12px', minWidth: 0,
            }}>
              <span style={{ color: COLOR?.textLt || '#9ca3af', flexShrink: 0, display: 'flex' }}><SearchIcon size={16} /></span>
              <input
                ref={inputRef}
                type="text"
                value={searchValue}
                placeholder={`Cari ${title}...`}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
                className="page-header-search"
                style={{
                  flex: 1, minWidth: 0, border: 'none', background: 'transparent',
                  padding: '6px 0', fontSize: '14px', outline: 'none', color: COLOR?.textDk || '#111827',
                }}
              />
              <button
                onClick={closeSearch}
                title="Tutup pencarian"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
                  color: COLOR?.textLt || '#9ca3af', fontSize: '16px', padding: '2px 4px',
                  display: 'flex', alignItems: 'center',
                }}
              >✕</button>
            </div>
          ) : (
            <>
              {extraAction}
              <button
                onClick={() => setSearchOpen(true)}
                title="Cari"
                style={{
                  background: COLOR?.bg || '#f3f4f6', border: `1.5px solid ${COLOR?.border || '#e5e7eb'}`,
                  color: COLOR?.textMd || '#4b5563', borderRadius: RADIUS?.md || '8px',
                  width: '36px', height: '36px', cursor: 'pointer', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  WebkitTapHighlightColor: 'transparent',
                }}
              ><SearchIcon2 /></button>
            </>
          )}
        </div>
      </div>

      {/* Filter tab ala Shopee: Semua / Draft / Diproses / Ditolak / Selesai —
          scrollable horizontal di layar sempit supaya tidak wrap berantakan. */}
      {filters && filters.length > 0 && (
        <div style={{
          display: 'flex', gap: '4px', padding: '0 16px 10px',
          overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
        }}>
          {filters.map((f) => {
            const isActive = activeFilter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => onFilterChange?.(f.value)}
                style={{
                  flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
                  padding: '8px 4px', fontSize: '13.5px', whiteSpace: 'nowrap',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? (COLOR?.primary || '#1976d2') : (COLOR?.textMd || '#6b7280'),
                  borderBottom: isActive ? `2.5px solid ${COLOR?.primary || '#1976d2'}` : '2.5px solid transparent',
                  marginRight: '14px', WebkitTapHighlightColor: 'transparent',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
