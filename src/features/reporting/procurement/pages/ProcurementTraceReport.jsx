import { useState } from "react";
import useProcurementTrace from "../hooks/useProcurementTrace";
import useProcurementTraceExport from "../hooks/useProcurementTraceExport";
import DocDetailModal from "../components/DocDetailModal";
import { OVERALL_LABEL, STATUS_LABEL, fmtDate } from "../utils/buildTrace";
import "@/css/ProcurementTraceReport.css";

function DocChip({ d, onOpen, extra }) {
  return (
    <div className="ptr-chip">
      <button type="button" className={`ptr-doc st-${d.status}`} onClick={() => onOpen(d)} title={`Lihat detail ${d.no} (${d.status})`}>
        {d.no}
      </button>
      <span className="ptr-date">{fmtDate(d.date)}</span>
      {extra}
    </div>
  );
}

function Cell({ status, docs, note, age, late, onOpen, children }) {
  return (
    <td className={`ptr-cell s-${status}${late ? " late" : ""}`}>
      {children}
      {docs.map((d) => <DocChip key={`${d.type}${d.id}`} d={d} onOpen={onOpen} />)}
      <div className="ptr-state">
        <span className="ptr-badge">{STATUS_LABEL[status]}</span>
        {note && <span className="ptr-note">{note}</span>}
        {age != null && age > 0 && <span className="ptr-age">{age} hari</span>}
      </div>
    </td>
  );
}

const CARDS = [["", "semua", "Semua"], ["selesai", "selesai", "Selesai"], ["berjalan", "berjalan", "Berjalan"], ["terlambat", "terlambat", "Terlambat"], ["anomali", "anomali", "Anomali"]];

export default function ProcurementTraceReport() {
  const t = useProcurementTrace();
  const { exportExcel, exportPDF } = useProcurementTraceExport();
  const [openDoc, setOpenDoc] = useState(null);
  const { ui, setFilter, period, setPeriod } = t;

  return (
    <div className="ptr-page">
      <div className="ptr-container">
        <h1>Penelusuran Procurement</h1>
        <p className="ptr-muted">Memastikan setiap Requisition dan PO sudah ditindaklanjuti sampai penerimaan, invoice, dan pembayaran.</p>

        <form className="ptr-filters" onSubmit={(e) => { e.preventDefault(); t.load(); }}>
          <label>Dari<input type="date" value={period.dateFrom} onChange={(e) => setPeriod({ ...period, dateFrom: e.target.value })} /></label>
          <label>Sampai<input type="date" value={period.dateTo} onChange={(e) => setPeriod({ ...period, dateTo: e.target.value })} /></label>
          <label>Cari nomor dokumen<input type="search" value={ui.search} onChange={(e) => setFilter({ search: e.target.value })} placeholder="mis. 003/PUR" /></label>
          <label>Vendor
            <select value={ui.vendor} onChange={(e) => setFilter({ vendor: e.target.value })}>
              <option value="">Semua vendor</option>
              {t.vendors.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label>Batas tunggu (hari)<input type="number" min="0" value={ui.slaDays} onChange={(e) => setFilter({ slaDays: e.target.value })} /></label>
          <label className="ptr-check"><input type="checkbox" checked={ui.includeVoid} onChange={(e) => setFilter({ includeVoid: e.target.checked })} />Sertakan dokumen void</label>
          <button type="submit" className="ptr-btn primary" disabled={t.loading}>{t.loading ? "Memuat…" : "Tampilkan"}</button>
          <button type="button" className="ptr-btn" disabled={!t.rows.length} onClick={() => exportExcel(t.rows, period)}>Excel</button>
          <button type="button" className="ptr-btn" disabled={!t.rows.length} onClick={() => exportPDF(t.rows, period)}>PDF</button>
        </form>

        {t.loading && <p className="ptr-muted">{t.progress || "Memuat…"}</p>}
        {t.error && <p className="ptr-error">{t.error}</p>}

        <div className="ptr-summary">
          {CARDS.map(([val, key, label]) => (
            <button key={key} type="button" className={`ptr-card c-${key}${ui.overall === val ? " active" : ""}`} onClick={() => setFilter({ overall: val })}>
              <strong>{t.summary[key] ?? 0}</strong><span>{label}</span>
            </button>
          ))}
        </div>

        <div className="ptr-scroll">
          <table className="ptr-table">
            <thead>
              <tr><th>Requisition</th><th>Purchase Order</th><th>Penerimaan Barang</th><th>Invoice Vendor</th><th>Pembayaran</th><th>Catatan QC</th></tr>
            </thead>
            <tbody>
              {!t.loading && t.rows.length === 0 && <tr><td colSpan={6} className="ptr-muted">Tidak ada dokumen pada periode dan filter ini.</td></tr>}
              {t.rows.map((r) => {
                const late = (s) => r.overdue.includes(s);
                return (
                  <tr key={r.key} className={`ov-${r.overall}`}>
                    <Cell status={r.stages.req} docs={[]} age={r.ages.req} late={late("req")} onOpen={setOpenDoc}>
                      {r.reqs.length === 0 && <span className="ptr-muted">—</span>}
                      {r.reqs.map((d) => (
                        <DocChip key={d.id} d={d} onOpen={setOpenDoc}
                          extra={<span className={`ptr-note${d.covered < d.total ? " warn" : ""}`}>{d.covered}/{d.total} line jadi PO{d.poCount > 1 ? ` · ${d.poCount} PO` : ""}</span>} />
                      ))}
                    </Cell>
                    <Cell status={r.stages.po} docs={r.po ? [r.po] : []} age={r.ages.po} late={late("po")} onOpen={setOpenDoc}>
                      {r.vendor && <div className="ptr-vendor">{r.vendor}</div>}
                    </Cell>
                    <Cell status={r.stages.gr} docs={r.grs} note={r.notes.gr} age={r.ages.gr} late={late("gr")} onOpen={setOpenDoc} />
                    <Cell status={r.stages.inv} docs={r.invoices} note={r.notes.inv} age={r.ages.inv} late={late("inv")} onOpen={setOpenDoc} />
                    <Cell status={r.stages.pay} docs={r.payments} note={r.notes.pay} age={r.ages.pay} late={late("pay")} onOpen={setOpenDoc} />
                    <td className="ptr-flags">
                      <span className={`ptr-overall o-${r.overall}`}>{OVERALL_LABEL[r.overall]}</span>
                      <ul>{r.flags.map((f, i) => <li key={i} className={`f-${f.level}`}>{f.text}</li>)}</ul>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      {openDoc && <DocDetailModal doc={openDoc} onClose={() => setOpenDoc(null)} />}
    </div>
  );
}
