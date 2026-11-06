// src/shared/hooks/useSchemaCapability.js
import { useState, useEffect, useCallback } from 'react';
import { idempiereApi } from '@/api/idempiereApi';

// ─────────────────────────────────────────────────────────────────────────────
// useSchemaCapability.js
// Cek apakah sebuah kolom (custom atau standar) tersedia di suatu tabel pada
// instance iDempiere yang sedang aktif. Dipakai untuk fitur yang TIDAK selalu
// ada di semua instance (kolom custom seperti C_BankAccount_ID di C_Invoice,
// atau field lain yang berbeda antar deployment).
//
// Hasil di-cache secara module-level (Map, bukan per-komponen) — begitu satu
// komponen manapun sudah pernah cek "c_invoice.C_BankAccount_ID", komponen
// lain yang butuh info sama TIDAK akan nge-probe ulang ke server, cukup baca
// dari cache. Cache ini hidup selama sesi browser tab terbuka (reset kalau
// reload halaman) — cukup untuk kasus ini karena struktur tabel di iDempiere
// jarang berubah di runtime.
// ─────────────────────────────────────────────────────────────────────────────

const capabilityCache = new Map(); // key: "table.column" → Promise<boolean>

function probeColumn(table, column) {
  const cacheKey = `${table}.${column}`;

  if (!capabilityCache.has(cacheKey)) {
    const probePromise = idempiereApi(`/models/${table}?$select=${column}&$top=1`)
      .then(() => true)
      .catch(err => {
        console.warn(`[useColumnSupport] ${cacheKey} tidak tersedia di instance ini:`, err.message);
        return false;
      });
    capabilityCache.set(cacheKey, probePromise);
  }

  return capabilityCache.get(cacheKey);
}

/**
 * Cek satu kolom di satu tabel.
 * @returns {boolean|null} null = masih loading, true/false = hasil (di-cache antar komponen)
 */
export function useColumnSupport(table, column) {
  const [supported, setSupported] = useState(() => {
    // kalau sudah pernah di-resolve sebelumnya (cache promise sudah settle),
    // state awal bisa langsung ambil racing sederhana — tetap null dulu,
    // effect di bawah yang akan set nilai final dengan benar.
    return null;
  });

  useEffect(() => {
    let cancelled = false;
    probeColumn(table, column).then(result => {
      if (!cancelled) setSupported(result);
    });
    return () => { cancelled = true; };
  }, [table, column]);

  return supported;
}

/**
 * Cek beberapa kolom sekaligus di satu tabel — berguna kalau satu fitur
 * bergantung ke beberapa kolom custom sekaligus (mis. C_BankAccount_ID DAN
 * POAmount custom di C_Invoice yang sama).
 * @returns {Object|null} { [column]: boolean, ... } — null selama masih loading salah satu
 */
export function useColumnsSupport(table, columns = []) {
  const [result, setResult] = useState(null);
  const columnsKey = columns.join(',');

  useEffect(() => {
    let cancelled = false;
    Promise.all(columns.map(col => probeColumn(table, col).then(ok => [col, ok])))
      .then(pairs => {
        if (!cancelled) setResult(Object.fromEntries(pairs));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, columnsKey]);

  return result;
}

/**
 * Untuk kasus non-hook (mis. dipanggil dari dalam submit handler / hook lain
 * yang bukan komponen React) — langsung dapat Promise<boolean>, tetap
 * memanfaatkan cache yang sama.
 */
export function checkColumnSupport(table, column) {
  return probeColumn(table, column);
}