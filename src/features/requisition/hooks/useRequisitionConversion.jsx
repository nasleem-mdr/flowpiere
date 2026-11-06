// src/hooks/useRequisitionConversion.jsx
import { useState, useEffect } from 'react';
import { idempiereApi } from '@/api/idempiereApi';

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

export default function useRequisitionConversion({ monthRange = 1 } = {}) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const now = new Date();
        const start = toDateStr(new Date(now.getFullYear(), now.getMonth() - (monthRange - 1), 1));
        const end = toDateStr(now);

        let allRecords = [];
        let skip = 0;
        const top = 100;

        while (true) {
          const url = `/models/m_requisition?$filter=DocStatus eq 'CO' and DateDoc ge ${start} and DateDoc le ${end}`
            + `&$select=DocumentNo,DateDoc`
            + `&$expand=M_RequisitionLine($select=C_OrderLine_ID,Line,Qty)`
            + `&$top=${top}&$skip=${skip}`;

          const res = await idempiereApi(url);
          const records = res.records || [];
          allRecords = allRecords.concat(records);

          if (records.length < top) break;
          skip += top;
        }

        if (cancelled) return;

        const allLines = allRecords.flatMap(req => req.M_RequisitionLine || []);
        const total = allLines.length;
        const converted = allLines.filter(l => Boolean(l.C_OrderLine_ID?.id)).length;
        const notConverted = total - converted;
        const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : 0;

        const perRequisition = allRecords.map(req => {
          const lines = req.M_RequisitionLine || [];
          const convertedCount = lines.filter(l => Boolean(l.C_OrderLine_ID?.id)).length;
          return {
            documentNo: req.DocumentNo,
            dateDoc: req.DateDoc,
            totalLines: lines.length,
            convertedLines: convertedCount,
            status: convertedCount === 0 ? 'Belum diproses'
                  : convertedCount === lines.length ? 'Selesai'
                  : 'Sebagian',
          };
        });

        setStats({ total, converted, notConverted, conversionRate, perRequisition });
      } catch (err) {
        console.error('useRequisitionConversion error:', err.message);
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [monthRange]);

  return { stats, loading };
}