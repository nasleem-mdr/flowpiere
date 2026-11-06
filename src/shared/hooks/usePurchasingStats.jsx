// src/hooks/usePurchasingStats.jsx
import { useState, useEffect, useCallback } from 'react';
import { idempiereApi } from '@/api/idempiereApi'; // sesuaikan path

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function normaliseRecords(data) {
  if (Array.isArray(data))          return data;
  if (Array.isArray(data?.records)) return data.records;
  return [];
}

function sumTotal(records) {
  return (records || []).reduce((s, r) => s + parseFloat(r.GrandTotal || 0), 0);
}

/**
 * usePurchasingStats — statistik Purchase Order (IsSOTrx = false)
 * Default: 30 hari terakhir sampai hari ini
 *
 * Returns: { stats, loading }
 *   stats: { total, count, chartData, from, to }
 */
export default function usePurchasingStats({ days = 30 } = {}) {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now   = new Date();
      const today = toDateStr(now);

      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - (days - 1)); // inklusif hari ini
      const from = toDateStr(startDate);

      const baseFilter = `IsSOTrx eq false and DocStatus eq 'CO'`;
      const filter = `${baseFilter} and DateOrdered ge ${from}T00:00:00Z and DateOrdered le ${today}T23:59:59Z`;

      const res = await idempiereApi(
        `/models/c_order?$filter=${filter}&$select=C_Order_ID,GrandTotal,DateOrdered`
      );
      const records = normaliseRecords(res);

      const total = sumTotal(records);
      const count = records.length;

      // Group per tanggal untuk chart
      const map = {};
      records.forEach(r => {
        const day = (r.DateOrdered || '').split('T')[0];
        if (day) map[day] = (map[day] || 0) + parseFloat(r.GrandTotal || 0);
      });
      const chartData = Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ date, value }));

      setStats({ total, count, chartData, from, to: today });
    } catch (err) {
      console.error('usePurchasingStats error:', err.message);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  return { stats, loading };
}