import { useMemo } from 'react';
import { useFinancialReport } from '@/features/reporting/financial/hooks/useFinancialReport';

/**
 * Komparasi dua periode untuk satu PA_ReportLineSet.
 *
 * Memanggil useFinancialReport dua kali (Periode 1 & Periode 2) lalu menggabungkan
 * hasilnya per baris laporan (key = id baris), sehingga seluruh logika Segment /
 * Calculation / Period Type (T, Y, P, N) yang sudah ada dipakai ulang apa adanya.
 *
 * Konvensi kolom:
 *   Selisih = Periode 2 − Periode 1        (Periode 1 = pembanding / baseline)
 *   %       = Selisih / |Periode 1|         (null kalau Periode 1 = 0)
 * Kalau ingin dibalik (Periode 1 = terbaru), ubah SATU tempat: fungsi `compare` di bawah.
 *
 * @param {object}  p
 * @param {number}  p.reportLineSetId
 * @param {number}  p.acctSchemaId
 * @param {'neraca'|'labarugi'} p.kind   neraca = As Per dateTo, labarugi = dateFrom..dateTo
 * @param {{dateFrom?:string,dateTo:string}|null} p.period1   null = belum diterapkan
 * @param {{dateFrom?:string,dateTo:string}|null} p.period2
 */
const compare = (a1, a2) => {
  const diff = a2 - a1;
  const pct = a1 !== 0 ? diff / Math.abs(a1) : null;
  return { diff, pct };
};

export function useFinancialComparison({
  reportLineSetId,
  acctSchemaId,
  kind = 'neraca',
  period1,
  period2,
  token,
  baseUrl = '',
}) {
  const mode = kind === 'labarugi' ? 'labarugi' : 'neraca';

  // reportLineSetId dikosongkan selama periode belum diterapkan -> hook tidak fetch
  const r1 = useFinancialReport({
    reportLineSetId: period1 ? reportLineSetId : undefined,
    acctSchemaId,
    dateFrom: period1?.dateFrom,
    dateTo: period1?.dateTo,
    mode,
    token,
    baseUrl,
  });

  const r2 = useFinancialReport({
    reportLineSetId: period2 ? reportLineSetId : undefined,
    acctSchemaId,
    dateFrom: period2?.dateFrom,
    dateTo: period2?.dateTo,
    mode,
    token,
    baseUrl,
  });

  const rows = useMemo(() => {
    const byId2 = new Map(r2.reportLines.map((l) => [l.id, l]));
    return r1.reportLines.map((l1) => {
      const amount1 = l1.amount || 0;
      const amount2 = byId2.get(l1.id)?.amount || 0;
      return { ...l1, amount1, amount2, ...compare(amount1, amount2) };
    });
  }, [r1.reportLines, r2.reportLines]);

  return {
    rows,
    loading: r1.loading || r2.loading,
    error: r1.error || r2.error,
    refetch: () => {
      r1.refetch();
      r2.refetch();
    },
  };
}

export default useFinancialComparison;
