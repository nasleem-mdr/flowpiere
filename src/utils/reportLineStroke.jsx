// src/shared/utils/reportLineStroke.js
//
// Helper untuk PA_ReportLine.UnderlineStrokeType / OverlineStrokeType
// (AD_Reference_ID=200174), dipakai di 2 tempat:
//   1. CSS (buildRowBorderStyle) — untuk tabel HTML di FinancialReportPage.jsx.
//      Ini juga otomatis ikut ke PDF hasil download karena proses PDF-nya
//      screenshot (html2canvas) dari DOM yang sama.
//   2. jsPDF vector (drawReportLineStroke) — untuk generator PDF berbasis
//      jsPDF (bukan screenshot), kalau suatu saat financial report atau
//      dokumen lain butuh garis ber-style ini digambar langsung sebagai
//      vector (hasil lebih tajam & teks tetap selectable).

export const STROKE_LABELS = {
  SD: 'Solid',
  DS: 'Dashed',
  DT: 'Dotted',
  DSD: 'Double Solid',
  DDS: 'Double Dashed',
  DDT: 'Double Dotted',
};

/**
 * Ubah 1 kode stroke jadi properti border CSS.
 * CSS TIDAK punya border-style native untuk "double dashed"/"double dotted"
 * (cuma solid/dashed/dotted/double) — untuk DDS/DDT ditandai `_double: true`
 * supaya buildRowBorderStyle() menambahkan garis kedua lewat box-shadow.
 *
 * @returns {Object|null} null kalau code kosong/tidak dikenal (tidak ada garis)
 */
function strokeToCssBorder(code, { width = 1, color = '#000' } = {}) {
  if (!code) return null;
  switch (code) {
    case 'SD':  return { borderStyle: 'solid',  borderWidth: `${width}px`, borderColor: color };
    case 'DS':  return { borderStyle: 'dashed', borderWidth: `${width}px`, borderColor: color };
    case 'DT':  return { borderStyle: 'dotted', borderWidth: `${width}px`, borderColor: color };
    case 'DSD': return { borderStyle: 'double', borderWidth: `${width * 3}px`, borderColor: color };
    case 'DDS': return { borderStyle: 'dashed', borderWidth: `${width}px`, borderColor: color, _double: true };
    case 'DDT': return { borderStyle: 'dotted', borderWidth: `${width}px`, borderColor: color, _double: true };
    default:    return null;
  }
}

/**
 * Bangun inline style React untuk 1 baris tabel, dari kode
 * OverlineStrokeType (garis atas) dan UnderlineStrokeType (garis bawah)
 * pada baris PA_ReportLine tersebut. Baris tanpa kode sama sekali tidak
 * mendapat properti border apa pun di sini, jadi border default dari CSS
 * class (mis. `.frp-table tbody tr { border-bottom: ... }`) tetap berlaku.
 *
 * @param {string} overlineCode  - line.overlineStroke
 * @param {string} underlineCode - line.underlineStroke
 * @param {Object} [opts] - { width, color }
 * @returns {Object} React inline style object
 */
export function buildRowBorderStyle(overlineCode, underlineCode, opts = {}) {
  const style = {};
  const shadows = [];

  const top = strokeToCssBorder(overlineCode, opts);
  if (top) {
    style.borderTop = `${top.borderWidth} ${top.borderStyle} ${top.borderColor}`;
    if (top._double) shadows.push(`0 -3px 0 -1px ${top.borderColor}`);
  }

  const bottom = strokeToCssBorder(underlineCode, opts);
  if (bottom) {
    style.borderBottom = `${bottom.borderWidth} ${bottom.borderStyle} ${bottom.borderColor}`;
    if (bottom._double) shadows.push(`0 3px 0 -1px ${bottom.borderColor}`);
  }

  if (shadows.length) style.boxShadow = shadows.join(', ');
  return style;
}

/**
 * Gambar garis underline/overline PA_ReportLine di jsPDF sebagai vector —
 * SEMUA 6 varian (termasuk Double Dashed/Dotted) presisi, tidak ada
 * limitasi seperti versi CSS di atas.
 *
 * PENTING: `textY` di sini HARUS baseline yang sama dipakai untuk
 * `doc.text(label, x, textY)` pada baris itu — JANGAN kirim `y` garis yang
 * sudah kamu hitung sendiri. Fungsi ini yang menghitung offset aman dari
 * baseline (berdasarkan fontSize) supaya garis tidak menembus descender
 * huruf kecil (g/y/p/j) untuk underline, atau cap-height untuk overline.
 * Ini akar masalah "line memotong huruf" — sebelumnya y garis dikirim
 * mentah dari pemanggil dan sering kebetulan segaris dengan badan teks.
 *
 * @param {jsPDF} doc
 * @param {Object} opts
 * @param {number} opts.x1
 * @param {number} opts.x2
 * @param {number} opts.textY     - baseline y teks pada baris ini (sama
 *                                   dengan y yang dipakai di doc.text())
 * @param {number} [opts.fontSize=8] - ukuran font baris ini (pt), dipakai
 *                                   untuk menghitung offset yang proporsional
 * @param {'under'|'over'} [opts.position='under']
 * @param {string} opts.code      - kode UnderlineStrokeType/OverlineStrokeType
 * @param {number} [opts.lineWidth=0.5]
 * @param {number} [opts.gap=1.2] - jarak antar garis untuk varian Double
 */
export function drawReportLineStroke(doc, opts = {}) {
  const {
    x1, x2, textY, code,
    fontSize = 8,
    position = 'under',
    lineWidth = 0.5,
    gap = 1.2,
  } = opts;
  if (!code || textY === undefined) return;

  // Offset dari baseline: underline turun sedikit di bawah descender,
  // overline naik di atas cap-height/ascender — proporsional ke fontSize
  // (bukan angka fixed), supaya tetap aman walau fontSize baris beda-beda
  // (mis. baris total biasanya lebih besar dari baris detail).
  const offset = position === 'under'
    ? fontSize * 0.3
    : -(fontSize * 0.85);
  const y = textY + offset;

  const prevWidth = doc.getLineWidth ? doc.getLineWidth() : undefined;
  doc.setLineWidth(lineWidth);

  const drawSingle = (yy, dash) => {
    doc.setLineDashPattern(dash || [], 0);
    doc.line(x1, yy, x2, yy);
  };

  switch (code) {
    case 'SD':
      drawSingle(y, null);
      break;
    case 'DS':
      drawSingle(y, [3, 2]);
      break;
    case 'DT':
      drawSingle(y, [1, 1]);
      break;
    case 'DSD':
      drawSingle(y - gap / 2, null);
      drawSingle(y + gap / 2, null);
      break;
    case 'DDS':
      drawSingle(y - gap / 2, [3, 2]);
      drawSingle(y + gap / 2, [3, 2]);
      break;
    case 'DDT':
      drawSingle(y - gap / 2, [1, 1]);
      drawSingle(y + gap / 2, [1, 1]);
      break;
    default:
      break;
  }

  doc.setLineDashPattern([], 0); // reset supaya tidak "bocor" ke elemen lain setelahnya
  if (prevWidth !== undefined) doc.setLineWidth(prevWidth);
}