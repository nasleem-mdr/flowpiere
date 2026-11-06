import { useMemo } from "react";
import { BS_SERIES, PL_GROUPS } from "../utils/constants";
import { buildMonthRange, computeTrend, computeLabaBersih } from "../utils/trendCalc";
import { useAccountMeta } from "./useAccountMeta";
import { useFactAcct } from "./useFactAcct";

/** Gabungan fetch + kalkulasi: semua yang dibutuhkan page laporan. */
export const useTrendData = (startDate, endDate) => {
    const { accountMeta, loading: metaLoading } = useAccountMeta();
    const { factLines, loading: factLoading, progress, reload } = useFactAcct(endDate);

    const months = useMemo(() => buildMonthRange(startDate, endDate), [startDate, endDate]);
    const trend = useMemo(() => computeTrend(factLines, accountMeta, months), [factLines, accountMeta, months]);
    const labaBersihPerMonth = useMemo(() => computeLabaBersih(trend.pl), [trend]);

    const bsChartSeries = useMemo(
        () => BS_SERIES.map((s) => ({ ...s, data: trend.bs.map((m) => m[s.key]) })),
        [trend]
    );
    const plChartSeries = useMemo(
        () => PL_GROUPS.map((g) => ({ ...g, data: trend.pl.map((m) => m.totals[g.key]) })),
        [trend]
    );

    return {
        trend,
        labaBersihPerMonth,
        bsChartSeries,
        plChartSeries,
        lastBS: trend.bs[trend.bs.length - 1],
        lastLaba: labaBersihPerMonth[labaBersihPerMonth.length - 1],
        loading: metaLoading || factLoading,
        progress,
        reload,
    };
};
