/** ─────────────────────────────────────────────────────────────────────────────
* useAttachments.js
* src/shared/hooks/
*
* Lampiran (AD_Attachment) generik untuk record iDempiere mana pun
* (m_requisition, c_order, m_inout, c_invoice, m_product, ...).
*
*   const att = useAttachments('c_order', orderId, options);
*
* Dua mode, dipilih lewat options.uploadImmediately:
*
*  A) STAGED (default) — untuk form yang MEMBUAT dokumen (Requisition, PO,
*     Shipment, Invoice, ...). Dokumen baru belum punya ID, jadi file yang
*     dipilih ditampung di memori (att.stagedFiles) dan diunggah oleh hook
*     submit dokumen tsb lewat uploadAttachments(tableName, id, files) SETELAH
*     header + baris tersimpan. Kalau recordId sudah ada (edit Draft),
*     lampiran yang sudah tersimpan ikut ditampilkan.
*
*  B) uploadImmediately: true — untuk dokumen yang SUDAH ADA (halaman detail
*     C_Order / M_InOut / C_Invoice). File langsung diunggah begitu dipilih
*     (seperti galeri gambar di ProductDetail).
*
* Batasan REST: lampiran tidak bisa dihapus satu per satu, hanya SEMUA sekaligus.
*
* options:
*   maxMb             — ukuran maks per file (default 5)
*   maxFiles          — maks file per pilihan/dokumen (default 5)
*   accept            — pola seperti atribut <input accept> (default gambar + PDF)
*   uploadImmediately — lihat mode B
* ─────────────────────────────────────────────────────────────────────────────
*/
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getAttachmentBlobUrls, deleteAllAttachments, uploadAttachments } from '@/api/idempiereApi';

export const DEFAULT_ATTACHMENT_ACCEPT = 'image/*,application/pdf';

const revoke  = (f) => { if (f?.url) URL.revokeObjectURL(f.url); };
const isImage = (file) => file.type.startsWith('image/');

// Cocokkan File dengan pola accept: "image/*", "application/pdf", ".xlsx"
const matchesAccept = (file, accept) => {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return accept
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .some((t) => {
      if (t.endsWith('/*')) return type.startsWith(t.slice(0, -1));
      if (t.startsWith('.')) return name.endsWith(t);
      return type === t;
    });
};

export function useAttachments(tableName, recordId, {
  maxMb = 5,
  maxFiles = 5,
  accept = DEFAULT_ATTACHMENT_ACCEPT,
  uploadImmediately = false,
} = {}) {
  const [staged, setStaged]                   = useState([]); // [{ key, file, url|null }]
  const [existing, setExisting]               = useState([]); // [{ name, url, contentType }]
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [deleting, setDeleting]               = useState(false);
  const [uploading, setUploading]             = useState(false);
  const [error, setError]                     = useState(null);

  // Ref supaya cleanup unmount & addFiles selalu membaca nilai terbaru.
  const stagedRef   = useRef([]);
  const existingRef = useRef([]);
  const loadSeq     = useRef(0); // buang hasil fetch lama kalau recordId keburu berganti
  useEffect(() => { stagedRef.current = staged; }, [staged]);
  useEffect(() => { existingRef.current = existing; }, [existing]);
  useEffect(() => () => {
    stagedRef.current.forEach(revoke);
    existingRef.current.forEach(revoke);
  }, []);

  // ── Lampiran yang sudah tersimpan di server ─────────────────────────────
  const loadExisting = useCallback(async () => {
    const seq = ++loadSeq.current;
    if (!tableName || !recordId) {
      setExisting((prev) => { prev.forEach(revoke); return []; });
      setLoadingExisting(false);
      return;
    }
    setLoadingExisting(true);
    try {
      const list = await getAttachmentBlobUrls(tableName, recordId);
      const safe = Array.isArray(list) ? list : [];
      if (seq !== loadSeq.current) { safe.forEach(revoke); return; } // basi
      setExisting((prev) => { prev.forEach(revoke); return safe; });
    } catch (err) {
      console.error(`Gagal mengambil lampiran ${tableName}:`, err);
    } finally {
      if (seq === loadSeq.current) setLoadingExisting(false);
    }
  }, [tableName, recordId]);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  // ── Pilih file → validasi → (staged | langsung unggah) ──────────────────
  const addFiles = useCallback(async (fileList) => {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;

    const problems = [];
    const valid = [];
    for (const file of incoming) {
      if (!matchesAccept(file, accept)) {
        problems.push(`${file.name}: tipe file tidak didukung.`);
      } else if (file.size > maxMb * 1024 * 1024) {
        problems.push(`${file.name}: ukuran maksimal ${maxMb}MB.`);
      } else {
        valid.push(file);
      }
    }

    const room  = uploadImmediately ? maxFiles : Math.max(maxFiles - stagedRef.current.length, 0);
    const toAdd = valid.slice(0, room);
    if (valid.length > toAdd.length) {
      problems.push(`Maksimal ${maxFiles} file ${uploadImmediately ? 'sekali pilih' : 'baru per dokumen'}.`);
    }

    if (toAdd.length === 0) { setError(problems.length ? problems.join('\n') : null); return; }

    // Mode B: dokumen sudah ada → langsung unggah.
    if (uploadImmediately) {
      if (!recordId) {
        setError('Simpan dokumen terlebih dahulu untuk bisa melampirkan file.');
        return;
      }
      setUploading(true);
      try {
        const failures = await uploadAttachments(tableName, recordId, toAdd);
        setError([...problems, ...failures.map((f) => `${f.name}: ${f.error}`)].join('\n') || null);
        await loadExisting();
      } finally {
        setUploading(false);
      }
      return;
    }

    // Mode A: tampung dulu, diunggah saat dokumen disimpan.
    setError(problems.length ? problems.join('\n') : null);
    setStaged((prev) => [
      ...prev,
      ...toAdd.map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        url: isImage(file) ? URL.createObjectURL(file) : null,
      })),
    ]);
  }, [accept, maxMb, maxFiles, uploadImmediately, recordId, tableName, loadExisting]);

  const removeStaged = useCallback((key) => {
    setStaged((prev) => {
      prev.filter((s) => s.key === key).forEach(revoke);
      return prev.filter((s) => s.key !== key);
    });
  }, []);

  // Dipanggil setelah submit sukses / batal edit.
  const clearStaged = useCallback(() => {
    setStaged((prev) => { prev.forEach(revoke); return []; });
    setError(null);
  }, []);

  // REST hanya mendukung hapus SEMUA lampiran record (bukan satuan).
  const deleteExisting = useCallback(async () => {
    if (!recordId) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAllAttachments(tableName, recordId);
      await loadExisting();
    } catch (err) {
      console.error(`Gagal menghapus lampiran ${tableName}:`, err);
      setError(err.message || 'Gagal menghapus lampiran.');
    } finally {
      setDeleting(false);
    }
  }, [tableName, recordId, loadExisting]);

  // Array File murni — dikirim ke submit hook dokumen.
  const stagedFiles = useMemo(() => staged.map((s) => s.file), [staged]);

  return {
    // data
    staged, stagedFiles, existing,
    count: staged.length + existing.length,   // untuk badge tombol 📎
    hasRecord: Boolean(recordId),
    // status
    loadingExisting, deleting, uploading, error,
    // konfigurasi (dibaca AttachmentModal)
    uploadImmediately,
    limits: { maxMb, maxFiles, accept },
    // aksi
    addFiles, removeStaged, clearStaged, deleteExisting,
    reloadExisting: loadExisting,
  };
}
