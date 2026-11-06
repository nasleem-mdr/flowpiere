import React from 'react';
import { formatCurrency } from '@/utils/currency';

// ─────────────────────────────────────────────────────────────────────────────
// Money.jsx
// Wrapper tipis di atas formatCurrency untuk dipakai langsung di JSX, supaya
// pemanggilan di komponen lain tidak perlu import util + panggil function tiap
// kali (cukup <Money value={po.total} currency={po.CurrencyISO} />).
// Kalau currency tidak di-pass, default IDR (perilaku sama seperti fmtRp lama).
// ─────────────────────────────────────────────────────────────────────────────
const Money = ({ value, currency = 'IDR', decimals, style }) => (
  <span style={style}>{formatCurrency(value, currency, { decimals })}</span>
);

export default Money;