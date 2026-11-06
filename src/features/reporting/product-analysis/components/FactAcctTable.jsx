/** Keterkaitan produk dengan jurnal accounting (Fact_Acct) —
 *  jejak posting per dokumen: akun, debit, credit, sumber dokumen.
 */

import React from 'react';
import { fmtNum, fmtDate } from '../utils/productAnalysisApi';

export default function FactAcctTable({ rows, loading }) {
  const totalDr = rows.reduce((a, r) => a + r.debit, 0);
  const totalCr = rows.reduce((a, r) => a + r.credit, 0);

  return (
    <div className="pa-card">
      <h3 className="pa-chart__title">🧾 Keterkaitan Accounting (Fact Acct)</h3>
      {loading && <div className="pa-state">Memuat…</div>}
      {!loading && rows.length === 0 && (
        <div className="pa-state">Produk ini belum memiliki jurnal posting.</div>
      )}
      {!loading && rows.length > 0 && (
        <div className="pa-tablewrap">
          <table className="pa-table">
            <thead>
              <tr>
                <th>Tgl Acct</th>
                <th>Akun</th>
                <th>Sumber</th>
                <th>Record</th>
                <th style={{ textAlign: 'right' }}>Debit</th>
                <th style={{ textAlign: 'right' }}>Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.date)}</td>
                  <td>{r.account}</td>
                  <td>{r.table}</td>
                  <td>{r.recordId}</td>
                  <td style={{ textAlign: 'right' }}>{fmtNum(r.debit)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtNum(r.credit)}</td>
                </tr>
              ))}
              <tr className="pa-table__total">
                <td colSpan={4}>Total</td>
                <td style={{ textAlign: 'right' }}>{fmtNum(totalDr)}</td>
                <td style={{ textAlign: 'right' }}>{fmtNum(totalCr)}</td>
              </tr>
            </tbody>
          </table>
          <p className="pa-muted">Menampilkan {rows.length} jurnal terakhir.</p>
        </div>
      )}
    </div>
  );
}
