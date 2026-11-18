// src/features/purchasing/notification/hooks/usePurchasingNotification.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { getModelRecords, fkId } from '@/api/idempiereApi';
import { useAccess } from '@/context/AccessContext'; // TODO: sesuaikan path file AccessContext.jsx
import { getLoginInfo } from '@/shared/hooks/useLoginInfo';

const POLL_MS = 60000;
//const WINDOW_KEY = 'purchasing'; // TODO: samakan dengan key window Purchasing di config/windowAccessMap
const NOTIFY_ROLE_NAMES = ['Purchasing'];
const SEEN_KEY = 'purchasingNotif:notifiedIds';
const normalize = (s) => String(s ?? '').trim().toLowerCase();

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
async function resolveRoleName() {
  const { roleId } = getLoginInfo();
  if (!roleId) return '';

  try {
    const c = JSON.parse(localStorage.getItem('RoleNameCache') || 'null');
    if (c?.roleId === roleId && c.name) return c.name;
  } catch { /* abaikan */ }

  try {
    const res = await getModelRecords('ad_role', {
      $filter: `AD_Role_ID eq ${roleId}`,
      $select: 'AD_Role_ID,Name',
      $top: 1,
    });
    const rec = res?.records?.[0];
    // pastikan record yang kembali memang role yang diminta
    if (!rec || (rec.id ?? fkId(rec.AD_Role_ID)) !== roleId) return '';
    localStorage.setItem('RoleNameCache', JSON.stringify({ roleId, name: rec.Name }));
    return rec.Name;
  } catch (err) {
    console.error('usePurchasingNotification: gagal ambil nama role', err);
    return '';
  }
}
export default function usePurchasingNotification() {
  const [roleName, setRoleName] = useState('');
  const [pending, setPending] = useState([]);
  const seenRef = useRef(loadSeen());
  useEffect(() => {
    if (roleName) return;
    let cancelled = false;
    resolveRoleName().then((n) => {
      if (!cancelled) setRoleName(n);
    });
    return () => {
      cancelled = true;
    };
  }, [roleName]);

  const enabled = NOTIFY_ROLE_NAMES.some((r) => normalize(r) === normalize(roleName));

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const list = await fetchPendingRequisitions();
      setPending(list);
      if (!list.length) closeBrowserNotifications();
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
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setPending([]);
      return undefined;
    }
    const onTrigger = () => refresh();
    window.addEventListener(PURCHASING_REFRESH_EVENT, onTrigger);
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(PURCHASING_REFRESH_EVENT, onTrigger);
    };
  }, [enabled, refresh]);

  const requestPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }, []);
  

  return { enabled, count: pending.length, pending, refresh, requestPermission };
}
export const PURCHASING_REFRESH_EVENT = 'purchasing:refresh';
export const triggerPurchasingRefresh = () =>
  window.dispatchEvent(new Event(PURCHASING_REFRESH_EVENT));

async function closeBrowserNotifications() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const list = await reg?.getNotifications({ tag: 'purchasing-requisition' });
    list?.forEach((n) => n.close());
  } catch {
    /* abaikan */
  }
}