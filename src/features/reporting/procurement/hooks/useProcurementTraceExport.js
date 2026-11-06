import { useCallback } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable"; // npm i jspdf-autotable (atau ganti dengan renderListPDF milik Anda)
import { OVERALL_LABEL, STATUS_LABEL, fmtDate } from "../utils/buildTrace";

const list = (docs) => docs.map((d) => `${d.no} (${fmtDate(d.date)})`).join(", ");

export const toFlatRows = (rows) =>
  rows.map((r) => ({
    Tanggal: fmtDate(r.dateRef),
    Requisition: r.reqs.map((d) => `${d.no} [${d.covered}/${d.total} line]`).join(", "),
    "Purchase Order": r.po ? `${r.po.no} (${fmtDate(r.po.date)})` : "",
    Vendor: r.vendor,
    "Penerimaan Barang": list(r.grs),
    "Invoice Vendor": list(r.invoices),
    Pembayaran: list(r.payments),
    "Status Req": STATUS_LABEL[r.stages.req],
    "Status PO": STATUS_LABEL[r.stages.po],
    "Status Penerimaan": `${STATUS_LABEL[r.stages.gr]} ${r.notes.gr || ""}`.trim(),
    "Status Invoice": `${STATUS_LABEL[r.stages.inv]} ${r.notes.inv || ""}`.trim(),
    "Status Pembayaran": `${STATUS_LABEL[r.stages.pay]} ${r.notes.pay || ""}`.trim(),
    "Status Akhir": OVERALL_LABEL[r.overall],
    Catatan: r.flags.map((f) => f.text).join("; "),
  }));

export default function useProcurementTraceExport() {
  const exportExcel = useCallback((rows, period) => {
    const ws = XLSX.utils.json_to_sheet(toFlatRows(rows));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Penelusuran Procurement");
    XLSX.writeFile(wb, `penelusuran-procurement_${period.dateFrom}_${period.dateTo}.xlsx`);
  }, []);

  const exportPDF = useCallback((rows, period) => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(13);
    doc.text("Laporan Penelusuran Procurement (QC)", 28, 30);
    doc.setFontSize(9);
    doc.text(`Periode ${fmtDate(period.dateFrom)} s/d ${fmtDate(period.dateTo)}`, 28, 44);
    const flat = toFlatRows(rows);
    const cols = ["Requisition", "Purchase Order", "Penerimaan Barang", "Invoice Vendor", "Pembayaran", "Status Akhir", "Catatan"];
    autoTable(doc, {
      startY: 54, styles: { fontSize: 7, cellPadding: 3 }, headStyles: { fillColor: [55, 65, 81] },
      head: [cols], body: flat.map((r) => cols.map((c) => r[c])),
    });
    doc.save(`penelusuran-procurement_${period.dateFrom}_${period.dateTo}.pdf`);
  }, []);

  return { exportExcel, exportPDF };
}
