import localforage from 'localforage';

// Storage khusus antrean Requisition offline
export const requisitionQueueStorage = localforage.createInstance({
  name: 'IDE_POS_DB',
  storeName: 'pending_requisitions',
  description: 'Antrean transaksi requisition yang dibuat saat offline',
});

/**
 * Simpan transaksi Requisition ke LocalForage saat offline
 */
export const saveRequisitionOffline = async (data) => {
  const offlineId = `OFFLINE-REQ-${Date.now()}`;
  const payload = {
    offlineId,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    lastError: null,
    ...data,
  };
  await requisitionQueueStorage.setItem(offlineId, payload);
  return payload;
};

/**
 * Ambil semua Requisition offline yang belum tersinkronisasi.
 * Diurutkan FIFO (yang paling lama dibuat, disinkronkan duluan) supaya
 * urutan dokumen di server konsisten dengan urutan input user.
 */
export const getPendingRequisitions = async () => {
  const list = [];
  await requisitionQueueStorage.iterate((value) => {
    list.push(value);
  });
  return list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
};

/**
 * Jumlah item yang masih menunggu sync — untuk badge/indikator UI.
 */
export const getPendingRequisitionCount = async () => {
  return requisitionQueueStorage.length();
};

/**
 * Update sebagian field item offline (mis. menyimpan reqId yang sudah
 * sempat terbuat di server sebelum proses gagal di tengah jalan, atau
 * mencatat retryCount/lastError). Ini yang membuat retry menjadi aman
 * (idempotent) — retry berikutnya akan memakai mode edit terhadap reqId
 * yang sudah ada, bukan membuat header baru lagi.
 */
export const updatePendingRequisition = async (offlineId, patch) => {
  const existing = await requisitionQueueStorage.getItem(offlineId);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  await requisitionQueueStorage.setItem(offlineId, updated);
  return updated;
};

/**
 * Hapus item dari antrean offline setelah berhasil di-sync ke server
 */
export const removePendingRequisition = async (offlineId) => {
  await requisitionQueueStorage.removeItem(offlineId);
};
