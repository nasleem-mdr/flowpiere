import { useState, useEffect } from 'react';
import { idempiereApi } from '@/api/idempiereApi';

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function sumTotal(records) {
  return (records || []).reduce((s, r) => s + parseFloat(r.GrandTotal || 0), 0);
}

function sumQty(records) {
  return (records || []).reduce((s, r) => s + parseFloat(r.QtyOrdered || 0), 0);
}

function extractIds(records) {
  return (records || [])
    .map(r => {
      if (r.id)                             return r.id;
      if (r.C_Order_ID?.id)                 return r.C_Order_ID.id;
      if (typeof r.C_Order_ID === 'number') return r.C_Order_ID;
      return null;
    })
    .filter(id => id !== null && id !== undefined);
}

function normaliseRecords(data) {
  if (Array.isArray(data))          return data;
  if (Array.isArray(data?.records)) return data.records;
  return [];
}

/**
 * useDashboardStats — fetch statistik penjualan hari ini, kemarin, dan bulan ini
 * Returns: { stats, loading }
 *   stats: { todaySales, yesterdaySales, todayQty, yesterdayQty, monthChart }
 */
export default function useDashboardStats() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const now          = new Date();
        const today        = toDateStr(now);
        const yd           = new Date(now); yd.setDate(yd.getDate() - 1);
        const yesterday    = toDateStr(yd);
        const firstOfMonth = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
        const baseFilter   = `IsSOTrx eq true and DocStatus eq 'CO'`;

        // ── Fetch order hari ini, kemarin, dan bulan ini ──────────────
        const [resToday, resYday, resMonth] = await Promise.all([
          idempiereApi(`/models/c_order?$filter=${baseFilter} and DateOrdered ge ${today}T00:00:00Z and DateOrdered le ${today}T23:59:59Z&$select=C_Order_ID,GrandTotal`),
          idempiereApi(`/models/c_order?$filter=${baseFilter} and DateOrdered ge ${yesterday}T00:00:00Z and DateOrdered le ${yesterday}T23:59:59Z&$select=C_Order_ID,GrandTotal`),
          idempiereApi(`/models/c_order?$filter=${baseFilter} and DateOrdered ge ${firstOfMonth}T00:00:00Z and DateOrdered le ${today}T23:59:59Z&$select=GrandTotal,DateOrdered`),
        ]);

        const todayRecords     = normaliseRecords(resToday);
        const yesterdayRecords = normaliseRecords(resYday);
        const monthRecords     = normaliseRecords(resMonth);

        const todaySales     = sumTotal(todayRecords);
        const yesterdaySales = sumTotal(yesterdayRecords);

        // ── Monthly chart: group by date ──────────────────────────────
        const monthMap = {};
        monthRecords.forEach(r => {
          const day = (r.DateOrdered || '').split('T')[0];
          if (day) monthMap[day] = (monthMap[day] || 0) + parseFloat(r.GrandTotal || 0);
        });
        const monthChart = Object.entries(monthMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, value]) => ({ date, value }));

        // ── Qty: fetch c_orderline berdasarkan order IDs ───────────────
        const todayIds     = extractIds(todayRecords);
        const yesterdayIds = extractIds(yesterdayRecords);

        let todayQty = 0, yesterdayQty = 0;

        if (todayIds.length > 0) {
          const filter = todayIds.map(id => `C_Order_ID eq ${id}`).join(' or ');
          const res    = await idempiereApi(`/models/c_orderline?$filter=${filter}&$select=QtyOrdered`);
          todayQty     = sumQty(normaliseRecords(res));
        }

        if (yesterdayIds.length > 0) {
          const filter  = yesterdayIds.map(id => `C_Order_ID eq ${id}`).join(' or ');
          const res     = await idempiereApi(`/models/c_orderline?$filter=${filter}&$select=QtyOrdered`);
          yesterdayQty  = sumQty(normaliseRecords(res));
        }

        setStats({ todaySales, yesterdaySales, monthChart, todayQty, yesterdayQty });

      } catch (err) {
        console.error('Dashboard load error:', err.message);
        setStats(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return { stats, loading };
}