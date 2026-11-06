// src/features/purchasing/notification/hooks/usePurchasingNotification.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { getModelRecords, fkId } from '@/api/idempiereApi';
import { useAccess } from '@/context/AccessContext'; // TODO: sesuaikan path file AccessContext.jsx

const POLL_MS = 60000;
const WINDOW_KEY = 'purchasing'; // TODO: samakan dengan key window Purchasing di config/windowAccessMap
const SEEN_KEY = 'purchasingNotif:notifiedIds';

const loadSeen = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
  } catch {
    return new Set();
  }
};

const saveSeen = (set) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-500)));
  } catch {
    /* abaikan */
  }
};

// Requisition CO yang masih punya baris belum jadi PO (C_OrderLine_ID kosong)
async function fetchPendingRequisitions() {
  const hdr = await getModelRecords('m_requisition', {
    $filter: "DocStatus eq 'CO'",
    $select: 'M_Requisition_ID,DocumentNo',
    $orderby: 'Updated desc',
    $top: 200,
  });
  const headers = (hdr?.records ?? []).map((r) => ({
    id: r.id ?? fkId(r.M_Requisition_ID),
    documentNo: r.DocumentNo,
  }));
  if (!headers.length) return [];

  const ids = headers.map((h) => h.id).join(',');
  const lines = await getModelRecords('m_requisitionline', {
    $filter: `C_OrderLine_ID eq null and M_Requisition_ID in (${ids})`,
    $select: 'M_Requisition_ID',
    $top: 1000,
  });
  const pendingIds = new Set(
    (lines?.records ?? []).map((l) => fkId(l.M_Requisition_ID))
  );
  return headers.filter((h) => pendingIds.has(h.id));
}

async function showBrowserNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = {
    body,
    icon: '/icons/icon-192.png', // TODO: sesuaikan ikon PWA
    tag: 'purchasing-requisition',
    renotify: true,
  };
  try {
    // PWA / Android Chrome butuh showNotification lewat service worker
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) return reg.showNotification(title, opts);
  } catch {
    /* fallback di bawah */
  }
  new Notification(title, opts);
}

export default function usePurchasingNotification() {
  const { canView } = useAccess();
  // Semua role yang punya akses ke window Purchasing (termasuk atasan, QC, dll)
  const enabled = canView(WINDOW_KEY);

  const [pending, setPending] = useState([]);
  const seenRef = useRef(loadSeen());

  const refresh = useCallback(async () => {
    try {
      const list = await fetchPendingRequisitions();
      setPending(list);

      const seen = seenRef.current;
      const fresh = list.filter((r) => !seen.has(r.id));
      if (fresh.length) {
        fresh.forEach((r) => seen.add(r.id));
        saveSeen(seen);
        const body =
          fresh.length === 1
            ? `FPB ${fresh[0].documentNo} siap diproses Purchasing`
            : `${fresh.length} FPB baru siap diproses Purchasing`;
        showBrowserNotification('Requisition Complete', body);
      }
    } catch (err) {
      console.error('usePurchasingNotification:', err);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setPending([]);
      return undefined;
    }
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  const requestPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }, []);

  return { enabled, count: pending.length, pending, refresh, requestPermission };
}