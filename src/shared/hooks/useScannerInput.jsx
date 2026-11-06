import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Hook generik untuk input search yang menerima input dari keyboard manual
 * MAUPUN alat scanner fisik (keyboard-wedge).
 *
 * Prinsip kerja:
 * - Setiap keystroke HANYA update tampilan lokal, tidak langsung memicu request.
 * - Setelah idle (tidak ada input baru) selama `idleMs`, baru diputuskan SATU aksi:
 *   - kalau kecepatan input-nya khas scanner (rata-rata antar-karakter sangat cepat)
 *     dan panjangnya cukup → panggil `onScanDetected(value)`
 *   - kalau tidak → anggap ketikan manual → panggil `onManualSearch(value)`
 * - Enter selalu langsung memicu `onScanDetected` (fallback manual/scan lama).
 *
 * Ini menghindari race condition dari banyak request parsial yang saling
 * menimpa hasil satu sama lain saat scan berlangsung cepat.
 */
export function useScannerInput({
  onScanDetected,
  onManualSearch,
  scanMaxAvgMs = 30,
  idleMs = 80,
  minScanLength = 6,
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  const timingRef = useRef({ firstTime: 0, lastTime: 0 });
  const idleTimerRef = useRef(null);

  const resolve = useCallback((raw) => {
    const t = timingRef.current;
    const elapsed = t.lastTime - t.firstTime;
    const avgPerChar = raw.length > 1 ? elapsed / (raw.length - 1) : 999;
    const looksLikeScan = raw.length >= minScanLength && avgPerChar < scanMaxAvgMs;

    if (looksLikeScan) {
      onScanDetected?.(raw);
    } else {
      onManualSearch?.(raw);
    }
  }, [onScanDetected, onManualSearch, scanMaxAvgMs, minScanLength]);

  const handleChange = useCallback((e) => {
    const raw = e.target.value;
    setValue(raw);

    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => resolve(raw), idleMs);
  }, [resolve, idleMs]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(idleTimerRef.current);
      onScanDetected?.(inputRef.current?.value ?? '');
      return;
    }
    if (e.key.length !== 1) return; // abaikan Shift/Backspace/Arrow/dll

    const now = performance.now();
    const t = timingRef.current;
    if (now - t.lastTime > 300) t.firstTime = now; // jeda lama → mulai window baru
    t.lastTime = now;
  }, [onScanDetected]);

  const reset = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    setValue('');
  }, []);

  useEffect(() => () => clearTimeout(idleTimerRef.current), []);

  return { value, inputRef, handleChange, handleKeyDown, reset, setValue };
}