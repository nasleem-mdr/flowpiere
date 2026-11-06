// ─────────────────────────────────────────────────────────────────────────────
// formatIdentifier.js
// iDempiere REST API mengembalikan `identifier` sebagai gabungan
// `Value_Name` (kode_nama). Kalau Value dan Name sama persis (umum utk
// produk yang Value-nya memang diisi = nama), hasilnya jadi dobel:
// "AIR AKI ISI ULANG @1 LTR_AIR AKI ISI ULANG @1 LTR".
//
// cleanIdentifier() men-dedupe HANYA kalau polanya persis "X_X" (2 bagian,
// identik) — kalau Value & Name BEDA (kasus normal, mis. "SKU001_Air Aki
// Botol 1L"), identifier dibiarkan utuh apa adanya, tidak dipotong.
// ─────────────────────────────────────────────────────────────────────────────
export function cleanIdentifier(identifier) {
  if (!identifier) return identifier;
  const parts = identifier.split('_');
  if (parts.length === 2 && parts[0] === parts[1]) {
    return parts[0];
  }
  return identifier;
}
