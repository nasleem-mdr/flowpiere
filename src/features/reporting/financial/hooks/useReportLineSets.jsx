import { useState, useEffect } from 'react';
import { detectPeriodicity } from './detectPeriodicity';

// Cache in-memory per sesi browser tab — hindari deteksi ulang tiap modal dibuka
const periodicityCache = new Map();

export function useReportLineSets(token, baseUrl = '') {
  const [reportLineSets, setReportLineSets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${baseUrl}/api/v1/models/PA_ReportLineSet?$filter=IsActive eq true&$orderby=Name`,
          { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
        );
        if (!res.ok) throw new Error(`Gagal ambil daftar laporan (${res.status})`);
        const json = await res.json();
        const rows = json.records || json.value || [];

        // Klasifikasi tiap report line set secara paralel, pakai cache kalau ada
        const withType = await Promise.all(
          rows.map(async (r) => {
            if (periodicityCache.has(r.id)) {
              return { id: r.id, name: r.Name, isPeriodic: periodicityCache.get(r.id) };
            }
            const detected = await detectPeriodicity(token, baseUrl, r.id);
            periodicityCache.set(r.id, detected);
            return { id: r.id, name: r.Name, isPeriodic: detected }; // null = tidak terdeteksi
          })
        );

        setReportLineSets(withType);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Gagal memuat daftar laporan');
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [token, baseUrl]);

  return { reportLineSets, loading, error };
}

export default useReportLineSets;