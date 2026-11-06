import { useEffect, useRef, useState, useCallback } from 'react';
import {
  getPendingRequisitions,
  updatePendingRequisition,
  removePendingRequisition,
} from '@/features/requisition/utils/offlineRequisitionStorage';

/**
 * Menjalankan auto-sync antrean Requisition offline saat koneksi kembali.
 *
 * @param {Function} submit - fungsi submit dari useRequisitionSubmit
 * @param {Function} [onSyncComplete] - (successCount, failCount) => void
 */
export function useOfflineRequisitionSync({ submit, onSyncComplete }) {
  const isSyncingRef = useRef(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    const list = await getPendingRequisitions();
    setPendingCount(list.length);
    return list;
  }, []);

  const runSync = useCallback(async () => {
    // Guard: cegah dua proses sync jalan bersamaan (mis. event 'online'
    // nyala dua kali beruntun, atau mount + online hampir bersamaan).
    // Tanpa ini, item yang sama bisa ke-submit dua kali ke server.
    if (!navigator.onLine || isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);

    let successCount = 0;
    let failCount = 0;

    try {
      const pendingList = await refreshPendingCount();
      if (pendingList.length === 0) return;

      for (const item of pendingList) {
        try {
          const result = await submit(
            item.cart,
            item.requesterName,
            item.warehouseId,
            item.editRequisitionId,
            item.description,
            item.dateRequired,
            item.submitMode,
            {
              // Pakai context yang tersimpan saat item dibuat offline, bukan
              // sesi yang sedang aktif sekarang.
              contextOverride: {
                userId: item.userId,
                orgId: item.orgId,
                clientId: item.clientId,
                docTypeId: item.docTypeId,
              },
              offlineId: item.offlineId,
              onReqIdCreated: (reqId) => {
                updatePendingRequisition(item.offlineId, { editRequisitionId: reqId }).catch(() => {});
              },
            },
          );

          if (result?.success) {
            await removePendingRequisition(item.offlineId);
            successCount += 1;
          } else {
            // Gagal — item TETAP di antrean untuk dicoba lagi nanti.
            // Ini yang memperbaiki bug lama: sebelumnya item selalu dihapus
            // meski submit gagal, karena submit tidak pernah throw.
            failCount += 1;
            await updatePendingRequisition(item.offlineId, {
              retryCount: (item.retryCount || 0) + 1,
              lastError: result?.message || 'unknown-error',
              ...(result?.reqId ? { editRequisitionId: result.reqId } : {}),
            }).catch(() => {});
          }
        } catch (err) {
          failCount += 1;
          console.error(`[useOfflineRequisitionSync] gagal sync ${item.offlineId}:`, err);
          await updatePendingRequisition(item.offlineId, {
            retryCount: (item.retryCount || 0) + 1,
            lastError: err.message,
          }).catch(() => {});
        }
      }
    } finally {
      await refreshPendingCount();
      isSyncingRef.current = false;
      setIsSyncing(false);
      if (successCount > 0 || failCount > 0) {
        onSyncComplete?.(successCount, failCount);
      }
    }
  }, [submit, refreshPendingCount, onSyncComplete]);

  useEffect(() => {
    refreshPendingCount();
    runSync();

    window.addEventListener('online', runSync);
    return () => window.removeEventListener('online', runSync);
  }, [runSync, refreshPendingCount]);

  return { isSyncing, pendingCount, forceSync: runSync };
}
