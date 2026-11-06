// Grafik tren harga beli vs harga jual dari C_OrderLine.PriceActual per tanggal.

import React from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';

export default function PriceTrendChart({ data, loading }) {
  return (
    <div className="pa-chart">
      <h3 className="pa-chart__title">📈 Tren Harga Beli vs Jual</h3>
      {loading && <div className="pa-state">Memuat…</div>}
      {!loading && data.length === 0 && (
        <div className="pa-state">Belum ada data harga dari Sales/Purchase Order.</div>
      )}
      {!loading && data.length > 0 && (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={70} />
            <Tooltip formatter={(v) => [Number(v).toLocaleString('id-ID'), undefined]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="Harga Beli" stroke="#2563eb" strokeWidth={2}
                  dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="Harga Jual" stroke="#16a34a" strokeWidth={2}
                  dot={{ r: 3 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
