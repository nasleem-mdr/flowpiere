// hooks/useWorkflowAttachments.js
// Ambil daftar attachment dari dokumen yang melekat pada Workflow Activity,
// plus fungsi untuk mengambil isi file (blob) per attachment.
//   GET /models/<table>/<id>/attachments            -> { attachments: [{ name, contentType }] }
//   GET /models/<table>/<id>/attachments/<fileName> -> binary
import { useState, useCallback, useRef } from 'react';
//import { idempiereApi, idempiereBlob } from '@/api/idempiereApi';
import { getAttachments, idempiereBlob } from '@/api/idempiereApi';

export function useWorkflowAttachments() {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const targetRef = useRef(null);   // { table, id } dokumen aktif
  const reqRef = useRef(0);         // cegah race condition saat ganti dokumen cepat

  const clearAttachments = useCallback(() => {
    reqRef.current += 1;
    targetRef.current = null;
    setAttachments([]);
    setError(null);
    setLoading(false);
  }, []);

  const loadAttachments = useCallback(async (activity) => {
    const table = activity?.['table-name'];
    const id = activity?.record_id;
    if (!table || !id) {
      clearAttachments();
      return;
    }
    const reqId = ++reqRef.current;
    targetRef.current = { table: table.toLowerCase(), id };
    setLoading(true);
    setError(null);
    try {
      const list = await getAttachments(table, id);
      if (reqId !== reqRef.current) return;
      setAttachments(list);
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [clearAttachments]);

  // Ambil isi satu file sebagai Blob (dengan content-type dari daftar attachment).
  const fetchAttachmentBlob = useCallback(async (file) => {
    const t = targetRef.current;
    if (!t) throw new Error('Dokumen tidak dipilih.');
    const blob = await idempiereBlob(
      `/models/${t.table}/${t.id}/attachments/${encodeURIComponent(file.name)}`
    );
    const type = file.contentType || blob.type || 'application/octet-stream';
    return new Blob([blob], { type });
  }, []);

  return { attachments, loading, error, loadAttachments, clearAttachments, fetchAttachmentBlob };
}
