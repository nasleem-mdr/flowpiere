import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from "react-router-dom";
import { PageHeader, DataTable } from '@/shared/components/setup';
import MobileCardList from '@/shared/components/MobileCardList';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import '@/App.css';

const isYes = (v) => v === true || v === 'Y';
const fmtNumber = (n) =>
  n === undefined || n === null || n === '' ? '-' : Number(n).toLocaleString('id-ID');

const badgeStyle = (bg, color) => ({
  display: 'inline-block', padding: '2px 9px', borderRadius: 999,
  fontSize: 11, fontWeight: 600, background: bg, color,
});

// Layar sempit (< 768px): header sendiri + daftar kartu (DataTable/PageHeader tidak dipakai).
const mobileStyles = {
  // maxWidth ikut lebar layar: kartu tidak pernah lebih lebar dari viewport
  page: {
    boxSizing: 'border-box', width: '100%', maxWidth: 'calc(100vw - 24px)', minWidth: 0,
    margin: '0 auto', padding: '14px 12px', background: '#fff', borderRadius: 12,
  },
  titleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  title: { margin: 0, fontSize: 18, color: '#1a1a2e', minWidth: 0, flex: 1, overflowWrap: 'anywhere' },
  newBtn: {
    color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6,
    backgroundColor: '#2e7d32', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap',
  },
  search: {
    boxSizing: 'border-box', width: '100%', padding: '10px 12px', fontSize: 14,
    border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 12,
  },
};

function BusinessPartner() {
  const isMobile = useIsMobile();

  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const pageSize = 10;
  const [totalRecords, setTotalRecords] = useState(0);
  const [rowCount, setRowCount] = useState(null);   // jumlah asli dari server (null = tidak diketahui)
  const reqIdRef = useRef(0);                       // hasil request lama (kalah cepat) dibuang

  // Konfigurasi Kolom untuk Tabel
  const columns = [
    { key: 'Value', label: 'Search Key' },
    { key: 'Name', label: 'Partner Name' },
    { key: 'TaxID', label: 'Tax ID' },
    { key: 'TotalOpenBalance', label: 'Open balance' }
  ];

  // mode: 'replace' (desktop pagination / filter baru) atau 'append' (mobile infinite scroll)
  const fetchBP = useCallback(async (currentOffset, mode = 'replace') => {
    const currentToken = localStorage.getItem('token');
    if (!currentToken) return;

    const reqId = ++reqIdRef.current;
    mode === 'append' ? setLoadingMore(true) : setLoading(true);
    try {
      // Menentukan kolom spesifik untuk menghemat bandwidth dan mempercepat respons
      const fields = 'Name,Value,Description,IsVendor,IsCustomer,TotalOpenBalance,TaxID';

      let url = `/api/v1/models/c_bpartner?$select=${fields}&$top=${pageSize}&$skip=${currentOffset}`;
      if (search) {
        // tanda kutip di-escape ('') & karakter khusus (&, #) di-encode supaya query tidak rusak
        url += `&$filter=contains(tolower(Name),'${encodeURIComponent(search.toLowerCase().replace(/'/g, "''"))}')`;
      }

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        }
      });

      if (response.status === 401) throw new Error("Unauthorized");
      const data = await response.json();
      if (reqId !== reqIdRef.current) return; // sudah digantikan request yang lebih baru

      const records = data.records || [];
      setPartners((prev) => (mode === 'append' ? [...prev, ...records] : records));
      setTotalRecords(data['row-count'] || data.totalRecords || 100);
      setRowCount(typeof data['row-count'] === 'number' ? data['row-count'] : null);
      setHasMore(records.length === pageSize);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      console.error("Fetch Error:", err.message);
      // gagal saat menambah halaman: hentikan infinite scroll supaya tidak mengulang request tanpa henti
      if (mode === 'append') setHasMore(false);
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [search]);

  useEffect(() => {
    fetchBP(offset, 'replace');
  }, [fetchBP, offset]);

  // Mobile: tambah halaman berikutnya TANPA mengubah `offset` (offset hanya untuk pagination desktop).
  // Offset = jumlah item yang sudah tampil (dari closure render yang sama dengan sentinel).
  const loadMoreMobile = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    fetchBP(partners.length, 'append');
  }, [loading, loadingMore, hasMore, fetchBP, partners.length]);

  // Kolom cari mobile (PageHeader tidak dipakai di mobile): debounce lalu masuk ke `search`
  const [mobileSearch, setMobileSearch] = useState("");
  // Saat berpindah desktop → mobile (mis. layar diputar), isi kolom cari mengikuti pencarian yang aktif
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isMobile) setMobileSearch(search); }, [isMobile]);
  useEffect(() => {
    if (!isMobile || mobileSearch === search) return undefined;
    const t = setTimeout(() => { setSearch(mobileSearch); setOffset(0); }, 400);
    return () => clearTimeout(t);
  }, [mobileSearch, search, isMobile]);

  const actionRenderer = (item) => {
    const isEditDisabled = item.IsActive === 'N';

    return (
      <div style={{ display: 'flex', gap: '8px' }}>
                
        {/* Kondisi Tombol Edit diatur penuh di sini */}
        <Link 
          to={isEditDisabled ? '#' : `/business-partner/${item.id}`}
          style={{ pointerEvents: isEditDisabled ? 'none' : 'auto' }}
        >
          <button 
            disabled={isEditDisabled} 
            className="btn-action-edit"
            style={{
              color: '#fff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
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

  if (isMobile) {
    return (
      <div style={mobileStyles.page}>
        <div style={mobileStyles.titleRow}>
          <h2 style={mobileStyles.title}>Business Partner Management</h2>
          <Link to="/business-partner/new">
            <button type="button" style={mobileStyles.newBtn}>+ New</button>
          </Link>
        </div>

        <input
          type="search"
          value={mobileSearch}
          onChange={(e) => setMobileSearch(e.target.value)}
          placeholder="Cari nama partner..."
          style={mobileStyles.search}
        />

        <MobileCardList
          items={partners}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          totalRecords={rowCount ?? 0}
          totalLabel="partner"
          emptyText="Tidak ada partner ditemukan."
          onLoadMore={loadMoreMobile}
          renderHeader={(p) => (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                {p.Name || '-'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, overflowWrap: 'anywhere' }}>
                {p.Value || '-'}
              </div>
              {(isYes(p.IsVendor) || isYes(p.IsCustomer)) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {isYes(p.IsVendor) && <span style={badgeStyle('#e0f2fe', '#075985')}>Vendor</span>}
                  {isYes(p.IsCustomer) && <span style={badgeStyle('#dcfce7', '#166534')}>Customer</span>}
                </div>
              )}
            </>
          )}
          getRows={(p) => [
            { label: 'Tax ID', value: p.TaxID },
            { label: 'Open balance', value: fmtNumber(p.TotalOpenBalance) },
          ]}
          renderActions={actionRenderer}
        />
      </div>
    );
  }

  return (
    <div className="card-container">
      {/* 1. Pakai PageHeader */}
      <PageHeader 
        title="Business Partner Management" 
        onSearch={(val) => { setSearch(val); setOffset(0); }} 
        extraAction={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    
                    <Link to="/business-partner/new">
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

      {/* 2. Pakai DataTable */}
      <DataTable 
        columns={columns}
        data={partners}
        loading={loading}
        offset={offset}
        pageSize={pageSize}
        totalRecords={totalRecords} // Kirim total record ke komponen
        onPageChange={(newOffset) => setOffset(newOffset)} // Mengatur perpindahan halaman secara dinamis
        renderActions={actionRenderer}
      />
    </div>
  );
}

export default BusinessPartner;