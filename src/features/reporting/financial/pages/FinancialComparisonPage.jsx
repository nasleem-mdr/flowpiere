import { useState, useRef, useMemo } from 'react';
import {
  Printer,
  Download,
  FileSpreadsheet,
  FileBarChart,
  Loader2,
  Calendar,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { useFinancialComparison } from '@/features/reporting/financial/hooks/useFinancialComparison';
import FinancialComparisonModal from '@/features/reporting/financial/components/FinancialComparisonModal';
import { useOrgInfo } from '@/shared/hooks/useOrgInfo';
import OrgLetterhead from '@/shared/components/pdf/OrgLetterhead';
import { buildRowBorderStyle } from '@/utils/reportLineStroke';
import '@/css/FinancialReport.css';

// ─── Helper format ───────────────────────────────────────────────────────────
function formatRupiah(amount) {
  const value = Math.round(amount || 0);
  const formatted = Math.abs(value).toLocaleString('id-ID');
  return value < 0 ? `(${formatted})` : formatted;
}

function formatPct(pct) {
  if (pct === null || pct === undefined) return '-';
  const v = (pct * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 });
  return `${pct > 0 ? '+' : ''}${v}%`;
}

const periodLabelOf = (p, periodic) =>
  periodic ? `${p.dateFrom} s/d ${p.dateTo}` : `Per ${p.dateTo}`;

