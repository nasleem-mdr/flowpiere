import { useEffect, useState } from "react";
import { fetchDocDetail } from "../api/procurementTraceApi";
import { DOC_META, DOC_ROUTES, formatValue } from "../utils/docMeta";
import { fmtDate } from "../utils/buildTrace";

export default function DocDetailModal({ doc, onClose }) {
  const meta = DOC_META[doc.type];
  const [st, setSt] = useState({ loading: true, header: null, lines: [], error: null });

  useEffect(() => {
    let off = false;
    setSt({ loading: true, header: null, lines: [], error: null });
    fetchDocDetail(meta, doc.id)
      .then((r) => !off && setSt({ loading: false, ...r, error: null }))
      .catch((e) => !off && setSt({ loading: false, header: null, lines: [], error: e?.message || "Gagal memuat dokumen" }));
    return () => { off = true; };
  }, [doc.type, doc.id, meta]);

  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const route = DOC_ROUTES[doc.type]?.(doc.id);

  return (
    <div className="ptr-overlay" onClick={onClose} role="presentation">
      <div className="ptr-modal" role="dialog" aria-modal="true" aria-label={`${meta.label} ${doc.no}`} onClick={(e) => e.stopPropagation()}>
        <header className="ptr-modal-head">
          <div>
            <div className="ptr-modal-type">{meta.label}</div>
            <h2>{doc.no}</h2>
            <span className="ptr-date">{fmtDate(doc.date)}</span>
          </div>
          <div className="ptr-modal-actions">
            {route && <button type="button" className="ptr-btn" onClick={() => window.open(route, "_blank")}>Buka halaman dokumen</button>}
            <button type="button" className="ptr-btn" onClick={onClose}>Tutup</button>
          </div>
        </header>

        {st.loading && <p className="ptr-muted">Memuat detail…</p>}
        {st.error && <p className="ptr-error">{st.error}</p>}

        {st.header && (
          <>
            <dl className="ptr-grid">
              {meta.header.map(([k, label, kind]) => (
                <div key={k}><dt>{label}</dt><dd>{formatValue(st.header[k], kind)}</dd></div>
              ))}
            </dl>
            <div className="ptr-scroll">
              <table className="ptr-lines">
                <thead><tr>{meta.lines.map(([k, label, kind]) => <th key={k} className={kind ? "num" : ""}>{label}</th>)}</tr></thead>
                <tbody>
                  {st.lines.length === 0 && <tr><td colSpan={meta.lines.length} className="ptr-muted">Tidak ada baris.</td></tr>}
                  {st.lines.map((l, i) => (
                    <tr key={l[meta.linePk] ?? i}>
                      {meta.lines.map(([k, , kind]) => <td key={k} className={kind ? "num" : ""}>{formatValue(l[k], kind)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
