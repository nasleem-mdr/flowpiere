// src/utils/amountInWords.js
import { terbilang } from './terbilang';

export const LANGUAGE_OPTIONS = [
  { code: 'id', label: 'Indonesia' },
  { code: 'en', label: 'English' },
];

// kunci = ISO code (C_Currency.ISO_Code); tambah mata uang lain sesuai kebutuhan
export const CURRENCY_NAMES = {
  IDR: { id: 'rupiah', en: 'rupiah' },
  USD: { id: 'dolar Amerika Serikat', en: 'US dollars' },
  SGD: { id: 'dolar Singapura', en: 'Singapore dollars' },
  EUR: { id: 'euro', en: 'euros' },
  MYR: { id: 'ringgit Malaysia', en: 'Malaysian ringgit' },
};

export const AMOUNT_LABEL = { id: 'Terbilang', en: 'Amount in words' };

export function amountInWords(amount, {
  lang = 'id', currency = 'IDR', decimals = 2, decimalStyle = 'word',
} = {}) {
  const code = String(currency || 'IDR').toUpperCase();
  const unit = CURRENCY_NAMES[code]?.[lang] ?? code; // mata uang tak dikenal -> tulis kodenya
  return terbilang(amount, { lang, unit, decimals, decimalStyle });
}