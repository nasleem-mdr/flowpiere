import { useState } from "react";
import * as XLSX from "xlsx";
import { renderPivotListPDF } from "@/utils/pdf/renderPivotListPDF";
import { useOrgInfo } from "@/shared/hooks/useOrgInfo";
import { FY_START_MONTH, fmtDate, fmtSigned, fmtNumber } from "@/features/reporting/financial/utils/generalLedger";

/** Export Buku Besar ke PDF & Excel. Input = hasil useGeneralLedger. */
export function useGeneralLedgerExport({ groups, grandTotal, startDate, endDate, partnerFilterSummary = "" }) {
    const { orgInfo } = useOrgInfo();
    const [printing, setPrinting] = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);

    const handlePrintPdf = async () => {
        if (groups.length === 0) { alert("Tidak ada data untuk dicetak."); return; }
        setPrinting(true);
        try {
            const rows = [];
            let no = 0;
            let currentSection = "";
            groups.forEach((group) => {
                if (group.typeInfo.group !== currentSection) {
                    currentSection = group.typeInfo.group;
                    rows.push({ no: "", dateAcct: "", accountName: `── ${currentSection} ──`, bpartner: "", debit: "", credit: "", balance: "", _isGroupHeader: true });
                }
                rows.push({
                    no: "", dateAcct: "", accountName: group.accountName, bpartner: "", debit: "", credit: "",
                    balance: `Awal: ${fmtSigned(group.openingBalance)}  →  Akhir: ${fmtSigned(group.closingBalance)}`,
                    _isGroupHeader: true,
                });
                rows.push({
                    no: "", dateAcct: fmtDate(startDate), accountName: group.openingRow.description,
                    bpartner: "", debit: "", credit: "", balance: fmtSigned(group.openingBalance),
                });
                group.rows.forEach((r) => {
                    no += 1;
                    rows.push({
                        no,
                        dateAcct: fmtDate(r.dateAcct),
                        accountName: r.description || group.accountName,
                        bpartner: r.bpartnerName || "",
                        debit: r.debit ? fmtNumber(r.debit) : "",
                        credit: r.credit ? fmtNumber(r.credit) : "",
                        balance: fmtSigned(r.balance),
                    });
                });
                rows.push({
                    no: "", dateAcct: "", accountName: `Subtotal ${group.accountName}`, bpartner: "",
                    debit: fmtNumber(group.totalDebit), credit: fmtNumber(group.totalCredit), balance: "",
                });
            });

            await renderPivotListPDF({
                title: "LAPORAN BUKU BESAR (GENERAL LEDGER)",
                logoDataUrl: orgInfo?.logoUrl,
                orgName: orgInfo?.name,
                orgPhone: orgInfo?.phone,
                orgEmail: orgInfo?.email,
                periodLabel: `PERIODE : ${startDate}  s/d  ${endDate}   (FY start: ${FY_START_MONTH === 1 ? "Januari" : "Bulan-" + FY_START_MONTH})` +
                    (partnerFilterSummary ? `   |   PARTNER : ${partnerFilterSummary}` : ""),
                columns: [
                    { key: "no", label: "No", width: 20, align: "center" },
                    { key: "dateAcct", label: "Tanggal", width: 40 },
                    { key: "accountName", label: "Akun / Keterangan", width: 120 },
                    { key: "bpartner", label: "Business Partner", width: 80 },
                    { key: "debit", label: "Debet", width: 55, align: "right" },
                    { key: "credit", label: "Kredit", width: 55, align: "right" },
                    { key: "balance", label: "Balance", width: 65, align: "right" },
                ],
                rows,
                totalLabel: "Total Debet / Kredit",
                totalValue: `${fmtNumber(grandTotal.debit)} / ${fmtNumber(grandTotal.credit)}`,
                filenamePrefix: `BUKU-BESAR-${startDate}_${endDate}`,
            });
        } catch (err) {
            console.error("Gagal generate PDF:", err.message);
            alert("Gagal membuat PDF laporan.");
        } finally {
            setPrinting(false);
        }
    };

    const handleExportExcel = () => {
        if (groups.length === 0) { alert("Tidak ada data untuk diexport."); return; }
        setExportingExcel(true);
        try {
            const aoa = [
                ["LAPORAN BUKU BESAR (GENERAL LEDGER)"],
                [`Periode: ${startDate} s/d ${endDate}`],
                ...(partnerFilterSummary ? [[`Filter Business Partner: ${partnerFilterSummary} (saldo awal & balance dihitung hanya dari posting partner tersebut)`]] : []),
                [`Catatan: Aset/Beban = Debet − Kredit; Liabilitas/Ekuitas/Pendapatan = Kredit − Debet. Balance negatif = berlawanan dengan posisi normal akun. Laba-rugi dihitung dari awal tahun fiskal (bulan ke-${FY_START_MONTH}).`],
                [],
                ["No", "Tanggal", "Akun / Keterangan", "Business Partner", "Debet", "Kredit", "Balance"],
            ];

            let no = 0;
            let currentSection = "";
            groups.forEach((group) => {
                if (group.typeInfo.group !== currentSection) {
                    currentSection = group.typeInfo.group;
                    aoa.push([`── ${currentSection} ──`]);
                }
                aoa.push([`📒 ${group.accountName}`, "", "", "", "", "", ""]);
                aoa.push(["", fmtDate(startDate), group.openingRow.description, "", "", "", group.openingBalance]);
                group.rows.forEach((r) => {
                    no += 1;
                    aoa.push([no, fmtDate(r.dateAcct), r.description || group.accountName, r.bpartnerName || "", r.debit, r.credit, r.balance]);
                });
                aoa.push(["", "", `Subtotal ${group.accountName}`, "", group.totalDebit, group.totalCredit, ""]);
            });
            aoa.push([]);
            aoa.push(["", "", "TOTAL PERIODE (Debet / Kredit)", "", grandTotal.debit, grandTotal.credit, ""]);

            const worksheet = XLSX.utils.aoa_to_sheet(aoa);
            worksheet["!cols"] = [{ wch: 6 }, { wch: 12 }, { wch: 42 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Buku Besar");
            XLSX.writeFile(workbook, `BUKU-BESAR-${startDate}_${endDate}.xlsx`);
        } catch (err) {
            console.error("Gagal export Excel:", err.message);
            alert("Gagal membuat file Excel.");
        } finally {
            setExportingExcel(false);
        }
    };

    return { handlePrintPdf, handleExportExcel, printing, exportingExcel };
}