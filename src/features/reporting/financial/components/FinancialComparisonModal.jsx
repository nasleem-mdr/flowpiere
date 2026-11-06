import { useState, useEffect } from 'react';
import { X, FileText, Info } from 'lucide-react';
import { useReportLineSets } from '@/features/reporting/financial/hooks/useReportLineSets';
import '@/css/FinancialReport.css';

// Tanggal lokal -> 'YYYY-MM-DD'. toISOString() memakai UTC dan bisa menggeser
// tanggal sehari (mis. WIB dini hari), jadi dipakai format lokal.
const toIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function FinancialComparisonModal({ open, onClose, onApply, token }) {
  const { reportLineSets, loading: loadingTypes, error: typesError } = useReportLineSets(open ? token : null);

  const [selectedId, setSelectedId] = useState('');
  const [manualIsPeriodic, setManualIsPeriodic] = useState(false);
  const [p1From, setP1From] = useState('');
  const [p1To, setP1To] = useState('');
  const [p2From, setP2From] = useState('');
  const [p2To, setP2To] = useState('');

  const selectedType = reportLineSets.find((t) => String(t.id) === String(selectedId));
  // isPeriodic hasil deteksi otomatis (true/false), atau null kalau tidak terdeteksi.
  // Kalau null, pakai pilihan manual sebagai fallback.
  const resolvedIsPeriodic =
    selectedType?.isPeriodic !== null && selectedType?.isPeriodic !== undefined
      ? selectedType.isPeriodic
      : manualIsPeriodic;

  // Reset tiap kali modal dibuka.
  // Default: Periode 1 = bulan lalu penuh, Periode 2 = bulan ini s/d hari ini.
  useEffect(() => {
    if (open) {
      setSelectedId('');
      setManualIsPeriodic(false);
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      setP1From(toIso(new Date(y, m - 1, 1)));
      setP1To(toIso(new Date(y, m, 0)));
      setP2From(toIso(new Date(y, m, 1)));
      setP2To(toIso(now));
    }
  }, [open]);

  // Auto-select laporan pertama begitu daftar selesai di-fetch
  useEffect(() => {
    if (open && reportLineSets.length > 0 && !selectedId) {
      setSelectedId(reportLineSets[0].id);
    }
  }, [open, reportLineSets, selectedId]);

  if (!open) return null;

  const dateError = (() => {
    if (!resolvedIsPeriodic) return null;
    if (p1From && p1To && p1From > p1To) return 'Periode 1: tanggal awal melebihi tanggal akhir.';
    if (p2From && p2To && p2From > p2To) return 'Periode 2: tanggal awal melebihi tanggal akhir.';
    return null;
  })();

  const isValid =
    selectedType &&
    p1To &&
    p2To &&
    (!resolvedIsPeriodic || (p1From && p2From)) &&
    !dateError;

  const handleApply = () => {
    if (!isValid) return;
    onApply({
      reportLineSetId: selectedType.id,
      reportLabel: selectedType.name,
      isPeriodic: resolvedIsPeriodic,
      p1: { dateFrom: resolvedIsPeriodic ? p1From : undefined, dateTo: p1To },
      p2: { dateFrom: resolvedIsPeriodic ? p2From : undefined, dateTo: p2To },
    });
    onClose();
  };

  // Satu blok input tanggal untuk satu periode
  const renderPeriod = (title, from, setFrom, to, setTo) => (
    <div className="frm-date-section">
      <label className="frm-label">{title}</label>
      {resolvedIsPeriodic ? (
        <div className="frm-date-grid">
          <div>
            <label className="frm-field-label">Dari Tanggal</label>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="frm-input"
            />
          </div>
          <div>
            <label className="frm-field-label">Sampai Tanggal</label>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="frm-input"
            />
          </div>
        </div>
      ) : (
        <div>
          <label className="frm-field-label">Per Tanggal (Cutoff)</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="frm-input"
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="frm-overlay">
      <div className="frm-modal">
        <div className="frm-header">
          <div className="frm-header-left">
            <div className="frm-icon-box">
              <FileText size={18} />
            </div>
            <div>
              <h2 className="frm-title">Parameter Laporan Komparasi</h2>
              <p className="frm-subtitle">Pilih laporan, lalu tentukan dua periode yang dibandingkan</p>
            </div>
          </div>
          <button onClick={onClose} className="frm-close-btn" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        <div className="frm-body">
          {/* Pilihan Jenis Laporan — dari API, pakai dropdown */}
          <div>
            <label className="frm-label" htmlFor="frm-cmp-report-select">Jenis Laporan</label>

            {loadingTypes && <p className="frm-subtitle">Memuat daftar laporan...</p>}
            {typesError && <p style={{ color: '#dc2626', fontSize: 12 }}>{typesError}</p>}

            {!loadingTypes && !typesError && (
              <select
                id="frm-cmp-report-select"
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

          {renderPeriod('Periode 1 (pembanding)', p1From, setP1From, p1To, setP1To)}
          {renderPeriod('Periode 2', p2From, setP2From, p2To, setP2To)}

          {dateError && <p style={{ color: '#dc2626', fontSize: 12, margin: 0 }}>{dateError}</p>}

          <div className="frm-info">
            <Info size={14} />
            <span>
              Selisih = Periode 2 − Periode 1, dan persentase dihitung terhadap nilai Periode 1.
              {!resolvedIsPeriodic &&
                ' Laporan posisi menyajikan saldo kumulatif sampai tanggal yang dipilih pada masing-masing periode.'}
            </span>
          </div>
        </div>

        <div className="frm-footer">
          <button type="button" onClick={onClose} className="frm-btn-cancel">
            Batal
          </button>
          <button type="button" onClick={handleApply} disabled={!isValid} className="frm-btn-apply">
            Tampilkan Komparasi
          </button>
        </div>
      </div>
    </div>
  );
}
