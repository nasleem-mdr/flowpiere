import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
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
import { useFinancialReport } from '@/features/reporting/financial/hooks/useFinancialReport';
import { useOrgInfo } from '@/shared/hooks/useOrgInfo';
import OrgLetterhead from '@/shared/components/pdf/OrgLetterhead';
import { buildRowBorderStyle } from '@/utils/reportLineStroke';
import FinancialReportModal from '@/features/reporting/financial/components/FinancialReportModal';
import '@/css/FinancialReport.css';

function formatRupiah(amount) {
  const value = Math.round(amount || 0);
  const formatted = Math.abs(value).toLocaleString('id-ID');
  return value < 0 ? `(${formatted})` : formatted;
}

export default function FinancialReportPage({ token, acctSchemaId }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeParams, setActiveParams] = useState(null);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const printAreaRef = useRef(null);

  const { orgInfo } = useOrgInfo(); // pakai org dari sesi login yang sedang aktif

  const { reportLines, loading, error } = useFinancialReport({
    reportLineSetId: activeParams?.reportLineSetId,
    acctSchemaId,
    dateFrom: activeParams?.dateFrom,
    dateTo: activeParams?.dateTo,
    mode: activeParams?.isPeriodic ? 'labarugi' : 'neraca',
    token,
  });

  const activeTypeLabel = activeParams?.reportLabel;
  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    const { default: html2canvas } = await import('html2canvas');
    const { jsPDF } = await import('jspdf');

    const canvas = await html2canvas(printAreaRef.current, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight);
    pdf.save(`${activeParams?.reportLabel || 'laporan'}-${activeParams?.dateTo}.pdf`);
  };

  const handleDownloadExcel = async () => {
    if (!activeParams) return;
    setDownloadingExcel(true);
    try {
      const XLSX = await import('xlsx');

      const periodLabel = activeParams.isPeriodic
        ? `Periode ${activeParams.dateFrom} s/d ${activeParams.dateTo}`
        : `Per ${activeParams.dateTo}`;

      const sortedLines = reportLines.slice().sort((a, b) => a.seqNo - b.seqNo);

      // Kop ringkas (nama org + judul + periode) di baris paling atas sheet,
      // datanya dari orgInfo yang sama dipakai kop PDF/HTML — tidak di-hardcode.
      const aoa = [
        [orgInfo?.name || ''],
        [`LAPORAN ${activeTypeLabel || ''}`],
        [periodLabel],
        [],
        ['No Rek', 'Keterangan', 'Jumlah'],
        ...sortedLines.map((line) => [line.name, line.description, line.amount]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 12 }, { wch: 50 }, { wch: 18 }];
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Laporan');
      XLSX.writeFile(wb, `${activeParams?.reportLabel || 'laporan'}-${activeParams?.dateTo}.xlsx`);
    } catch (err) {
      console.error('Gagal membuat Excel:', err.message);
      alert('Gagal membuat file Excel.');
    } finally {
      setDownloadingExcel(false);
    }
  };

  return (
    <div className="frp-page">
      {/* Toolbar */}
      <div className="frp-toolbar print:hidden">
        <div className="frp-toolbar-left">
          <div className="frp-toolbar-icon">
            <FileBarChart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="frp-toolbar-title">Laporan Keuangan</h1>
            <p className="frp-toolbar-subtitle">Kelola dan unduh laporan finansial perusahaan</p>
          </div>
        </div>

        <div className="frp-toolbar-actions">
          <button onClick={() => setModalOpen(true)} className="frp-btn-primary">
            <FileBarChart size={16} />
            Pilih Laporan
          </button>
          <Link to={"/financial-comparasion"} className="frp-btn-primary">
            <FileBarChart size={16} />
            Laporan Komparasi
          </Link>

          {activeParams && (
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
      {!activeParams && (
        <div className="frp-empty">
          <div className="frp-empty-icon">
            <FileText className="h-7 w-7" />
          </div>
          <h3 className="frp-empty-title">Belum ada laporan terpilih</h3>
          <p className="frp-empty-desc">
            Klik tombol di bawah untuk memilih jenis laporan dan rentang periode yang ingin ditampilkan.
          </p>
          <button onClick={() => setModalOpen(true)} className="frp-empty-btn">
            Pilih Laporan Sekarang
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="frp-loading">
          <Loader2 className="h-8 w-8 frp-spin" />
          <p className="frp-loading-text">Menyusun data laporan...</p>
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

      {/* Main Report Document */}
      {!loading && !error && activeParams && (
        <div ref={printAreaRef} id="financial-report-print-area" className="frp-doc">
          <div className="frp-doc-header">
            {/* Kop surat — komponen sama yang bisa dipakai di semua laporan HTML,
                layout & datanya selaras dengan drawLetterhead() di renderDocumentPDF.jsx */}
            <OrgLetterhead orgInfo={orgInfo} />

            <h2 className="frp-doc-title">LAPORAN {activeTypeLabel}</h2>
            <div className="frp-doc-badge">
              <Calendar size={13} style={{ color: '#9ca3af' }} />
              {activeParams.isPeriodic
                ? `Periode ${activeParams.dateFrom} s/d ${activeParams.dateTo}`
                : `Per ${activeParams.dateTo}`}
            </div>
          </div>

          <div className="frp-doc-body">
            <table className="frp-table">
            <thead>
              <tr>
                <th style={{ width: '10%', textAlign:'center' }}>No Rek</th>
                <th style={{ width: '55%' }}>Keterangan</th>
                <th style={{ width: '35%' }}>Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {reportLines
                .slice()
                .sort((a, b) => a.seqNo - b.seqNo)
                .map((line) => {
                  const isTotalLine = line.lineType === 'C';
                  return (
                    <tr
                      key={line.id}
                      className={isTotalLine ? 'total-line' : ''}
                      style={buildRowBorderStyle(line.overlineStroke, line.underlineStroke)}
                    >
                      <td className={`name-cell ${isTotalLine ? 'total' : ''}`}>{line.name}</td>
                      <td className={`desc-cell ${isTotalLine ? 'total' : ''}`}>{line.description}</td>
                      <td className={`amount-cell ${isTotalLine ? 'total' : ''}`}>
                        {formatRupiah(line.amount)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            </table>
          </div>

          <div className="frp-doc-footer">
            Dicetak secara otomatis dari sistem procureGrid • {new Date().toLocaleDateString('id-ID')}
          </div>
        </div>
      )}

      <FinancialReportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onApply={(params) => setActiveParams(params)}
        token={token}
      />

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 1.5cm;
          }
          body {
            background-color: white !important;
          }
          body * {
            visibility: hidden;
          }
          #financial-report-print-area, #financial-report-print-area * {
            visibility: visible;
          }
          #financial-report-print-area {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            border: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}