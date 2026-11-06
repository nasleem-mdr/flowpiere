import { useState, useEffect, useCallback } from 'react';
import { idempiereApi } from '@/api/idempiereApi';

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function normaliseRecords(data) {
  if (Array.isArray(data))          return data;
  if (Array.isArray(data?.records)) return data.records;
  return [];
}

function sumField(records, field) {
  return (records || []).reduce((s, r) => s + parseFloat(r[field] || 0), 0);
}

function groupByDate(records, dateField, totalField) {
  const map = {};
  records.forEach(r => {
    const day = (r[dateField] || '').split('T')[0];
    if (day) map[day] = (map[day] || 0) + parseFloat(r[totalField] || 0);
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

export default function useGenericStats({
  model,
  dateField,
  totalField,
  baseFilter      = '',
  selectFields    = '',
  monthRange      = 1,
  compareStatuses = [],
  statusField     = 'DocStatus',
  createdBy       = null,
  createdByList   = null,
} = {}) {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  const compareStatusesKey = compareStatuses.join(',');
  const createdByListKey   = (createdByList || []).join(',');

  useEffect(() => {
    if (!model || !dateField || !totalField) return;
    if (createdByList === null) return;

    const load = async () => {
      setLoading(true);
      try {
        const now       = new Date();
        const today     = toDateStr(now);
        const startDate = new Date(now.getFullYear(), now.getMonth() - (monthRange - 1), 1);
        const from      = `${toDateStr(startDate)}T00:00:00Z`;
        const to        = `${today}T23:59:59Z`;

        const filters = [];
        if (baseFilter) filters.push(baseFilter);

        if (createdByList?.length > 0) {
          const orClause = createdByList.map(id => `CreatedBy eq ${id}`).join(' or ');
          filters.push(`(${orClause})`);
        } else if (createdBy) {
          filters.push(`CreatedBy eq ${createdBy}`);
        }

        filters.push(`${dateField} ge ${from} and ${dateField} le ${to}`);

        const select = [dateField, totalField, statusField, selectFields]
          .filter(Boolean).join(',');

        if (compareStatuses.length > 0) {
          const requests = compareStatuses.map(status => {
            const statusFilter = [...filters, `${statusField} eq '${status}'`].join(' and ');
            const url = `/models/${model}?$filter=${statusFilter}&$select=${select}`;
            return idempiereApi(url).then(normaliseRecords);
          });

          const results    = await Promise.all(requests);
          const comparison = {};
          compareStatuses.forEach((status, i) => {
            const records = results[i];
            comparison[status] = {
              total:     sumField(records, totalField),
              count:     records.length,
              chartData: groupByDate(records, dateField, totalField),
            };
          });

          const allRecords    = results.flat();
          const overviewChart = groupByDate(allRecords, dateField, totalField);
          setStats({ comparison, overviewChart, from, to });

        } else {
          const allFilter = filters.join(' and ');
          const res       = await idempiereApi(`/models/${model}?$filter=${allFilter}&$select=${select}`);
          const records   = normaliseRecords(res);
          setStats({
            total:         sumField(records, totalField),
            count:         records.length,
            overviewChart: groupByDate(records, dateField, totalField),
            from,
            to,
          });
        }

      } catch (err) {
        console.error(`useGenericStats [${model}] error:`, err.message);
        setStats(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, dateField, totalField, baseFilter, selectFields, monthRange,
      compareStatusesKey, statusField, createdBy, createdByListKey]);

  return { stats, loading };
}