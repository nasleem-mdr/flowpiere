// src/utils/dateOnly.js
// Tanggal "date-only" (YYYY-MM-DD) berbasis zona waktu LOKAL.
//
// JANGAN pakai new Date().toISOString().split('T')[0] untuk "hari ini": itu UTC —
// di WIB (UTC+7) antara 00:00–07:00 hasilnya masih tanggal KEMARIN.
const pad = (n) => String(n).padStart(2, '0');

export const toLocalISODate = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayLocalISO = () => toLocalISODate(new Date());

// true hanya untuk string "YYYY-MM-DD" yang benar-benar tanggal valid (bukan 2026-02-31)
export const isDateOnly = (s) => {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};

// Nilai tanggal dari REST iDempiere ("2026-10-08" atau timestamp ISO) → "YYYY-MM-DD".
// Mengembalikan '' kalau kosong / tidak terbaca.
//   - Kolom Date disimpan tengah malam → "2026-10-08T00:00:00+07:00" / "...T00:00:00Z":
//     ambil tanggalnya apa adanya (TIDAK dikonversi zona waktu browser, supaya hasilnya sama di mana pun).
//   - Timestamp bukan tengah malam (mis. "2026-10-07T17:00:00Z") → dikonversi ke tanggal lokal.
export const toDateOnly = (value) => {
    if (!value) return '';
    const s = String(value);
    if (isDateOnly(s)) return s;
    const midnight = s.match(/^(\d{4}-\d{2}-\d{2})T00:00(?::00(?:\.0+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/);
    if (midnight && isDateOnly(midnight[1])) return midnight[1];
    const dt = new Date(s);
    return Number.isNaN(dt.getTime()) ? '' : toLocalISODate(dt);
};

// "2026-10-08" → "08/10/2026"
export const formatDateID = (iso) => (isDateOnly(iso) ? iso.split('-').reverse().join('/') : '');