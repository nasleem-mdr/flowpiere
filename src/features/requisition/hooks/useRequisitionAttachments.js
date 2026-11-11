/** src/features/requisition/hooks/useRequisitionAttachments.js
* ─────────────────────────────────────────────────────────────────────────────
* Lampiran (gambar / PDF) untuk dokumen Requisition, disimpan di AD_Attachment
* milik M_Requisition. Konsepnya sama dengan Gambar Produk di ProductDetail,
* dengan satu perbedaan penting:
*
*   M_Requisition_ID BARU ADA setelah header dibuat saat submit. Jadi file yang
*   dipilih user ditampung dulu di state lokal ("staged") dan baru diunggah oleh
*   useRequisitionSubmit begitu header + baris tersimpan (lihat patch di sana).
*
*   Untuk dokumen Draft yang sedang diedit (requisitionId sudah ada), lampiran
*   yang SUDAH tersimpan di server ikut ditampilkan ("existing"). File baru
*   yang dipilih saat edit tetap di-stage dan diunggah saat Simpan/Complete.
*
* Bergantung pada 3 helper generik di '@/api/idempiereApi' (lihat catatan
* pembuatan helper tersebut dari versi ProductDetail):
*   getAttachmentBlobUrls(tableName, recordId) → [{ name, url, contentType? }]
*   deleteAllAttachments(tableName, recordId)
* (uploadAttachment dipakai di useRequisitionSubmit, bukan di sini.)
* ─────────────────────────────────────────────────────────────────────────────
*/
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getAttachmentBlobUrls, deleteAllAttachments } from '@/api/idempiereApi';

export const REQUISITION_ATTACHMENT_TABLE = 'm_requisition';
export const ATTACHMENT_MAX_MB    = 25;
export const ATTACHMENT_MAX_FILES = 5; // per dokumen, sekali submit (menjaga ukuran antrean offline)
export const ATTACHMENT_ACCEPT    = 'image/*,application/pdf';

const revoke  = (f) => { if (f?.url) URL.revokeObjectURL(f.url); };
const isImage = (file) => file.type.startsWith('image/');

export function useRequisitionAttachments(requisitionId) {
  const [staged, setStaged]                   = useState([]); // [{ key, file, url|null }]
  const [existing, setExisting]               = useState([]); // [{ name, url, contentType? }]
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [deleting, setDeleting]               = useState(false);
  const [error, setError]                     = useState(null);

  // Ref supaya cleanup unmount & addFiles selalu membaca nilai terbaru.
  const stagedRef   = useRef([]);
  const existingRef = useRef([]);
  useEffect(() => { stagedRef.current = staged; }, [staged]);
  useEffect(() => { existingRef.current = existing; }, [existing]);
  useEffect(() => () => {
    stagedRef.current.forEach(revoke);
    existingRef.current.forEach(revoke);
  }, []);

  // ── Lampiran yang sudah tersimpan di server (hanya kalau dokumen sudah ada) ─
  const loadExisting = useCallback(async () => {
    if (!requisitionId) {
      setExisting((prev) => { prev.forEach(revoke); return []; });
      return;
    }
    setLoadingExisting(true);
    try {
      const list = await getAttachmentBlobUrls(REQUISITION_ATTACHMENT_TABLE, requisitionId);
      setExisting((prev) => { prev.forEach(revoke); return Array.isArray(list) ? list : []; });
    } catch (err) {
      console.error('Gagal mengambil lampiran requisition:', err);
    } finally {
      setLoadingExisting(false);
    }
  }, [requisitionId]);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  // ── Pilih file → validasi → masuk staged ──────────────────────────────────
  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;

    const problems = [];
    const valid = [];
    for (const file of incoming) {
      if (!isImage(file) && file.type !== 'application/pdf') {
        problems.push(`${file.name}: hanya gambar (JPG, PNG, dll) atau PDF.`);
      } else if (file.size > ATTACHMENT_MAX_MB * 1024 * 1024) {
        problems.push(`${file.name}: ukuran maksimal ${ATTACHMENT_MAX_MB}MB.`);
      } else {
        valid.push(file);
      }
    }

    const room  = Math.max(ATTACHMENT_MAX_FILES - stagedRef.current.length, 0);
    const toAdd = valid.slice(0, room);
    if (valid.length > toAdd.length) {
      problems.push(`Maksimal ${ATTACHMENT_MAX_FILES} file baru per dokumen.`);
    }

    setError(problems.length ? problems.join('\n') : null);
    if (toAdd.length === 0) return;

    setStaged((prev) => [
      ...prev,
      ...toAdd.map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        url: isImage(file) ? URL.createObjectURL(file) : null,
      })),
    ]);
  }, []);

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

  // API hanya mendukung hapus SEMUA lampiran dokumen (bukan satuan).
  const deleteExisting = useCallback(async () => {
    if (!requisitionId) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAllAttachments(REQUISITION_ATTACHMENT_TABLE, requisitionId);
      await loadExisting();
    } catch (err) {
      console.error('Gagal menghapus lampiran requisition:', err);
      setError(err.message || 'Gagal menghapus lampiran.');
    } finally {
      setDeleting(false);
    }
  }, [requisitionId, loadExisting]);

  // Array File murni — ini yang dikirim ke submit({ attachments }).
  const stagedFiles = useMemo(() => staged.map((s) => s.file), [staged]);

  return {
    staged, stagedFiles, existing,
    loadingExisting, deleting, error,
    addFiles, removeStaged, clearStaged, deleteExisting,
    reloadExisting: loadExisting,
  };
}
