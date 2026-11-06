// src/features/purchasing/report/hooks/usePurchaseOrderDetailExport.js
// Logika Print PDF & Export Excel Laporan Detail Purchase Order (pivot sesuai
// mode terpilih: per Produk / per Vendor / per No. Order).
// Tidak ada JSX / alert di sini: fungsi mengembalikan { ok, message } supaya
// UI yang memutuskan cara menampilkan pesan.
import { useState, useCallback } from "react";
import * as XLSX from "xlsx"; // npm install xlsx (kalau belum ada di project)
import { renderPivotListPDF } from "@/utils/pdf/renderPivotListPDF"; // khusus laporan grouped/pivot — renderListPDF asli tidak diubah
import { useOrgInfo } from "@/shared/hooks/useOrgInfo";
import { PIVOT_CONFIG, DEFAULT_PIVOT } from "./usePurchaseOrderDetailReport";

const fmt = (n) => n.toLocaleString("id-ID");

export default function usePurchaseOrderDetailExport({ groups, groupBy, grandTotal, startDate, endDate }) {
    const { orgInfo } = useOrgInfo();
    const [printing, setPrinting] = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);

    const cfg = PIVOT_CONFIG[groupBy] ?? PIVOT_CONFIG[DEFAULT_PIVOT];
    const detailCols = cfg.detailCols;
    // Kolom teks terakhir = tempat teks header grup di PDF (paling lebar di semua mode)
    const headerColKey = detailCols[detailCols.length - 1].key;

    // ── Print PDF ───────────────────────────────────────────────────────
    const printPdf = useCallback(async () => {
        if (groups.length === 0) return { ok: false, message: "Tidak ada data untuk dicetak." };
        setPrinting(true);
        try {
            const rows = [];
            let no = 0;
            groups.forEach((group) => {
                // Baris header grup: semua kolom kosong kecuali kolom teks terakhir
                const headerRow = { no: "", qty: "", price: "", lineTotal: "", _isGroupHeader: true };
                detailCols.forEach((c) => { headerRow[c.key] = ""; });
                headerRow[headerColKey] =
                    `${group.label}  (Qty: ${fmt(group.totalQty)} | Total: ${fmt(group.totalAmount)})`;
                rows.push(headerRow);

                group.rows.forEach((r) => {
                    no += 1;
                    const row = { no, qty: fmt(r.qty), price: fmt(r.price), lineTotal: fmt(r.lineTotal) };
                    detailCols.forEach((c) => { row[c.key] = r[c.key]; });
                    rows.push(row);
                });
            });

            await renderPivotListPDF({
                title: `LAPORAN DETAIL PURCHASE ORDER (${cfg.label.toUpperCase()})`,
                logoDataUrl: orgInfo?.logoUrl,
                orgName: orgInfo?.name,
                orgPhone: orgInfo?.phone,
                orgEmail: orgInfo?.email,
                periodLabel: `PERIODE : ${startDate}  s/d  ${endDate}`,
                columns: [
                    { key: "no", label: "No", width: 25, align: "center" },
                    ...detailCols.map((c) => ({ key: c.key, label: c.label, width: c.pdfWidth })),
                    { key: "qty", label: "Qty", width: 40, align: "right" },
                    { key: "price", label: "Harga", width: 65, align: "right" },
                    { key: "lineTotal", label: "Total", width: 75, align: "right" },
                ],
                rows,
                totalLabel: "Grand Total",
                totalValue: fmt(grandTotal),
                filenamePrefix: `PURCHASE-ORDER-DETAIL-PER-${cfg.fileKey}-${startDate}_${endDate}`,
            });
            return { ok: true };
        } catch (err) {
            console.error("Gagal generate PDF:", err.message);
            return { ok: false, message: "Gagal membuat PDF laporan." };
        } finally {
            setPrinting(false);
        }
    }, [groups, cfg, detailCols, headerColKey, grandTotal, startDate, endDate, orgInfo]);

    // ── Export Excel (AOA manual supaya baris ringkasan grup bisa
    // disisipkan di antara baris detail, sama dengan layar & PDF) ────────
    const exportExcel = useCallback(() => {
        if (groups.length === 0) return { ok: false, message: "Tidak ada data untuk diexport." };
        setExportingExcel(true);
        try {
            const nText = detailCols.length;       // jumlah kolom teks detail
            const qtyIdx = 1 + nText;              // posisi kolom Qty (setelah No + kolom teks)
            const priceIdx = qtyIdx + 1;
            const totalIdx = qtyIdx + 2;
            const colCount = totalIdx + 1;

            const aoa = [
                [`LAPORAN DETAIL PURCHASE ORDER (${cfg.label.toUpperCase()})`],
                [`Periode: ${startDate} s/d ${endDate}`],
                [],
                ["No", ...detailCols.map((c) => c.label), "Qty", "Harga", "Total"],
            ];

            let no = 0;
            groups.forEach((group) => {
                const groupRow = Array(colCount).fill("");
                groupRow[0] = `${cfg.icon} ${group.label}`;
                groupRow[qtyIdx] = group.totalQty;
                groupRow[totalIdx] = group.totalAmount;
                aoa.push(groupRow);

                group.rows.forEach((r) => {
                    no += 1;
                    aoa.push([no, ...detailCols.map((c) => r[c.key]), r.qty, r.price, r.lineTotal]);
                });
            });

            const grandRow = Array(colCount).fill("");
            grandRow[priceIdx] = "Grand Total";
            grandRow[totalIdx] = grandTotal;
            aoa.push([]);
            aoa.push(grandRow);

            const worksheet = XLSX.utils.aoa_to_sheet(aoa);
            worksheet["!cols"] = [
                { wch: 6 },                                  // No
                ...detailCols.map((c) => ({ wch: c.xlsWidth })),
                { wch: 10 },                                 // Qty
                { wch: 14 },                                 // Harga
                { wch: 16 },                                 // Total
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, cfg.sheetName);
            XLSX.writeFile(workbook, `PURCHASE-ORDER-DETAIL-PER-${cfg.fileKey}-${startDate}_${endDate}.xlsx`);
            return { ok: true };
        } catch (err) {
            console.error("Gagal export Excel:", err.message);
            return { ok: false, message: "Gagal membuat file Excel." };
        } finally {
            setExportingExcel(false);
        }
    }, [groups, cfg, detailCols, grandTotal, startDate, endDate]);

    return { printing, exportingExcel, printPdf, exportExcel };
}