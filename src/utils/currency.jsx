import { idempiereApi, fkId } from '@/api/idempiereApi';
// Cache C_Currency_ID → ISO_Code selama sesi aplikasi berjalan — currency
// master data praktis tidak pernah berubah di runtime, jadi aman di-cache
// tanpa invalidation.
const currencyIsoCache = new Map();
// ─────────────────────────────────────────────────────────────────────────────
// currency.js
// Util formatting angka jadi currency string, siap multi-currency.
// Asumsi: kode currency mengikuti ISO_Code iDempiere (C_Currency.ISO_Code),
// mis. 'IDR', 'USD', 'SGD' — sama persis dengan standar ISO 4217, jadi bisa
// dipakai langsung tanpa mapping tambahan.
// ─────────────────────────────────────────────────────────────────────────────

// Locale per currency — menentukan posisi simbol & gaya pemisah ribuan/desimal.
// IDR sengaja pakai 'id-ID' (Rp 1.000.000, bukan Rp 1,000,000).
// Tambahkan mapping lain di sini kalau ada currency baru yang perlu locale
// spesifik; fallback default sudah cukup akurat untuk kebanyakan mata uang.
const LOCALE_BY_CURRENCY = {
  IDR: 'id-ID',
  USD: 'en-US',
  SGD: 'en-SG',
  MYR: 'ms-MY',
  EUR: 'de-DE',
};

// IDR & kebanyakan currency lain di konteks procurement biasanya ditampilkan
// tanpa desimal (pembulatan ke satuan penuh) — override per-currency di sini
// kalau ada yang butuh desimal (mis. USD sering 2 desimal).
const DECIMALS_BY_CURRENCY = {
  IDR: 2,
  USD: 2,
  SGD: 2,
  MYR: 2,
  EUR: 2,
};

/**
 * Format angka jadi string currency.
 * @param {number} amount
 * @param {string} currencyCode - ISO 4217, default 'IDR'
 * @param {object} [opts]
 * @param {number} [opts.decimals] - override jumlah desimal
 * @returns {string} mis. "Rp 5.000.000" atau "$1,250.00"
 */
export async function resolveCurrencyIso(currencyRef) {
  const id = fkId(currencyRef) ?? currencyRef;
  if (!id) return 'IDR';

  if (currencyIsoCache.has(id)) return currencyIsoCache.get(id);

  try {
    const rec = await idempiereApi(`/models/c_currency/${id}?$select=C_Currency_ID,ISO_Code`);
    const iso = rec.ISO_Code || 'IDR';
    currencyIsoCache.set(id, iso);
    return iso;
  } catch (err) {
    console.warn(`[resolveCurrencyIso] gagal resolve currency #${id}:`, err.message);
    return 'IDR';
  }
}

export function formatCurrency(amount, currencyCode = 'IDR', opts = {}) {
  const code    = (currencyCode || 'IDR').toUpperCase();
  const locale  = LOCALE_BY_CURRENCY[code] || 'id-ID';
  const decimals = opts.decimals ?? DECIMALS_BY_CURRENCY[code] ?? 0;
  const safeAmount = Number(amount) || 0;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(safeAmount);
  } catch (err) {
    // Currency code tidak dikenali Intl (jarang terjadi, tapi jaga-jaga
    // kalau ada ISO_Code custom/non-standar di master data) — fallback ke
    // format manual sederhana supaya UI tidak crash.
    console.warn(`[formatCurrency] Intl gagal untuk currency "${code}":`, err.message);
    const rounded = decimals > 0 ? safeAmount.toFixed(decimals) : Math.round(safeAmount);
    return `${code} ${rounded.toLocaleString('id-ID')}`;
  }
}
/**
 * Parse input teks jadi number, dukung desimal (koma sebagai pemisah desimal ala id-ID).
 * "500" -> 500 | "500,5" -> 500.5 | "1.000,5" -> 1000.5 | "0500" -> 500
 */
export const parsePriceInput = (raw) => {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^\d,.-]/g, '');
  // titik dianggap pemisah ribuan (dibuang), koma dianggap pemisah desimal
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
};

export const formatPriceDisplay = (n, { maxDecimals = 2 } = {}) => {
  if (n === '' || n === null || n === undefined) return '';
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: maxDecimals }).format(n);
};