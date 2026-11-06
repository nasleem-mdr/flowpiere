import React, { useState } from "react";
import { PageHeader } from "@/shared/components";
import { useOrgInfo } from "@/shared/hooks/useOrgInfo";
import "@/App.css";

import { useTrendData } from "../hooks/useTrendData";
import { useTrendExport } from "../hooks/useTrendExport";
import DateRangeFilter from "../components/DateRangeFilter";
import TrendKpiCards from "../components/TrendKpiCards";
import TrendLineChart from "../components/TrendLineChart";
import TrendTable from "../components/TrendTable";
import { styles } from "../components/styles";

/**
 * MonthlyTrendReport — Laporan Trend Bulanan (Neraca & Laba-Rugi)
 * Page hanya merangkai UI; fetch & logika ada di hooks/, chart/tabel di components/.
 */
const MonthlyTrendReport = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const { orgInfo } = useOrgInfo();

    const [startDate, setStartDate] = useState(`${todayStr.slice(0, 4)}-01-01`);
    const [endDate, setEndDate] = useState(todayStr);

    const {
        trend, labaBersihPerMonth, bsChartSeries, plChartSeries,
        lastBS, lastLaba, loading, progress, reload,
    } = useTrendData(startDate, endDate);

    const { exportExcel, exporting } = useTrendExport({
        trend, labaBersihPerMonth, startDate, endDate, orgName: orgInfo?.name,
    });

    return (
        <div className="card-container">
            <PageHeader
                title="📈 Dashboard Trend Bulanan"
                extraAction={
                    <button onClick={exportExcel} disabled={exporting} style={styles.excelBtn}>
                        {exporting ? "⏳ ..." : "📥 Download Excel"}
                    </button>
                }
            />

            <DateRangeFilter
                startDate={startDate}
                endDate={endDate}
                onStartChange={setStartDate}
                onEndChange={setEndDate}
                onRefresh={reload}
                loading={loading}
                progress={progress}
            />

            <TrendKpiCards lastBS={lastBS} lastLaba={lastLaba} />

            {loading ? (
                <p>
                    Memuat data...
                    {progress.total ? ` (${progress.loaded.toLocaleString("id-ID")} / ${progress.total.toLocaleString("id-ID")} baris)` : ""}
                </p>
            ) : (
                <div className="detail-section">
                    <TrendLineChart
                        title="📊 Trend Laba-Rugi (per bulan)"
                        labels={trend.pl.map((m) => m.label)}
                        series={plChartSeries}
                    />
                    <TrendLineChart
                        title="🏛️ Trend Neraca (posisi kumulatif per bulan)"
                        labels={trend.bs.map((m) => m.label)}
                        series={bsChartSeries}
                    />
                    <TrendTable trend={trend} labaBersihPerMonth={labaBersihPerMonth} />
                </div>
            )}
        </div>
    );
};

export default MonthlyTrendReport;