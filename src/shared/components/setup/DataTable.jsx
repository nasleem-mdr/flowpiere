import React, {useRef} from 'react';
import { useIsDesktop } from '@/shared/hooks/useIsDesktop';
import { useInfiniteScroll } from '@/shared/hooks/useInfiniteScroll';
import { FirstIcon, PrevIcon, NextIcon, LastIcon } from '@/shared/components/icon'
import '@/css/Components.css';


export default function DataTable({
  columns,
  data,
  loading,
  offset,
  pageSize,
  totalRecords = 0,
  onPageChange,
  renderActions, 
  summaryRow,    
  infiniteScroll,

}) {
  const isDesktop = useIsDesktop();
  const scrollContainerRef = useRef(null);
   const sentinelRef = useInfiniteScroll({
      fetchMore: infiniteScroll?.fetchMore ?? (() => {}),
      hasMore: infiniteScroll?.hasMore ?? false,
      loading: infiniteScroll?.loadingMore ?? false,
      rootMargin: '400px',
      rootRef: scrollContainerRef,
    });

  if (loading) return <div className="loading-state">Loading data iDempiere...</div>;

  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.ceil(totalRecords / pageSize) || 1;

  const pagination = (
    <div className="pagination-container" style={paginationWrapperStyle}>
      <button
        disabled={currentPage === 1}
        onClick={() => onPageChange(0)}
        className="btn-pagination-icon"
        title="Halaman Pertama"
      >
        <FirstIcon />
      </button>
      <button
        disabled={currentPage === 1}
        onClick={() => onPageChange(offset - pageSize)}
        className="btn-pagination-icon"
        title="Halaman Sebelumnya"
      >
        <PrevIcon />
      </button>
      <span className="pagination-info" style={{ margin: '0 10px', fontWeight: '600' }}>
        {currentPage} / {totalPages}
      </span>
      <button
        disabled={currentPage >= totalPages || data.length < pageSize}
        onClick={() => onPageChange(offset + pageSize)}
        className="btn-pagination-icon"
        title="Halaman Selanjutnya"
      >
        <NextIcon />
      </button>
      <button
        disabled={currentPage >= totalPages || data.length < pageSize}
        onClick={() => onPageChange((totalPages - 1) * pageSize)}
        className="btn-pagination-icon"
        title="Halaman Terakhir"
      >
        <LastIcon />
      </button>
    </div>
  );

  // ── MOBILE — card grid (1 kolom, mirip daftar pesanan Shopee) ───────────
  if (!isDesktop) {
    return (
      <div className="table-card" ref={scrollContainerRef} style={{ overflowY: 'auto', maxHeight: '100vh' }}>
        {summaryRow && (
          <div style={cardStyles.summaryCard}>
            <span style={cardStyles.summaryLabel}>{summaryRow.label || 'Total'}</span>
            <strong style={cardStyles.summaryValue}>{summaryRow.value}</strong>
          </div>
        )}

        <div style={cardStyles.grid}>
          {data.length === 0 ? (
            <div style={cardStyles.empty}>Tidak ada data.</div>
          ) : (
            data.map((item) => (
              <div key={item.id} style={cardStyles.card}>
                {columns.map((col) => (
                  <div key={col.key} style={cardStyles.row}>
                    <span style={cardStyles.rowLabel}>{col.label}</span>
                    <span style={{ ...cardStyles.rowValue, textAlign: col.align || 'right' }}>
                      {col.key === 'Value' ? <strong>{item[col.key]}</strong> : (item[col.key] ?? '-')}
                    </span>
                  </div>
                ))}
                {renderActions && (
                  <div style={cardStyles.actionsRow}>{renderActions(item)}</div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Sentinel: elemen tak kasat mata, trigger fetch saat masuk viewport */}
        {infiniteScroll && infiniteScroll.hasMore && (
          <div ref={sentinelRef} style={{ height: 1 }} />
        )}

        {infiniteScroll?.loadingMore && (
          <div style={{ textAlign: 'center', padding: '12px', color: '#9ca3af', fontSize: '13px' }}>
            Memuat lagi...
          </div>
        )}

        {infiniteScroll && !infiniteScroll.hasMore && data.length > 0 && (
          <div style={{ textAlign: 'center', padding: '12px', color: '#c1c1c1', fontSize: '12px' }}>
            — Semua data sudah dimuat —
          </div>
        )}
      </div>
    );
  }

  // ── DESKTOP — tabel biasa ────────────────────────────────────────────────
  return (
    <div className="table-card">
      <table className="modern-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{ textAlign: col.align || 'left' }}>{col.label}</th>
            ))}
            <th style={{ textAlign: 'center' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.id}>
              {columns.map(col => (
                <td key={col.key} style={{ textAlign: col.align || 'left' }}>
                  {col.key === 'Value' ? <strong>{item[col.key]}</strong> : item[col.key] || '-'}
                </td>
              ))}<td>{renderActions ? renderActions(item) : '-'}</td>
            </tr>
          ))}
        </tbody>

        {/* Summary Row — tampil jika prop summaryRow diberikan */}
        {summaryRow && (
          <tfoot>
            <tr style={styles.summaryRow}>
              {columns.map((col) => (
                <td key={col.key} style={col.key === summaryRow.columnKey ? styles.summaryValue : styles.summaryEmpty}>
                  {col.key === summaryRow.columnKey ? (
                    <>
                      <span style={styles.summaryLabel}>{summaryRow.label || "Total"} &nbsp;</span>
                      <strong>{summaryRow.value}</strong>
                    </>
                  ) : null}
                </td>
              ))}
              <td style={styles.summaryEmpty} />
            </tr>
          </tfoot>
        )}
      </table>

      {/* Format Navigasi: <| <  1 / 10 > |> */}
      {pagination}
    </div>
  );
}

// Inline style tambahan untuk merapikan tombol icon bulat/kotak kecil
const paginationWrapperStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '6px',
  padding: '16px',
  background: '#ffffff'
};

const styles = {
  summaryRow: {
    backgroundColor: '#f0f4ff',
    borderTop: '2px solid #c5cae9',
  },
  summaryEmpty: {
    padding: '10px 16px',
  },
  summaryValue: {
    padding: '10px 16px',
    textAlign: 'right',
    fontSize: '13px',
    color: '#1a237e',
    whiteSpace: 'nowrap',
  },
  summaryLabel: {
    fontWeight: 'normal',
    color: '#555',
    fontSize: '12px',
  },
};

// Style khusus tampilan card mobile
const cardStyles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '10px',
    padding: '12px',
  },
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    padding: '12px 14px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    padding: '5px 0',
    borderBottom: '1px dashed #f0f0f0',
  },
  rowLabel: {
    fontSize: '11.5px',
    color: '#9ca3af',
    fontWeight: 600,
    flexShrink: 0,
  },
  rowValue: {
    fontSize: '13px',
    color: '#111827',
    fontWeight: 500,
    minWidth: 0,
  },
  actionsRow: {
    marginTop: '8px',
    paddingTop: '8px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  empty: {
    textAlign: 'center',
    padding: '32px 12px',
    color: '#9ca3af',
    fontSize: '13px',
  },
  summaryCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#f0f4ff',
    borderBottom: '2px solid #c5cae9',
    padding: '10px 16px',
  },
  summaryLabel: {
    fontSize: '12px',
    color: '#555',
  },
  summaryValue: {
    fontSize: '13px',
    color: '#1a237e',
  },
};