// ─── Komponen ────────────────────────────────────────────────────────────────
export default function FinancialComparisonPage({ token, acctSchemaId }) {
  const [modalOpen, setModalOpen] = useState(false);
  // Parameter yang sudah diterapkan dari modal (memicu fetch):
  // { reportLineSetId, reportLabel, isPeriodic, p1:{dateFrom,dateTo}, p2:{dateFrom,dateTo} }
  const [active, setActive] = useState(null);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const printAreaRef = useRef(null);

  const { orgInfo } = useOrgInfo();

  const { rows, loading, error } = useFinancialComparison({
    reportLineSetId: active?.reportLineSetId,
    acctSchemaId,
    kind: active?.isPeriodic ? 'labarugi' : 'neraca',
    period1: active?.p1 ?? null,
    period2: active?.p2 ?? null,
    token,
  });

  const activePeriodic = !!active?.isPeriodic;

  const sortedRows = useMemo(() => rows.slice().sort((a, b) => a.seqNo - b.seqNo), [rows]);

  const p1Label = active ? periodLabelOf(active.p1, activePeriodic) : '';
  const p2Label = active ? periodLabelOf(active.p2, activePeriodic) : '';

  // ─── Cetak / PDF / Excel ───────────────────────────────────────────────────
  const handlePrint = () => window.print();

  const handleDownloadPdf = async () => {
    const { default: html2canvas } = await import('html2canvas');
    const { jsPDF } = await import('jspdf');

    const canvas = await html2canvas(printAreaRef.current, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');

    // Landscape: 4 kolom angka lebih lega. Gambar dipotong per halaman supaya
    // laporan panjang tidak terpotong di halaman pertama.
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;

    let heightLeft = imgH;
    let y = 0;
    pdf.addImage(imgData, 'PNG', 0, y, pageW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      y -= pageH;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, y, pageW, imgH);
      heightLeft -= pageH;
    }

    pdf.save(`komparasi-${active?.reportLabel || 'laporan'}-${active?.p1.dateTo}_vs_${active?.p2.dateTo}.pdf`);
  };

  const handleDownloadExcel = async () => {
    if (!active) return;
    setDownloadingExcel(true);
    try {
      const XLSX = await import('xlsx');

      const HEADER_ROW = 4;
      const aoa = [
        [orgInfo?.name || ''],
        [`LAPORAN KOMPARASI ${active.reportLabel}`],
        [`Periode 1: ${p1Label}   |   Periode 2: ${p2Label}`],
        [],
        ['No Rek', 'Keterangan', `Periode 1 (${p1Label})`, `Periode 2 (${p2Label})`, 'Selisih (P2 − P1)', '%'],
        ...sortedRows.map((r) => [
          r.name ?? '',
          r.description ?? '',
          r.amount1,
          r.amount2,
          r.diff,
          r.pct === null ? '' : r.pct, // pecahan (0.125 = 12,5%) -> diformat sebagai persen di bawah
        ]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 12 }, { wch: 46 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 10 }];
      ws['!merges'] = [0, 1, 2].map((r) => ({ s: { r, c: 0 }, e: { r, c: 5 } }));

      for (let r = HEADER_ROW + 1; r < aoa.length; r++) {
        [2, 3, 4].forEach((c) => {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (cell) cell.z = '#,##0;(#,##0)';
        });
        const pctCell = ws[XLSX.utils.encode_cell({ r, c: 5 })];
        if (pctCell && typeof pctCell.v === 'number') pctCell.z = '0.0%';
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Komparasi');
      XLSX.writeFile(wb, `komparasi-${active.reportLabel || 'laporan'}-${active.p1.dateTo}_vs_${active.p2.dateTo}.xlsx`);
    } catch (err) {
      console.error('Gagal membuat Excel:', err.message);
      alert('Gagal membuat file Excel.');
    } finally {
      setDownloadingExcel(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="frp-page">
      {/* Toolbar */}
      <div className="frp-toolbar print:hidden">
        <div className="frp-toolbar-left">
          <div className="frp-toolbar-icon">
            <FileBarChart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="frp-toolbar-title">Laporan Komparasi</h1>
            <p className="frp-toolbar-subtitle">Bandingkan dua periode untuk laporan keuangan yang sama</p>
          </div>
        </div>

        <div className="frp-toolbar-actions">
          <button onClick={() => setModalOpen(true)} className="frp-btn-primary">
            <FileBarChart size={16} />
            Pilih Laporan
          </button>

          {active && (
            <div className="frp-secondary-group">
              <button onClick={handlePrint} className="frp-btn-secondary">
                <Printer size={16} />
                Cetak
              </button>
              <button onClick={handleDownloadPdf} className="frp-btn-secondary">
                <Download size={16} />
                PDF
              </button>
              <button onClick={handleDownloadExcel} disabled={downloadingExcel} className="frp-btn-secondary">
                {downloadingExcel ? <Loader2 size={16} className="frp-spin" /> : <FileSpreadsheet size={16} />}
                Excel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Empty State */}
      {!active && (
        <div className="frp-empty">
          <div className="frp-empty-icon">
            <FileText className="h-7 w-7" />
          </div>
          <h3 className="frp-empty-title">Belum ada komparasi</h3>
          <p className="frp-empty-desc">
            Klik tombol di bawah untuk memilih laporan dan menentukan dua periode yang ingin dibandingkan.
          </p>
          <button onClick={() => setModalOpen(true)} className="frp-empty-btn">
            Pilih Laporan Sekarang
          </button>
        </div>
      )}

      {/* Loading State */}
      {active && loading && (
        <div className="frp-loading">
          <Loader2 className="h-8 w-8 frp-spin" />
          <p className="frp-loading-text">Menyusun data dua periode...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="frp-error">
          <AlertCircle className="h-5 w-5" style={{ flexShrink: 0 }} />
          <div>
            <p className="frp-error-title">Gagal memuat laporan</p>
            <p className="frp-error-msg">{error}</p>
          </div>
        </div>
      )}

      {/* Dokumen laporan */}
      {active && !loading && !error && (
        <div ref={printAreaRef} id="financial-comparison-print-area" className="frp-doc">
          <div className="frp-doc-header">
            <OrgLetterhead orgInfo={orgInfo} />

            <h2 className="frp-doc-title">LAPORAN KOMPARASI {active.reportLabel}</h2>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <div className="frp-doc-badge">
                <Calendar size={13} style={{ color: '#9ca3af' }} />
                Periode 1: {p1Label}
              </div>
              <div className="frp-doc-badge">
                <Calendar size={13} style={{ color: '#9ca3af' }} />
                Periode 2: {p2Label}
              </div>
            </div>
          </div>

          <div className="frp-doc-body">
            <table className="frp-table">
              <thead>
                <tr>
                  <th style={{ width: '9%', textAlign: 'center' }}>No Rek</th>
                  <th style={{ width: '31%' }}>Keterangan</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Periode 1</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Periode 2</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Selisih</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => {
                  const isTotalLine = r.lineType === 'C';
                  const t = isTotalLine ? 'total' : '';
                  return (
                    <tr
                      key={r.id}
                      className={isTotalLine ? 'total-line' : ''}
                      style={buildRowBorderStyle(r.overlineStroke, r.underlineStroke)}
                    >
                      <td className={`name-cell ${t}`}>{r.name}</td>
                      <td className={`desc-cell ${t}`}>{r.description}</td>
                      <td className={`amount-cell ${t}`}>{formatRupiah(r.amount1)}</td>
                      <td className={`amount-cell ${t}`}>{formatRupiah(r.amount2)}</td>
                      <td className={`amount-cell ${t}`}>{formatRupiah(r.diff)}</td>
                      <td className={`amount-cell ${t}`}>{formatPct(r.pct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={st.note}>Selisih = Periode 2 − Periode 1. Persentase terhadap nilai Periode 1.</p>
          </div>

          <div className="frp-doc-footer">
            Dicetak secara otomatis dari sistem procureGrid • {new Date().toLocaleDateString('id-ID')}
          </div>
        </div>
      )}

      <FinancialComparisonModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onApply={(params) => setActive(params)}
        token={token}
      />

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 1.2cm; }
          body { background-color: white !important; }
          body * { visibility: hidden; }
          #financial-comparison-print-area, #financial-comparison-print-area * { visibility: visible; }
          #financial-comparison-print-area {
            position: absolute; top: 0; left: 0; width: 100%;
            border: none !important; box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}

const st = {
  note: { fontSize: 11, color: '#6b7280', marginTop: 10 },
};
