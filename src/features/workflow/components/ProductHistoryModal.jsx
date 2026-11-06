// components/ProductHistoryModal.jsx
// Popup riwayat transaksi produk/jasa — padanan ZK Popup WFHistoryPopupHandler.
// Kolom: No. Dokumen | Tanggal | Business Partner | Qty | Amount.
import React from 'react';

export default function ProductHistoryModal({ history, onClose }) {
  const { open, loading, error, noProduct, rows, itemLabel } = history;
  if (!open) return null;

  return (
    <div className="wf-modal__backdrop" onClick={onClose}>
      <div className="wf-modal wf-modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="wf-modal__accent wf-modal__accent--neutral" />

        <h3 className="wf-modal__title">📋 Riwayat Transaksi</h3>
        <p className="wf-modal__subtitle">
          {itemLabel ? <strong>{itemLabel}</strong> : 'Item'} — 3 dokumen terakhir
        </p>

        {loading && <div className="wf-state">Memuat riwayat…</div>}

        {!loading && noProduct && (
          <p className="wf-muted" style={{ fontSize: 13 }}>
            ℹ️ Baris ini tidak memiliki produk (non-product line).
          </p>
        )}

        {!loading && error && <p className="wf-error-text">{error}</p>}

        {!loading && !error && !noProduct && rows.length === 0 && (
          <p className="wf-muted" style={{ fontSize: 13 }}>
            Tidak ada riwayat transaksi untuk produk ini.
          </p>
        )}

        {!loading && rows.length > 0 && (
          <div className="wf-detail__tablewrap" style={{ marginTop: 0 }}>
            <table className="wf-table">
              <thead>
                <tr>
                  <th>No. Dokumen</th>
                  <th>Tanggal</th>
                  <th>Business Partner</th>
                  <th className="wf-num">Qty</th>
                  <th className="wf-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.docNo}-${i}`}>
                    <td style={{ color: '#1d4ed8', fontWeight: 600 }}>{r.docNo}</td>
                    <td>{r.date}</td>
                    <td>{r.bpartner}</td>
                    <td className="wf-num">{r.qty}</td>
                    <td className="wf-num" style={{ fontWeight: 600, color: '#065f46' }}>
                      {r.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="wf-modal__actions">
          <button type="button" className="wf-btn wf-btn--ghost" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
