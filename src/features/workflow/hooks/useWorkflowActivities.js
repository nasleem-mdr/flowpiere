// hooks/useWorkflowActivities.js
// Ambil daftar Workflow Activity (node) pending milik user yang sedang login.
// Endpoint: GET /api/v1/workflow  →  { "row-count": n, "nodes": [ ... ] }
// Response tiap node (dari WorkflowResourceImpl):
//   { id, uid, "model-name", "node-name", priority, summary,
//     "node-description", "node-help", "history-records",
//     "table-name", ad_table_id, record_id,
//     "node-approval", "node-confirmation", created }
import { useState, useEffect, useCallback, useRef } from 'react';
import { idempiereApi } from '@/api/idempiereApi';

export function useWorkflowActivities({ autoRefreshMs = 60000 } = {}) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const timerRef = useRef(null);

  const fetchActivities = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await idempiereApi('/workflow');
      const nodes = Array.isArray(res?.nodes) ? res.nodes : [];
      setActivities(nodes);
      setError(null);
      setLastUpdated(new Date());
      return nodes;
    } catch (err) {
      setError(err.message || 'Gagal memuat daftar approval.');
      return [];
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Load awal + auto-refresh silent (jangan ganggu interaksi user).
  useEffect(() => {
    fetchActivities();
    if (autoRefreshMs > 0) {
      timerRef.current = setInterval(() => fetchActivities({ silent: true }), autoRefreshMs);
    }
    return () => clearInterval(timerRef.current);
  }, [fetchActivities, autoRefreshMs]);

  // Buang satu activity dari list — dipanggil setelah approve/reject sukses
  // supaya UI langsung reaktif tanpa menunggu round-trip GET berikutnya.
  const removeActivity = useCallback((id) => {
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { activities, loading, error, lastUpdated, fetchActivities, removeActivity };
}
