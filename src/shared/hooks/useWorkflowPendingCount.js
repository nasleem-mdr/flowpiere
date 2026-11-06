import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { idempiereApi } from '@/api/idempiereApi';

// Polling cadangan: menangkap perubahan yang dilakukan ORANG LAIN (mis. user
// lain dengan role sama meng-approve activity yang sama) — REST iDempiere
// tidak punya push/websocket, jadi itu hanya bisa dideteksi lewat polling.
// Request-nya ringan ($top=1, cuma butuh "row-count").
const POLL_MS = 20_000;

// ─── Event bus: perubahan workflow yang dilakukan user INI ──────────────────
// Dipanggil dari halaman approval setelah approve/reject/reassign sukses
// (lihat notifyWorkflowChanged di bawah) → badge langsung turun tanpa
// menunggu polling. `listeners` = semua instance hook di tab ini;
// BroadcastChannel meneruskan ke tab lain yang sedang terbuka.
const CHANNEL_NAME = 'workflow-pending-changed';
const listeners = new Set();
let channel = null;

const getChannel = () => {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  channel = new BroadcastChannel(CHANNEL_NAME);
  // Pesan dari tab lain (BroadcastChannel tidak mengirim balik ke pengirimnya).
  channel.onmessage = (e) => listeners.forEach((fn) => fn(e.data || {}));
  return channel;
};

/**
 * Panggil SETELAH aksi workflow berhasil (approve / reject / reassign).
 * @param {{ delta?: number }} [payload]  delta = perubahan optimistis pada badge,
 *   mis. { delta: -1 } untuk satu activity yang selesai diproses. Badge langsung
 *   turun, lalu dikoreksi ke angka sebenarnya dari server lewat refresh.
 */
export function notifyWorkflowChanged(payload = {}) {
  listeners.forEach((fn) => fn(payload));
  try { getChannel()?.postMessage(payload); } catch { /* abaikan */ }
}

export function useWorkflowPendingCount(roleId) {
  const [count, setCount] = useState(0);
  const location = useLocation();
  const aliveRef = useRef(true);
  const reqIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('loginToken')) return;
    const myReq = ++reqIdRef.current;
    try {
      // $top=1 cukup, karena yang dibutuhkan hanya "row-count" (total), bukan isi records.
      const res = await idempiereApi('/workflow?$top=1');
      const total = Number(res?.['row-count'] ?? res?.records?.length ?? 0);
      // Abaikan respons yang sudah basi (ada refresh lebih baru yang dikirim
      // belakangan) supaya angka tidak "loncat balik" ke nilai lama.
      if (aliveRef.current && myReq === reqIdRef.current) {
        setCount(Number.isNaN(total) ? 0 : total);
      }
    } catch (err) {
      console.warn('[useWorkflowPendingCount] gagal:', err);
    }
  }, []);

  // Fetch awal + saat role berganti + saat pindah halaman
  useEffect(() => {
    aliveRef.current = true;
    refresh();
    return () => { aliveRef.current = false; };
  }, [refresh, roleId, location.pathname]);

  // Dengarkan notifyWorkflowChanged (tab ini + tab lain).
  useEffect(() => {
    getChannel();
    const onChange = ({ delta } = {}) => {
      if (typeof delta === 'number') setCount((c) => Math.max(0, c + delta));
      refresh(); // konfirmasi angka sebenarnya dari server
    };
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
  }, [refresh]);

  // Polling, dihentikan saat tab tidak terlihat; refresh lagi saat tab aktif kembali.
  useEffect(() => {
    const tick = () => { if (!document.hidden) refresh(); };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [refresh]);

  return { count, refresh };
}