// src/utils/terbilang.js
const MAX = 999_999_999_999_999; // batas aman (< 1 kuadriliun)

/* ---------- Bahasa Indonesia ---------- */
const ID_SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam',
  'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
const ID_SKALA = [[1e12, 'triliun'], [1e9, 'miliar'], [1e6, 'juta'], [1e3, 'ribu']];
const ID_DIGIT = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan'];

function idEja(n) {
  if (n < 12) return ID_SATUAN[n];
  if (n < 20) return `${ID_SATUAN[n - 10]} belas`;
  if (n < 100) return `${ID_SATUAN[Math.floor(n / 10)]} puluh ${ID_SATUAN[n % 10]}`;
  if (n < 200) return `seratus ${idEja(n - 100)}`;
  if (n < 1000) return `${ID_SATUAN[Math.floor(n / 100)]} ratus ${idEja(n % 100)}`;
  for (const [nilai, nama] of ID_SKALA) {
    if (n >= nilai) {
      const depan = Math.floor(n / nilai);
      const awal = nilai === 1e3 && depan === 1 ? 'seribu' : `${idEja(depan)} ${nama}`;
      return `${awal} ${idEja(n % nilai)}`;
    }
  }
  return '';
}

/* ---------- English ---------- */
const EN_ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const EN_SKALA = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];

function enBelow1000(n) {
  const parts = [];
  if (n >= 100) {
    parts.push(`${EN_ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) parts.push(EN_TENS[Math.floor(n / 10)] + (n % 10 ? `-${EN_ONES[n % 10]}` : ''));
  else if (n > 0) parts.push(EN_ONES[n]);
  return parts.join(' ');
}

function enEja(n) {
  const parts = [];
  for (const [nilai, nama] of EN_SKALA) {
    if (n >= nilai) {
      parts.push(`${enBelow1000(Math.floor(n / nilai))} ${nama}`);
      n %= nilai;
    }
  }
  if (n > 0) parts.push(enBelow1000(n));
  return parts.join(' ');
}

/* ---------- Kamus per bahasa ---------- */
const BAHASA = {
  id: { nol: 'nol', minus: 'minus', koma: 'koma', dan: 'dan', unit: 'rupiah',
    digit: ID_DIGIT, eja: idEja },
  en: { nol: 'zero', minus: 'minus', koma: 'point', dan: 'and', unit: 'rupiah',
    digit: EN_ONES.slice(0, 10), eja: enEja },
};

/**
 * @param {number|string} amount
 * @param {object}  opts
 * @param {'id'|'en'} opts.lang          bahasa (default 'id')
 * @param {string}  opts.unit            nama mata uang, mis. 'rupiah' / 'US dollars'
 * @param {number}  opts.decimals        jumlah digit desimal yang dibaca (default 2)
 * @param {'word'|'fraction'} opts.decimalStyle
 *        'word'     -> "... koma lima nol rupiah" / "... point five zero rupiah"
 *        'fraction' -> "... dan 50/100 rupiah"   / "... and 50/100 rupiah"
 * @param {boolean} opts.capitalize      huruf kapital di awal (default true)
 */
export function terbilang(amount, {
  lang = 'id', unit, decimals = 2, decimalStyle = 'word', capitalize = true,
} = {}) {
  const t = BAHASA[lang] || BAHASA.id;
  const value = Number(amount) || 0;
  const [intStr, fracStr = ''] = Math.abs(value).toFixed(decimals).split('.');
  const n = Number(intStr);
  if (n > MAX) return String(amount); // terlalu besar, jangan salah baca

  let kata = n === 0 ? t.nol : t.eja(n);
  if (/[1-9]/.test(fracStr)) {
    kata += decimalStyle === 'fraction'
      ? ` ${t.dan} ${fracStr}/${10 ** decimals}`
      : ` ${t.koma} ${[...fracStr].map((d) => t.digit[Number(d)]).join(' ')}`;
  }

  const sufiks = unit ?? t.unit;
  let hasil = `${value < 0 ? `${t.minus} ` : ''}${kata} ${sufiks}`
    .replace(/\s+/g, ' ')
    .trim();
  if (capitalize) hasil = hasil.charAt(0).toUpperCase() + hasil.slice(1);
  return hasil;
}