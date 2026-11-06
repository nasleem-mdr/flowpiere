import { useState, useEffect } from 'react';
import { X, FileText, Info } from 'lucide-react';
import { useReportLineSets } from '@/features/reporting/financial/hooks/useReportLineSets';
import '@/css/FinancialReport.css';

export default function FinancialReportModal({ open, onClose, onApply, token }) {
  const { reportLineSets, loading: loadingTypes, error: typesError } = useReportLineSets(open ? token : null);

  const [selectedId, setSelectedId] = useState('');
  const [manualIsPeriodic, setManualIsPeriodic] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  //const selectedType = reportLineSets.find((t) => t.id === selectedId);
  const selectedType = reportLineSets.find((t) => String(t.id) === String(selectedId));
  // isPeriodic hasil deteksi otomatis (true/false), atau null kalau tidak terdeteksi.
  // Kalau null, pakai pilihan manual sebagai fallback.
  const resolvedIsPeriodic =
    selectedType?.isPeriodic !== null && selectedType?.isPeriodic !== undefined
      ? selectedType.isPeriodic
      : manualIsPeriodic;

  // Reset tiap kali modal dibuka
  useEffect(() => {
    if (open) {
      setSelectedId('');
      setManualIsPeriodic(false);
      const today = new Date().toISOString().slice(0, 10);
      const firstOfMonth = new Date();
      firstOfMonth.setDate(1);
      setDateFrom(firstOfMonth.toISOString().slice(0, 10));
      setDateTo(today);
    }
  }, [open]);

  // Auto-select laporan pertama begitu daftar selesai di-fetch
  useEffect(() => {
    if (open && reportLineSets.length > 0 && !selectedId) {
      setSelectedId(reportLineSets[0].id);
    }
  }, [open, reportLineSets, selectedId]);

  if (!open) return null;

  const isValid = selectedType && dateTo && (!resolvedIsPeriodic || dateFrom);

  const handleApply = () => {
    if (!isValid) return;
    onApply({
      reportLineSetId: selectedType.id,
      reportLabel: selectedType.name,
      isPeriodic: resolvedIsPeriodic,
      dateFrom: resolvedIsPeriodic ? dateFrom : undefined,
      dateTo,
    });
    onClose();
  };

  return (
    <div className="frm-overlay">
      <div className="frm-modal">
        <div className="frm-header">
          <div className="frm-header-left">
            <div className="frm-icon-box">
              <FileText size={18} />
            </div>
            <div>
              <h2 className="frm-title">Parameter Laporan Keuangan</h2>
              <p className="frm-subtitle">Tentukan jenis laporan dan periode tanggal</p>
            </div>
          </div>
          <button onClick={onClose} className="frm-close-btn" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        <div className="frm-body">
          {/* Pilihan Jenis Laporan — dari API, pakai dropdown */}
        <div>
          <label className="frm-label" htmlFor="frm-report-select">Jenis Laporan</label>

          {loadingTypes && <p className="frm-subtitle">Memuat daftar laporan...</p>}
          {typesError && <p style={{ color: '#dc2626', fontSize: 12 }}>{typesError}</p>}

          {!loadingTypes && !typesError && (
            <select
              id="frm-report-select"
              className="frm-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={reportLineSets.length === 0}
            >
              {reportLineSets.length === 0 && (
                <option value="">Tidak ada Report Line Set aktif</option>
              )}
              {reportLineSets.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          )}

          {selectedType && (
            <span className={`frm-select-badge ${selectedType.isPeriodic == null ? 'unknown' : ''}`}>
              {selectedType.isPeriodic === true && 'Terdeteksi: Periodik'}
              {selectedType.isPeriodic === false && 'Terdeteksi: Posisi (Cutoff)'}
              {(selectedType.isPeriodic === null || selectedType.isPeriodic === undefined) && 'Tipe tidak terdeteksi'}
            </span>
          )}
        </div>

          {/* Fallback manual — cuma muncul kalau deteksi otomatis gagal */}
          {selectedType && (selectedType.isPeriodic === null || selectedType.isPeriodic === undefined) && (
            <div>
              <label className="frm-label">Tipe Periode (tidak terdeteksi otomatis)</label>
              <div className="frm-type-grid">
                <button
                  type="button"
                  onClick={() => setManualIsPeriodic(false)}
                  className={`frm-type-btn ${!manualIsPeriodic ? 'selected' : ''}`}
                >
                  <p className={`frm-type-name ${!manualIsPeriodic ? 'selected' : ''}`}>Posisi (Cutoff)</p>
                  <p className="frm-type-desc">Saldo per satu tanggal, mis. Neraca</p>
                </button>
                <button
                  type="button"
                  onClick={() => setManualIsPeriodic(true)}
                  className={`frm-type-btn ${manualIsPeriodic ? 'selected' : ''}`}
                >
                  <p className={`frm-type-name ${manualIsPeriodic ? 'selected' : ''}`}>Periodik</p>
                  <p className="frm-type-desc">Rentang tanggal, mis. Laba Rugi</p>
                </button>
              </div>
            </div>
          )}

          <div className="frm-date-section">
            {resolvedIsPeriodic ? (
              <div className="frm-date-grid">
                <div>
                  <label className="frm-field-label">Dari Tanggal</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="frm-input"
                  />
                </div>
                <div>
                  <label className="frm-field-label">Sampai Tanggal</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="frm-input"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="frm-field-label">Per Tanggal (Cutoff)</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="frm-input"
                />
              </div>
            )}

            {!resolvedIsPeriodic && (
              <div className="frm-info">
                <Info size={14} />
                <span>
                  Laporan posisi menyajikan saldo kumulatif dari awal operasional hingga tanggal penutupan yang dipilih.
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="frm-footer">
          <button type="button" onClick={onClose} className="frm-btn-cancel">
            Batal
          </button>
          <button type="button" onClick={handleApply} disabled={!isValid} className="frm-btn-apply">
            Tampilkan Laporan
          </button>
        </div>
      </div>
    </div>
  );
}