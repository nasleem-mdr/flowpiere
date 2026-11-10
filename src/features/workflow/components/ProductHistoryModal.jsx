// components/ProductHistoryModal.jsx
import React, { useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from 'recharts';
import { useProductAnalysis } from '@/features/reporting/product-analysis/hooks/useProductAnalysis';
import { fmtNum, fmtDate } from '@/features/reporting/product-analysis/utils/productAnalysisApi';

const PA_LIMIT = 5; // baris riwayat PO / Requisition yang ditampilkan

function Stat({ label, value, sub, tone }) {
  return (
    <div style={{ flex: 1, minWidth: 130, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: tone || '#111827' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#6b7280' }}>{sub}</div>}
    </div>
  );
}

const SectionTitle = ({ children }) => (
  <h4 style={{ margin: '16px 0 6px', fontSize: 13, fontWeight: 700 }}>{children}</h4>
);

export default function ProductHistoryModal({ history, onClose }) {
  const { open, loading, error, noProduct, rows, itemLabel, productId } = history;

  const analysis = useProductAnalysis();
  const { selectProduct, clear } = analysis;

  // Hook harus dipanggil sebelum early return.
  useEffect(() => {
    if (open && productId) selectProduct({ id: productId, name: itemLabel }, { purchaseOnly: true });
    else clear();
  }, [open, productId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Series harga beli saja + arah tren (titik terakhir vs sebelumnya)
  const buySeries = useMemo(
    () => analysis.priceSeries.filter((d) => d['Harga Beli'] != null),
    [analysis.priceSeries]
  );
  const trend = useMemo(() => {
    if (buySeries.length < 2) return null;
    const last = Number(buySeries[buySeries.length - 1]['Harga Beli']);
    const prev = Number(buySeries[buySeries.length - 2]['Harga Beli']);
    if (!prev) return null;
    return ((last - prev) / prev) * 100;
  }, [buySeries]);

  if (!open) return null;

  const { kpis, data, loading: paLoading, error: paError } = analysis;

  return (
    <div className="wf-modal__backdrop" onClick={onClose}>
      <div
        className="wf-modal wf-modal--wide"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wf-modal__accent wf-modal__accent--neutral" />

        <h3 className="wf-modal__title">📊 Analisis Produk</h3>
        <p className="wf-modal__subtitle">
          {itemLabel ? <strong>{itemLabel}</strong> : 'Item'}
        </p>

        {noProduct && (
          <p className="wf-muted" style={{ fontSize: 13 }}>
            ℹ️ Baris ini tidak memiliki produk (non-product line).
          </p>
        )}

        {/* ───────── ANALISIS ───────── */}
        {!noProduct && (
          <>
            {paLoading && <div className="wf-state">Menganalisis produk…</div>}
            {paError && <p className="wf-error-text">{paError}</p>}

            {!paLoading && !paError && kpis && (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Stat
                    label="Harga Beli Terakhir"
                    value={fmtNum(kpis.lastPOPrice)}
                    sub={kpis.lastPODate ? fmtDate(kpis.lastPODate) : '-'}
                  />
                  <Stat
                    label="Rata-rata Harga Beli"
                    value={fmtNum(kpis.poAvgPrice)}
                    sub={`${kpis.poCount} transaksi PO`}
                  />
                  <Stat
                    label="Tren Terakhir"
                    value={trend == null ? '-' : `${trend > 0 ? '▲' : trend < 0 ? '▼' : '='} ${fmtNum(Math.abs(trend), 1)}%`}
                    sub="vs PO sebelumnya"
                    tone={trend == null ? undefined : trend > 0 ? '#b91c1c' : trend < 0 ? '#047857' : undefined}
                  />
                </div>

                <SectionTitle>📈 Tren Harga Beli</SectionTitle>
                {buySeries.length === 0 ? (
                  <p className="wf-muted" style={{ fontSize: 13 }}>Belum ada data harga beli.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={buySeries} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={70} domain={['auto', 'auto']} />
                      <Tooltip formatter={(v) => [Number(v).toLocaleString('id-ID'), 'Harga Beli']} />
                      <Line type="monotone" dataKey="Harga Beli" stroke="#2563eb"
                            strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                )}

                <SectionTitle>🧾 Riwayat Purchase Order</SectionTitle>
                {data.purchases.length === 0 ? (
                  <p className="wf-muted" style={{ fontSize: 13 }}>Tidak ada riwayat PO.</p>
                ) : (
                  <div className="wf-detail__tablewrap" style={{ marginTop: 0 }}>
                    <table className="wf-table">
                      <thead>
                        <tr>
                          <th>No. Dokumen</th><th>Tanggal</th><th>Vendor</th>
                          <th className="wf-num">Qty</th><th className="wf-num">Harga</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.purchases.slice(0, PA_LIMIT).map((r, i) => (
                          <tr key={`${r.docNo}-${i}`}>
                            <td>{r.docNo}</td>
                            <td>{r.date ? fmtDate(r.date) : '-'}</td>
                            <td>{r.bp}</td>
                            <td className="wf-num">{fmtNum(r.qty, 0)}</td>
                            <td className="wf-num">{fmtNum(r.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <SectionTitle>📝 Riwayat Requisition</SectionTitle>
                {data.requisitions.length === 0 ? (
                  <p className="wf-muted" style={{ fontSize: 13 }}>Tidak ada riwayat requisition.</p>
                ) : (
                  <div className="wf-detail__tablewrap" style={{ marginTop: 0 }}>
                    <table className="wf-table">
                      <thead>
                        <tr>
                          <th>No. Dokumen</th><th>Tanggal</th><th className="wf-num">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.requisitions.slice(0, PA_LIMIT).map((r, i) => (
                          <tr key={`${r.docNo}-${i}`}>
                            <td>{r.docNo}</td>
                            <td>{r.date ? fmtDate(r.date) : '-'}</td>
                            <td className="wf-num">{fmtNum(r.qty, 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ───────── 3 TRANSAKSI TERAKHIR (paling bawah) ───────── 
        <SectionTitle>📋 Riwayat Transaksi — 3 Dokumen Terakhir</SectionTitle>

        {loading && <div className="wf-state">Memuat riwayat…</div>}
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
                  <th>No. Dokumen</th><th>Tanggal</th><th>Business Partner</th>
                  <th className="wf-num">Qty</th><th className="wf-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.docNo}-${i}`}>
                    <td style={{ color: '#1d4ed8', fontWeight: 600 }}>{r.docNo}</td>
                    <td>{r.date}</td>
                    <td>{r.bp}</td>
                    <td className="wf-num">{r.qty}</td>
                    <td className="wf-num" style={{ fontWeight: 600, color: '#065f46' }}>{r.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        */}
        <div className="wf-modal__actions">
          <button type="button" className="wf-btn wf-btn--ghost" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  );
}