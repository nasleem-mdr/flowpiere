// Kartu KPI ringkasan produk untuk pengambilan keputusan cepat.

import React from 'react';
import { fmtNum, fmtDate } from '../utils/productAnalysisApi';

function Card({ label, value, sub, tone }) {
  return (
    <div className="pa-kpi">
      <span className="pa-kpi__label">{label}</span>
      <span className={`pa-kpi__value ${tone ? `pa-kpi__value--${tone}` : ''}`}>{value}</span>
      {sub && <span className="pa-kpi__sub">{sub}</span>}
    </div>
  );
}

export default function KpiCards({ product, kpis }) {
  if (!product || !kpis) return null;
  return (
    <div className="pa-kpi-grid">
      <Card label="Requisition (kebutuhan)" value={String(kpis.reqCount)}
            sub={kpis.reqCount ? `Total ${fmtNum(kpis.reqQty, 0)} unit` : 'Tidak ada riwayat'} />
      <Card label="Purchase Order" value={String(kpis.poCount)}
            sub={kpis.poCount ? `${fmtNum(kpis.poQty, 0)} unit · ${fmtNum(kpis.poAmt, 0)}` : 'Tidak ada riwayat'} />
      <Card label="Harga Beli Terakhir" value={fmtNum(kpis.lastPOPrice)}
            sub={kpis.lastPODate ? fmtDate(kpis.lastPODate) : '-'}
            tone={kpis.lastPOPrice ? '' : 'muted'} />
      <Card label="Rata-rata Harga Beli" value={fmtNum(kpis.poAvgPrice)}
            sub={`${kpis.poCount} transaksi`} />
      <Card label="Sales Order" value={String(kpis.soCount)}
            sub={kpis.soCount ? `${fmtNum(kpis.soQty, 0)} unit · ${fmtNum(kpis.soAmt, 0)}` : 'Tidak ada riwayat'} />
      <Card label="Harga Jual Terakhir" value={fmtNum(kpis.lastSOPrice)}
            sub={kpis.lastSODate ? fmtDate(kpis.lastSODate) : '-'} />
      <Card
        label="Estimasi Margin"
        value={`${fmtNum(kpis.margin)} (${fmtNum(kpis.marginPct, 1)}%)`}
        sub="Harga jual − harga beli terakhir"
        tone={kpis.margin > 0 ? 'good' : kpis.margin < 0 ? 'bad' : 'muted'}
      />
    </div>
  );
}
