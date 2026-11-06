// components/WorkflowDetailSheet.jsx
import React, { useState } from 'react';
import { getAvailableActions, useProductHistory } from '../hooks';
import { ProductHistoryModal } from './index';
import WorkflowHistoryTimeline from './WorkflowHistoryTimeline';

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso)
    : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function WorkflowDetailSheet({ activity, detail, loading, error, submitting, onClose, onAction }) {
  const [showHistory, setShowHistory] = useState(false);
  // Mirror klik line-item di form ZK → popup riwayat transaksi produk
  // (WFHistoryPopupHandler). Terbuka sebagai modal, bukan popup anchor.
  const { history, openHistory, closeHistory } = useProductHistory();

  if (!activity) return null;
  const actions = getAvailableActions(activity);

  const handleLineClick = (row) => {
    // Hanya baris ber-produk yang membuka popup (mirror: productId <= 0 → info).
    openHistory({ lineRecord: row._raw, itemLabel: row.col1, activity });
  };

  return (
    <div className="wf-detail">
      <div className="wf-detail__scroll">
        <div className="wf-detail__head">
          <div>
            <p className="wf-detail__eyebrow">{activity['table-name'] || 'Dokumen'}</p>
            <h2 className="wf-detail__title">{activity.summary || activity['node-name']}</h2>
            <p className="wf-detail__sub">
              Node: {activity['node-name']} · {formatWhen(activity.created)}
            </p>
          </div>
          <button type="button" className="wf-iconbtn" onClick={onClose} aria-label="Tutup">✕</button>
        </div>

        {activity['node-description'] && (
          <p className="wf-detail__desc">{activity['node-description']}</p>
        )}

        {loading && <div className="wf-state">Memuat detail dokumen…</div>}
        {error && <div className="wf-state wf-state--error">{error}</div>}

        {detail && !loading && (
          <>
            <div className="wf-detail__grid">
              {detail.header.map((h) => (
                <div key={h.key} className="wf-detail__cell">
                  <span className="wf-detail__label">{h.label}</span>
                  <span className="wf-detail__value">{h.value ?? '—'}</span>
                </div>
              ))}
            </div>

            {detail.lines && detail.lines.rows?.length > 0 && (
              <div className="wf-detail__tablewrap">
                <table className="wf-table">
                  <thead>
                    <tr>
                      {detail.lines.columns.map((c) => <th key={c.key}>{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.rows.map((r) => (
                      <tr
                        key={r.id ?? JSON.stringify(r)}
                        className={r._productId ? 'wf-row--clickable' : ''}
                        title={r._productId ? 'Klik untuk lihat riwayat transaksi produk' : undefined}
                        onClick={r._productId ? () => handleLineClick(r) : undefined}
                      >
                        <td>{r.col1}</td>
                        <td className="wf-num">{r.col2}</td>
                        {r.col3 !== undefined && <td className="wf-num">{r.col3}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {detail.lines?.error && <p className="wf-error-text">{detail.lines.error}</p>}
          </>
        )}

        {activity['history-records'] && (
          <div className="wf-history">
            <button
              type="button"
              className="wf-history__toggle"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? '▾ Sembunyikan Riwayat' : '▸ Lihat Riwayat Workflow'}
            </button>
            {showHistory && <WorkflowHistoryTimeline raw={activity['history-records']} />}
          </div>
        )}
      </div>

      <div className="wf-detail__actions">
        {actions.includes('approve') && (
          <button type="button" className="wf-btn wf-btn--success" disabled={submitting} onClick={() => onAction('approve')}>
            ✓ Setujui
          </button>
        )}
        {actions.includes('reject') && (
          <button type="button" className="wf-btn wf-btn--danger" disabled={submitting} onClick={() => onAction('reject')}>
            ✕ Tolak
          </button>
        )}
        {actions.includes('acknowledge') && (
          <button type="button" className="wf-btn wf-btn--primary" disabled={submitting} onClick={() => onAction('acknowledge')}>
            Konfirmasi Terima
          </button>
        )}
        {actions.includes('forward') && (
          <button type="button" className="wf-btn wf-btn--ghost" disabled={submitting} onClick={() => onAction('forward')}>
            ↪ Forward
          </button>
        )}
      </div>

      <ProductHistoryModal history={history} onClose={closeHistory} />
    </div>
  );
}