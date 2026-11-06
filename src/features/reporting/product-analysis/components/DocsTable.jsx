// Tab yang berisi history dokumen: Requisition / Purchase Order / Sales Order / Invoice.

import React, { useState } from 'react';
import { fmtNum, fmtDate } from '../utils/productAnalysisApi';

const TABS = [
  { key: 'requisitions', label: 'Requisition' },
  { key: 'purchases',    label: 'Purchase Order' },
  { key: 'sales',        label: 'Sales Order' },
  { key: 'invoices',     label: 'Invoice' },
];

const COLUMNS = {
  requisitions: [
    { key: 'docNo', label: 'No. Dokumen' },
    { key: 'date', label: 'Tgl Dibutuhkan', render: fmtDate },
    { key: 'requester', label: 'Requester' },
    { key: 'qty', label: 'Qty', align: 'right', render: (v) => fmtNum(v, 0) },
    { key: 'price', label: 'Harga', align: 'right', render: fmtNum },
    { key: 'amount', label: 'Amount', align: 'right', render: fmtNum },
  ],
  purchases: [
    { key: 'docNo', label: 'No. PO' },
    { key: 'date', label: 'Tgl Order', render: fmtDate },
    { key: 'bp', label: 'Vendor' },
    { key: 'qty', label: 'Qty', align: 'right', render: (v) => fmtNum(v, 0) },
    { key: 'delivered', label: 'Dikirim', align: 'right', render: (v) => fmtNum(v, 0) },
    { key: 'price', label: 'Harga', align: 'right', render: fmtNum },
    { key: 'amount', label: 'Amount', align: 'right', render: fmtNum },
  ],
  sales: [
    { key: 'docNo', label: 'No. SO' },
    { key: 'date', label: 'Tgl Order', render: fmtDate },
    { key: 'bp', label: 'Pelanggan' },
    { key: 'qty', label: 'Qty', align: 'right', render: (v) => fmtNum(v, 0) },
    { key: 'delivered', label: 'Dikirim', align: 'right', render: (v) => fmtNum(v, 0) },
    { key: 'price', label: 'Harga', align: 'right', render: fmtNum },
    { key: 'amount', label: 'Amount', align: 'right', render: fmtNum },
  ],
  invoices: [
    { key: 'docNo', label: 'No. Invoice' },
    { key: 'isSOTrx', label: 'Jenis', render: (v) => (v ? 'Penjualan' : 'Pembelian') },
    { key: 'date', label: 'Tgl Invoice', render: fmtDate },
    { key: 'bp', label: 'Partner' },
    { key: 'qty', label: 'Qty', align: 'right', render: (v) => fmtNum(v, 0) },
    { key: 'price', label: 'Harga', align: 'right', render: fmtNum },
    { key: 'amount', label: 'Amount', align: 'right', render: fmtNum },
  ],
};

export default function DocsTable({ data, loading }) {
  const [tab, setTab] = useState('requisitions');
  const columns = COLUMNS[tab];
  const rows = data[tab] || [];

  return (
    <div className="pa-card">
      <div className="pa-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`pa-tabs__btn ${tab === t.key ? 'pa-tabs__btn--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="pa-tabs__count">{(data[t.key] || []).length}</span>
          </button>
        ))}
      </div>

      {loading && <div className="pa-state">Memuat…</div>}
      {!loading && rows.length === 0 && (
        <div className="pa-state">Tidak ada data {TABS.find((t) => t.key === tab)?.label.toLowerCase()} untuk produk ini.</div>
      )}
      {!loading && rows.length > 0 && (
        <div className="pa-tablewrap">
          <table className="pa-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} style={c.align ? { textAlign: c.align } : undefined}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((r) => (
                <tr key={r.id}>
                  {columns.map((c) => (
                    <td key={c.key} style={c.align ? { textAlign: c.align } : undefined}>
                      {c.render ? c.render(r[c.key], r) : (r[c.key] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 && (
            <p className="pa-muted">Menampilkan 50 dari {rows.length} baris terakhir.</p>
          )}
        </div>
      )}
    </div>
  );
}
