import { useState, useCallback } from "react";
import * as XLSX from "xlsx"; // npm install xlsx
import { PL_GROUPS } from "../utils/constants";

export const useTrendExport = ({ trend, labaBersihPerMonth, startDate, endDate, orgName }) => {
    const [exporting, setExporting] = useState(false);

    const exportExcel = useCallback(() => {
        if (trend.bs.length === 0) {
            alert("Tidak ada data untuk diexport.");
            return;
        }
        setExporting(true);
        try {
            const header = ["Komponen", ...trend.bs.map((m) => m.label)];
            const aoa = [
                [`LAPORAN TREND BULANAN — ${orgName || ""}`],
                [`Periode: ${startDate} s/d ${endDate}`],
                [],
                ["── NERACA (posisi kumulatif s.d. akhir bulan, ternormalisasi) ──"],
                header,
                ["Total Aktiva", ...trend.bs.map((m) => m.aktiva)],
                ["Total Hutang", ...trend.bs.map((m) => m.hutang)],
                ["Total Modal", ...trend.bs.map((m) => m.modal)],
                [],
                ["── LABA-RUGI (per bulan, ternormalisasi) ──"],
                header,
                ...PL_GROUPS.map((g) => [g.label, ...trend.pl.map((m) => m.totals[g.key])]),
                ["Laba Bersih", ...labaBersihPerMonth],
            ];
            const worksheet = XLSX.utils.aoa_to_sheet(aoa);
            worksheet["!cols"] = [{ wch: 28 }, ...trend.bs.map(() => ({ wch: 14 }))];
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Trend Bulanan");
            XLSX.writeFile(workbook, `TREND-BULANAN-${startDate}_${endDate}.xlsx`);
        } catch (err) {
            console.error("Gagal export Excel:", err.message);
            alert("Gagal membuat file Excel.");
        } finally {
            setExporting(false);
        }
    }, [trend, labaBersihPerMonth, startDate, endDate, orgName]);

    return { exportExcel, exporting };
};
