// src/features/inventory/report/hooks/useInventoryStockExport.js
// Logika Print PDF & Export Excel Laporan Inventory (pivot per gudang).
// Tidak ada JSX / alert di sini: fungsi mengembalikan { ok, message } supaya
// UI yang memutuskan cara menampilkan pesan.
import { useState, useCallback } from "react";
import * as XLSX from "xlsx"; // npm install xlsx (kalau belum ada di project)
import { renderPivotListPDF } from "@/utils/pdf/renderPivotListPDF"; // duplikasi khusus laporan grouped/pivot — renderListPDF asli tidak diubah karena dipakai di banyak laporan lain
import { useOrgInfo } from "@/shared/hooks/useOrgInfo";

const fmt = (n) => n.toLocaleString("id-ID");
const today = () => new Date().toISOString().split("T")[0];

export default function useInventoryStockExport({ groupedByWarehouse, grandTotal }) {
    const { orgInfo } = useOrgInfo();
    const [printing, setPrinting] = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);

    // ── Print PDF (pivot per gudang) ────────────────────────────────────
    const printPdf = useCallback(async () => {
        if (groupedByWarehouse.length === 0) return { ok: false, message: "Tidak ada data untuk dicetak." };
        setPrinting(true);
        try {
            const nowStr = new Date().toLocaleString("id-ID");
            const rows = [];
            let no = 0;
            groupedByWarehouse.forEach((group) => {
                rows.push({
                    no: "",
                    productName: `${group.warehouseName}  (OnHand: ${fmt(group.totalOnHand)} | Reserved: ${fmt(group.totalReserved)} | Available: ${fmt(group.totalAvailable)})`,
                    onHand: "",
                    reserved: "",
                    available: "",
                    _isGroupHeader: true,
                });
                group.rows.forEach((r) => {
                    no += 1;
                    rows.push({
                        no,
                        productName: r.productName,
                        onHand: fmt(r.onHand),
                        reserved: fmt(r.reserved),
                        available: fmt(r.available),
                    });
                });
            });

            await renderPivotListPDF({
                title: "LAPORAN INVENTORY / KETERSEDIAAN STOK",
                logoDataUrl: orgInfo?.logoUrl,
                orgName: orgInfo?.name,
                orgPhone: orgInfo?.phone,
                orgEmail: orgInfo?.email,
                periodLabel: `PER ${nowStr}`,
                columns: [
                    { key: "no", label: "No", width: 25, align: "center" },
                    { key: "productName", label: "Produk / Gudang", width: 205 },
                    { key: "onHand", label: "On Hand", width: 60, align: "right" },
                    { key: "reserved", label: "Reserved", width: 60, align: "right" },
                    { key: "available", label: "Available", width: 60, align: "right" },
                ],
                rows,
                totalLabel: "Grand Total (Available)",
                totalValue: fmt(grandTotal.available),
                filenamePrefix: `INVENTORY-STOCK-${today()}`,
            });
            return { ok: true };
        } catch (err) {
            console.error("Gagal generate PDF:", err.message);
            return { ok: false, message: "Gagal membuat PDF laporan." };
        } finally {
            setPrinting(false);
        }
    }, [groupedByWarehouse, grandTotal, orgInfo]);

    // ── Export Excel (AOA manual supaya baris ringkasan gudang bisa
    // disisipkan di antara baris detail, sama dengan layar & PDF) ────────
    const exportExcel = useCallback(() => {
        if (groupedByWarehouse.length === 0) return { ok: false, message: "Tidak ada data untuk diexport." };
        setExportingExcel(true);
        try {
            const aoa = [
                ["LAPORAN INVENTORY / KETERSEDIAAN STOK"],
                [`Per: ${new Date().toLocaleString("id-ID")}`],
                [],
                ["No", "Produk", "On Hand", "Reserved", "Available"],
            ];

            let no = 0;
            groupedByWarehouse.forEach((group) => {
                aoa.push([`📦 ${group.warehouseName}`, "", group.totalOnHand, group.totalReserved, group.totalAvailable]);
                group.rows.forEach((r) => {
                    no += 1;
                    aoa.push([no, r.productName, r.onHand, r.reserved, r.available]);
                });
            });

            aoa.push([]);
            aoa.push(["", "", "Grand Total OnHand", grandTotal.onHand, ""]);
            aoa.push(["", "", "Grand Total Reserved", grandTotal.reserved, ""]);
            aoa.push(["", "", "Grand Total Available", grandTotal.available, ""]);

            const worksheet = XLSX.utils.aoa_to_sheet(aoa);
            worksheet["!cols"] = [{ wch: 6 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Stok per Gudang");
            XLSX.writeFile(workbook, `INVENTORY-STOCK-${today()}.xlsx`);
            return { ok: true };
        } catch (err) {
            console.error("Gagal export Excel:", err.message);
            return { ok: false, message: "Gagal membuat file Excel." };
        } finally {
            setExportingExcel(false);
        }
    }, [groupedByWarehouse, grandTotal]);

    return { printing, exportingExcel, printPdf, exportExcel };
}
