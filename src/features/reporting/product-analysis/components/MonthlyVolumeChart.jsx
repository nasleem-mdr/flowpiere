// Grafik volume qty bulanan: pembelian vs penjualan (dari C_OrderLine).

import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';

export default function MonthlyVolumeChart({ data, loading }) {
  return (
    <div className="pa-chart">
      <h3 className="pa-chart__title">📦 Volume Bulanan (Qty)</h3>
      {loading && <div className="pa-state">Memuat…</div>}
      {!loading && data.length === 0 && (
        <div className="pa-state">Belum ada data volume.</div>
      )}
      {!loading && data.length > 0 && (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={50} />
            <Tooltip formatter={(v) => [Number(v).toLocaleString('id-ID'), undefined]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Qty Beli" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Qty Jual" fill="#16a34a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
