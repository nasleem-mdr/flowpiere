// utils/parseWorkflowHistory.js
// Mengubah activity['history-records'] (teks/HTML dari iDempiere) menjadi entri terstruktur.
//
// Contoh input (satu entri per baris, format node bisa "(Node):" atau "Node:"):
//   Oct 13, 2026, 4:45:54 PM WIB (Start):
//   Oct 13, 2026, 4:45:54 PM WIB (DocPrepare): 900005 - skgAdmin: Total Lines=60000 (#1) - ...
//   Oct 13, 2026, 4:45:54 PM WIB QC Check: IsApproved=Y - Ok barang digudang habis
//   Oct 13, 2026, 4:47:12 PM WIB Purchasing Check:

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, mei: 4, jun: 5, jul: 6,
  aug: 7, agu: 7, agt: 7, sep: 8, oct: 9, okt: 9, nov: 10, dec: 11, des: 11,
};
const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Awal baris = timestamp. Mendukung "Oct 13, 2026, 4:45:54 PM WIB" dan "13 Okt 2026, 16.45.54".
// Zona waktu dibatasi ke daftar yang dikenal agar tidak memakan nama node ("QC Check").
const STAMP_RE = new RegExp(
  '^(' +
    '(?:[A-Za-z]{3,9}\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+[A-Za-z]{3,9}\\.?,?\\s+\\d{4})' +
    ',?\\s+\\d{1,2}[:.]\\d{2}[:.]\\d{2}(?:\\s*[AaPp][Mm])?' +
    '(?:\\s+(?:WIB|WITA|WIT|UTC|GMT(?:[+-]\\d{1,2}(?::?\\d{2})?)?))?' +
  ')\\s*(.*)$'
);

// "(DocPrepare): teks" | "QC Check: teks" | "Purchasing Check:"
const NODE_RE = /^\(?\s*([^():]+?)\s*\)?\s*:\s*(.*)$/;

function parseStamp(raw) {
  const enFirst = raw.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2})[:.](\d{2})[:.](\d{2})\s*([AaPp][Mm])?/);
  const idFirst = enFirst
    ? null
    : raw.match(/(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4}),?\s+(\d{1,2})[:.](\d{2})[:.](\d{2})\s*([AaPp][Mm])?/);

  let monStr, day, year, h, mi, s, ap;
  if (enFirst) [, monStr, day, year, h, mi, s, ap] = enFirst;
  else if (idFirst) [, day, monStr, year, h, mi, s, ap] = idFirst;
  else return { ms: null, dateLabel: '', timeLabel: raw };

  const mon = MONTHS[monStr.slice(0, 3).toLowerCase()];
  if (mon === undefined) return { ms: null, dateLabel: '', timeLabel: raw };

  let hour = Number(h);
  if (ap) {
    const pm = ap.toLowerCase() === 'pm';
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  const pad = (n) => String(n).padStart(2, '0');
  return {
    // Semua entri memakai zona yang sama, jadi selisih tetap akurat walau zona diabaikan.
    ms: Date.UTC(Number(year), mon, Number(day), hour, Number(mi), Number(s)),
    dateLabel: `${Number(day)} ${MONTH_ID[mon]} ${year}`,
    timeLabel: `${pad(hour)}:${mi}:${s}`,
  };
}

// HTML/teks mentah -> teks polos per baris. DOMParser tidak mengeksekusi script,
// jadi aman dipakai menggantikan dangerouslySetInnerHTML.
export function historyToText(raw) {
  if (!raw) return '';
  const withBreaks = String(raw)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|tr|li|h\d)\s*>/gi, '\n')
    .replace(/<\/\s*t[dh]\s*>/gi, ' ');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return (doc.body.textContent || '').replace(/\u00a0/g, ' ');
}

export function formatDuration(ms) {
  const sec = Math.round(ms / 1000);
  if (sec < 1) return '';
  if (sec < 60) return `${sec} dtk`;
  const min = Math.floor(sec / 60);
  if (min < 60) return sec % 60 ? `${min} mnt ${sec % 60} dtk` : `${min} mnt`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return min % 60 ? `${hr} jam ${min % 60} mnt` : `${hr} jam`;
  const day = Math.floor(hr / 24);
  return hr % 24 ? `${day} hr ${hr % 24} jam` : `${day} hr`;
}

/**
 * @returns {{ entries: Array, plainText: string }}
 * entry: { node, note, approved (true|false|null), kind, dateLabel, timeLabel, ms, delta, showDate }
 * kind : 'start' | 'done' | 'approved' | 'rejected' | 'pending'
 */
export function parseWorkflowHistory(raw) {
  const plainText = historyToText(raw).trim();
  if (!plainText) return { entries: [], plainText: '' };

  const draft = [];
  plainText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
    const m = line.match(STAMP_RE);
    if (!m) {
      // Baris lanjutan (catatan multi-baris) -> gabung ke entri sebelumnya
      if (draft.length) draft[draft.length - 1].text += ` ${line}`;
      return;
    }
    const stamp = parseStamp(m[1]);
    const rest = m[2].trim();
    const n = rest.match(NODE_RE);
    draft.push({
      ...stamp,
      node: n ? n[1].trim() : rest || '-',
      text: n ? n[2].trim() : '',
    });
  });

  const entries = draft.map((d, i) => {
    const appr = d.text.match(/IsApproved\s*=\s*([YyNn])/);
    const approved = appr ? appr[1].toUpperCase() === 'Y' : null;
    const note = d.text
      .replace(/IsApproved\s*=\s*[YyNn]/, '')
      .replace(/^\s*[-–—:]\s*/, '')
      .trim();

    const isStart = /^start$/i.test(d.node);
    const isLast = i === draft.length - 1;
    let kind = 'done';
    if (isStart) kind = 'start';
    else if (approved === false) kind = 'rejected';
    else if (approved === true) kind = 'approved';
    else if (isLast && !note) kind = 'pending'; // node terakhir tanpa catatan = masih berjalan

    const prev = draft[i - 1];
    return {
      node: d.node,
      note,
      approved,
      kind,
      ms: d.ms,
      dateLabel: d.dateLabel,
      timeLabel: d.timeLabel,
      showDate: i === 0 || !prev || prev.dateLabel !== d.dateLabel,
      delta: prev && prev.ms != null && d.ms != null ? d.ms - prev.ms : 0,
    };
  });

  return { entries, plainText };
}
