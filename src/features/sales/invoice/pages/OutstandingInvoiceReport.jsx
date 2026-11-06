/**
 * OutstandingInvoiceReport
 * ─────────────────────────────────────────────────────────────────────────
 * Laporan Outstanding Invoice (piutang/hutang belum lunas) berbasis C_Invoice.
 *
 * ALUR FETCH (mengikuti pola SalesOrderDetailReport.jsx):
 *   1) Ambil header C_invoice completed (DocStatus 'CO') dalam rentang tanggal
 *      DateInvoiced, dibatasi AR (IsSOTrx=true) / AP (IsSOTrx=false) / Semua.
 *   2) Ambil C_AllocationLine milik invoice-invoice tsb lewat filter
 *      "C_Invoice_ID eq X or ..." di-CHUNK per 40 ID (bxservice tidak
 *      mendukung join praktis antar tabel). Paid = Σ(Amount+DiscountAmt+
 *      WriteOffAmt) per invoice.
 *   3) OpenAmt = GrandTotal - Paid. Invoice dianggap outstanding kalau
 *      OpenAmt > 0.005 (toleransi pembulatan) — jadi laporan ini tetap akurat
 *      meski flag IsPaid di header terasa lambat ter-update oleh server.
 *   4) Aging bucket dihitung CLIENT-SIDE dari DateInvoiced (0–30 / 31–60 /
 *      61–90 / >90 hari) — tidak perlu virtual column khusus di iDempiere.
 *      (T_Aging TIDAK dipakai: itu tabel temporary per AD_PInstance — hanya
 *      terisi saat report Aging dijalankan di server, datanya bukan live.)
 *
 *   - Kolom standar C_Invoice: DateInvoiced, GrandTotal, IsSOTrx,
 *     DocStatus, C_BPartner_ID — semuanya standar iDempiere.
 *     CATATAN: C_Invoice TIDAK punya kolom DueDate di iDempiere (jatuh tempo
 *     dihitung dari C_PaymentTerm.NetDays) — makanya aging di sini dihitung
 *     dari DateInvoiced, bukan dari due date.
 *   - C_AllocationLine: Amount, DiscountAmt, WriteOffAmt — standar iDempiere.
 *   - Kalau volume invoice > ±2000 per rentang tanggal, naikkan $top atau
 *     persempit rentang tanggal default.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/shared/components";
import { idempiereApi, fkId } from "@/api/idempiereApi";
import { renderPivotListPDF } from "@/utils/pdf/renderPivotListPDF";
import { useOrgInfo } from "@/shared/hooks/useOrgInfo";
import * as XLSX from "xlsx"; // sudah dipakai SalesOrderDetailReport — pastikan terinstall
import "@/App.css";

const CHUNK_SIZE = 40; // jumlah C_Invoice_ID per batch query C_AllocationLine

// Aging bucket dari umur invoice (hari), dihitung sejak DateInvoiced.
function ageBucket(days) {
    if (days <= 30) return "0-30";
    if (days <= 60) return "31-60";
    if (days <= 90) return "61-90";
    return ">90";
}
const BUCKET_ORDER = ["0-30", "31-60", "61-90", ">90"];

const OutstandingInvoiceReport = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const { orgInfo } = useOrgInfo();

    // Default rentang: 90 hari ke belakang s/d hari ini (cakupan umur aging).
    const defaultStart = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
    const [startDate, setStartDate] = useState(defaultStart);
    const [endDate, setEndDate] = useState(todayStr);

    // AR = invoice penjualan (piutang), AP = invoice pembelian (hutang)
    const [docType, setDocType] = useState("AR");

    const [invoices, setInvoices] = useState([]); // SEMUA invoice hasil fetch (belum difilter search)
    const [loading, setLoading] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);
    const [customerSearch, setCustomerSearch] = useState("");

    // ─── FETCH: invoice header + allocation line, lalu join ────────────────
    const fetchReportData = useCallback(async () => {
        setLoading(true);
        try {
            // Langkah 1: header invoice completed dalam rentang tanggal
            let invoiceFilter =
                `DateInvoiced ge ${startDate}T00:00:00Z` +
                ` and DateInvoiced le ${endDate}T23:59:59Z`;
            if (docType === "AR") invoiceFilter += ` and IsSOTrx eq true`;
            if (docType === "AP") invoiceFilter += ` and IsSOTrx eq false`;

            const invRes = await idempiereApi(
                `/models/c_invoice?$filter=${invoiceFilter}` +
                `&$select=DocumentNo,POReference,DateInvoiced,C_BPartner_ID,GrandTotal,IsSOTrx,DocStatus` +
                `&$orderby=DateInvoiced&$top=2000`
            );
            const invRecords = Array.isArray(invRes.records) ? invRes.records : [];

            // Map invoice + filter DocStatus 'CO' client-side (hindari perilaku
            // tak konsisten filter string OData 'CO' di beberapa versi bxservice;
            // records yang dibalikin tetap membawa DocStatus { id, identifier }).
            const invMap = new Map();
            invRecords.forEach((inv) => {
                const status = fkId(inv.DocStatus);
                if (status !== "CO") return; // hanya Completed; buang Draft/Void/Reversed
                const iid = inv.id ?? inv.C_Invoice_ID;
                invMap.set(iid, {
                    invoiceId: iid,
                    documentNo: inv.DocumentNo || `#${iid}`,
                    poReference: inv.POReference || '',
                    dateInvoiced: inv.DateInvoiced,
                    bpartnerId: fkId(inv.C_BPartner_ID),
                    bpartnerName: inv.C_BPartner_ID?.identifier || inv.C_BPartner_ID?.Name || "-",
                    isSales: inv.IsSOTrx === true || inv.IsSOTrx === "Y",
                    grandTotal: parseFloat(inv.GrandTotal || 0),
                    paid: 0,
                });
            });
            const invoiceIds = Array.from(invMap.keys());

            if (invoiceIds.length === 0) {
                setInvoices([]);
                return;
            }

            // Langkah 2: C_AllocationLine untuk invoice tsb, di-chunk
            for (let i = 0; i < invoiceIds.length; i += CHUNK_SIZE) {
                const chunk = invoiceIds.slice(i, i + CHUNK_SIZE);
                const orClause = chunk.map((id) => `C_Invoice_ID eq ${id}`).join(" or ");
                try {
                    const allocRes = await idempiereApi(
                        `/models/c_allocationline?$filter=${orClause}` +
                        `&$select=C_Invoice_ID,Amount,DiscountAmt,WriteOffAmt&$top=1000`
                    );
                    (Array.isArray(allocRes.records) ? allocRes.records : []).forEach((al) => {
                        const iid = fkId(al.C_Invoice_ID);
                        const inv = invMap.get(iid);
                        if (!inv) return;
                        inv.paid +=
                            parseFloat(al.Amount || 0) +
                            parseFloat(al.DiscountAmt || 0) +
                            parseFloat(al.WriteOffAmt || 0);
                    });
                } catch (err) {
                    // Gagal ambil allocation untuk satu chunk tidak boleh
                    // menggagalkan seluruh laporan — anggap belum ada bayaran.
                    console.error(`Gagal ambil allocation (chunk ${i / CHUNK_SIZE + 1}):`, err.message);
                }
            }
            // Langkah 3: hitung OpenAmt, hanya simpan yang benar-benar outstanding
            const todayMs = Date.now();
            const rows = [];
            invMap.forEach((inv) => {
                // AP: allocation line disimpan negatif di iDempiere → balik tandanya
                // supaya "Terbayar" selalu positif, sejajar dengan GrandTotal invoice.
                const paid = inv.isSales ? inv.paid : -inv.paid;
                const openAmt = inv.grandTotal - paid;
                if (openAmt <= 0.005) return; // sudah lunas (toleransi pembulatan)

                const invMs = new Date(inv.dateInvoiced).getTime();
                const ageDays = Number.isFinite(invMs)
                    ? Math.max(0, Math.floor((todayMs - invMs) / 86400000))
                    : 0;

                rows.push({
                    ...inv,
                    paid,        // timpa dengan nilai yang sudah dinormalisasi
                    openAmt,
                    ageDays,
                    bucket: ageBucket(ageDays),
                });
            });

            setInvoices(rows);
        } catch (err) {
            console.error("Gagal mengambil data outstanding invoice:", err.message);
            setInvoices([]);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, docType]);

    useEffect(() => {
        fetchReportData();
    }, [fetchReportData]);

    // ─── Filter pencarian customer (client-side) ────────────────────────────
    const filteredRows = useMemo(() => {
        const q = customerSearch.trim().toLowerCase();
        if (!q) return invoices;
        return invoices.filter((r) => (r.bpartnerName || "").toLowerCase().includes(q));
    }, [invoices, customerSearch]);

    // ─── Pivot per customer: tiap grup bawa jumlah invoice + total outstanding
    const groupedByPartner = useMemo(() => {
        const map = new Map();
        filteredRows.forEach((r) => {
            const key = r.bpartnerId ?? r.bpartnerName;
            if (!map.has(key)) {
                map.set(key, {
                    bpartnerId: r.bpartnerId,
                    bpartnerName: r.bpartnerName,
                    invoiceCount: 0,
                    totalOpen: 0,
                    rows: [],
                });
            }
            const g = map.get(key);
            g.invoiceCount += 1;
            g.totalOpen += r.openAmt;
            g.rows.push(r);
        });
        // Grup dengan outstanding terbesar di atas
        return Array.from(map.values()).sort((a, b) => b.totalOpen - a.totalOpen);
    }, [filteredRows]);

    // ─── Ringkasan angka untuk strip statistik di atas tabel ────────────────
    const summary = useMemo(() => {
        const totalOpen = filteredRows.reduce((s, r) => s + r.openAmt, 0);
        const byBucket = Object.fromEntries(BUCKET_ORDER.map((b) => [b, 0]));
        filteredRows.forEach((r) => { byBucket[r.bucket] += r.openAmt; });
        const oldest = filteredRows.reduce((m, r) => Math.max(m, r.ageDays), 0);
        return {
            invoiceCount: filteredRows.length,
            totalOpen,
            byBucket,
            oldest,
        };
    }, [filteredRows]);

    const fmt = (n) => (n ?? 0).toLocaleString("id-ID", { maximumFractionDigits: 0 });

    // ─── Print PDF (pivot per customer) ─────────────────────────────────────
    const handlePrint = async () => {
        if (groupedByPartner.length === 0) {
            alert("Tidak ada data untuk dicetak.");
            return;
        }
        setPrinting(true);
        try {
            const docTypeLabel = docType === "AR" ? "PIUTANG (AR)" : docType === "AP" ? "HUTANG (AP)" : "PIUTANG & HUTANG";
            const rows = [];
            let no = 0;
            groupedByPartner.forEach((g) => {
                rows.push({
                    no: "",
                    documentNo: "",
                    dateInvoiced: "",
                    age: "",
                    grandTotal: "",
                    paid: "",
                    openAmt: `${g.bpartnerName}  (Invoice: ${g.invoiceCount} | Outstanding: ${fmt(g.totalOpen)})`,
                    _isGroupHeader: true,
                });
                g.rows.forEach((r) => {
                    no += 1;
                    rows.push({
                        no,
                        documentNo: r.documentNo,
                        poReference: r.poReference,
                        dateInvoiced: (r.dateInvoiced || "").slice(0, 10),
                        age: `${r.ageDays} hari`,
                        grandTotal: fmt(r.grandTotal),
                        paid: fmt(r.paid),
                        openAmt: fmt(r.openAmt),
                    });
                });
            });

            await renderPivotListPDF({
                title: `LAPORAN OUTSTANDING INVOICE ${docTypeLabel}`,
                logoDataUrl: orgInfo?.logoUrl,
                orgName: orgInfo?.name,
                orgPhone: orgInfo?.phone,
                orgEmail: orgInfo?.email,
                periodLabel: `PERIODE INVOICE : ${startDate}  s/d  ${endDate}   (s/d ${todayStr})`,
                columns: [
                    { key: "no", label: "No", width: 25, align: "center" },
                    { key: "documentNo", label: "No. Invoice", width: 60 },
                    { key: "poReference", label: "Invoice Ref", width: 60 },
                    { key: "dateInvoiced", label: "Tgl Invoice", width: 45 },
                    { key: "age", label: "Umur", width: 35, align: "center" },
                    { key: "grandTotal", label: "Nilai Invoice", width: 65, align: "right" },
                    { key: "paid", label: "Terbayar", width: 65, align: "right" },
                    { key: "openAmt", label: "Outstanding", width: 75, align: "right" },
                ],
                rows,
                totalLabel: "Total Outstanding",
                totalValue: fmt(summary.totalOpen),
                filenamePrefix: `OUTSTANDING-INVOICE-${docType}-${startDate}_${endDate}`,
            });
        } catch (err) {
            console.error("Gagal generate PDF:", err.message);
            alert("Gagal membuat PDF laporan.");
        } finally {
            setPrinting(false);
        }
    };

    // ─── Export Excel (pivot per customer) ───────────────────────────────────
    const handleExportExcel = () => {
        if (groupedByPartner.length === 0) {
            alert("Tidak ada data untuk diexport.");
            return;
        }
        setExportingExcel(true);
        try {
            const aoa = [
                ["LAPORAN OUTSTANDING INVOICE"],
                [`Periode Invoice: ${startDate} s/d ${endDate}  (s/d ${todayStr})`],
                [],
                ["No", "No. Invoice","Reference", "Tgl Invoice", "Umur (hari)", "Bucket", "Nilai Invoice", "Terbayar", "Outstanding"],
            ];

            let no = 0;
            groupedByPartner.forEach((g) => {
                aoa.push([`🏢 ${g.bpartnerName}`, "", "", "", "", `Invoice: ${g.invoiceCount}`, "", "", g.totalOpen]);
                g.rows.forEach((r) => {
                    no += 1;
                    aoa.push([
                        no,
                        r.documentNo,
                        r.poReference,
                        (r.dateInvoiced || "").slice(0, 10),
                        r.ageDays,
                        r.bucket,
                        r.grandTotal,
                        r.paid,
                        r.openAmt,
                    ]);
                });
            });

            aoa.push([]);
            aoa.push(["", "", "", "", "", "", "", "Total Outstanding", summary.totalOpen]);
            BUCKET_ORDER.forEach((b) => {
                aoa.push(["", "", "", "", "", b, "", "", summary.byBucket[b]]);
            });

            const worksheet = XLSX.utils.aoa_to_sheet(aoa);
            worksheet["!cols"] = [
                { wch: 6 }, { wch: 16 }, { wch: 14 }, { wch: 12 },
                { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
            ];
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Outstanding Invoice");
            XLSX.writeFile(workbook, `OUTSTANDING-INVOICE-${docType}-${startDate}_${endDate}.xlsx`);
        } catch (err) {
            console.error("Gagal export Excel:", err.message);
            alert("Gagal membuat file Excel.");
        } finally {
            setExportingExcel(false);
        }
    };

    const docTypeLabel = docType === "AR" ? "Piutang (AR)" : docType === "AP" ? "Hutang (AP)" : "Piutang & Hutang";

    return (
        <div className="card-container">
            <PageHeader
                title={`📊 Laporan Outstanding Invoice — ${docTypeLabel}`}
                extraAction={
                    <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={handleExportExcel} disabled={exportingExcel} style={styles.excelBtn}>
                            {exportingExcel ? "⏳ ..." : "📥 Download Excel"}
                        </button>
                        <button onClick={handlePrint} disabled={printing} style={styles.printBtn}>
                            {printing ? "⏳ ..." : "🖨️ Print PDF"}
                        </button>
                    </div>
                }
            />

            {/* ─── Filter bar ─────────────────────────────────────────────── */}
            <div style={styles.filterRow}>
                <div style={styles.dateField}>
                    <label style={styles.fieldLabel}>Date From</label>
                    <input
                        type="date"
                        value={startDate}
                        max={endDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        style={styles.dateInput}
                    />
                </div>
                <div style={styles.dateField}>
                    <label style={styles.fieldLabel}>Date To</label>
                    <input
                        type="date"
                        value={endDate}
                        min={startDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        style={styles.dateInput}
                    />
                </div>
                <div style={styles.dateField}>
                    <label style={styles.fieldLabel}>Jenis Invoice</label>
                    <select
                        value={docType}
                        onChange={(e) => setDocType(e.target.value)}
                        style={styles.dateInput}
                    >
                        <option value="AR">Penjualan (Piutang/AR)</option>
                        <option value="AP">Pembelian (Hutang/AP)</option>
                        <option value="ALL">Semua</option>
                    </select>
                </div>
                <div style={{ ...styles.dateField, flex: 1, minWidth: "200px" }}>
                    <label style={styles.fieldLabel}>Cari {docType === "AP" ? "Vendor" : "Customer"}</label>
                    <input
                        type="text"
                        placeholder="Ketik nama untuk memfilter..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        style={{ ...styles.dateInput, width: "100%", boxSizing: "border-box" }}
                    />
                </div>
            </div>

            {/* ─── Strip ringkasan ────────────────────────────────────────── */}
            <div style={styles.statsRow}>
                <div style={styles.statBox}>
                    <div style={styles.statLabel}>Total Outstanding</div>
                    <div style={styles.statValue}>Rp {fmt(summary.totalOpen)}</div>
                </div>
                <div style={styles.statBox}>
                    <div style={styles.statLabel}>Jumlah Invoice</div>
                    <div style={styles.statValue}>{summary.invoiceCount}</div>
                </div>
                {BUCKET_ORDER.map((b) => (
                    <div key={b} style={styles.statBox}>
                        <div style={styles.statLabel}>Umur {b} hari</div>
                        <div style={{ ...styles.statValue, fontSize: "14px" }}>Rp {fmt(summary.byBucket[b])}</div>
                    </div>
                ))}
                <div style={styles.statBox}>
                    <div style={styles.statLabel}>Umur Tertua</div>
                    <div style={styles.statValue}>{summary.oldest} hari</div>
                </div>
            </div>

            {/* ─── Tabel pivot per Customer/Vendor ────────────────────────── */}
            <div className="detail-section">
                <h3>Detail Outstanding per {docType === "AP" ? "Vendor" : "Customer"}</h3>
                {loading ? (
                    <p>Memuat data...</p>
                ) : groupedByPartner.length === 0 ? (
                    <p style={{ color: "#777" }}>Tidak ada invoice outstanding untuk filter ini. 🎉</p>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table className="modern-table">
                            <thead>
                                <tr>
                                    <th>No. Invoice/Ref</th>
                                    <th>Tgl Invoice</th>
                                    <th style={{ textAlign: "center" }}>Umur</th>
                                    <th style={{ textAlign: "center" }}>Bucket</th>
                                    <th style={{ textAlign: "right" }}>Nilai Invoice</th>
                                    <th style={{ textAlign: "right" }}>Terbayar</th>
                                    <th style={{ textAlign: "right" }}>Outstanding</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupedByPartner.map((g) => (
                                    <React.Fragment key={g.bpartnerId ?? g.bpartnerName}>
                                        <tr style={styles.groupHeaderRow}>
                                            <td colSpan={7}>
                                                <div style={styles.groupHeaderContent}>
                                                    <span style={styles.groupHeaderName}>
                                                        🏢 {g.bpartnerName}
                                                    </span>
                                                    <span style={styles.groupHeaderStats}>
                                                        Invoice: <strong>{g.invoiceCount}</strong>
                                                        &nbsp;&nbsp;|&nbsp;&nbsp;
                                                        Outstanding: <strong>Rp {fmt(g.totalOpen)}</strong>
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                        {g.rows.map((r) => (
                                            <tr key={r.invoiceId}>
                                                <td>{r.documentNo}-{r.poReference}</td>
                                                <td>{(r.dateInvoiced || "").slice(0, 10)}</td>
                                                <td style={{ textAlign: "center" }}>{r.ageDays} hari</td>
                                                <td style={{ textAlign: "center" }}>
                                                    <span style={styles.bucketBadge(r.bucket)}>{r.bucket}</span>
                                                </td>
                                                <td style={{ textAlign: "right" }}>{fmt(r.grandTotal)}</td>
                                                <td style={{ textAlign: "right" }}>{fmt(r.paid)}</td>
                                                <td style={{ textAlign: "right", fontWeight: 600 }}>
                                                    {fmt(r.openAmt)}
                                                </td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={6} style={{ textAlign: "right", fontWeight: "bold" }}>
                                        Total Outstanding
                                    </td>
                                    <td style={{ textAlign: "right", fontWeight: "bold" }}>
                                        Rp {fmt(summary.totalOpen)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

const styles = {
    printBtn: { backgroundColor: "#546e7a", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" },
    excelBtn: { backgroundColor: "#1e7e34", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" },
    filterRow: { display: "flex", gap: "16px", flexWrap: "wrap", margin: "12px 0 16px", alignItems: "flex-end" },
    dateField: { display: "flex", flexDirection: "column", gap: "4px" },
    fieldLabel: { fontSize: "12px", fontWeight: "600", color: "#555" },
    dateInput: { padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px" },
    // Strip ringkasan
    statsRow: { display: "flex", gap: "10px", flexWrap: "wrap", margin: "0 0 16px" },
    statBox: {
        flex: "1 1 140px",
        background: "#f8f9ff",
        border: "1px solid #e0e4f5",
        borderRadius: "8px",
        padding: "10px 14px",
    },
    statLabel: { fontSize: "11.5px", color: "#666", fontWeight: "600", marginBottom: "4px" },
    statValue: { fontSize: "17px", fontWeight: "700", color: "#1a237e" },
    // Baris header ringkasan per grup (ala pivot table)
    groupHeaderRow: { backgroundColor: "#f0f4ff", borderTop: "2px solid #c5cae9", borderBottom: "1px solid #c5cae9" },
    groupHeaderContent: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", padding: "8px 4px" },
    groupHeaderName: { fontWeight: "700", color: "#1a237e", fontSize: "13.5px" },
    groupHeaderStats: { fontSize: "12.5px", color: "#3949ab" },
    // Badge warna bucket aging
    bucketBadge: (bucket) => {
        const colors = {
            "0-30": { background: "#e8f5e9", color: "#2e7d32" },
            "31-60": { background: "#fff8e1", color: "#f9a825" },
            "61-90": { background: "#fff3e0", color: "#ef6c00" },
            ">90": { background: "#ffebee", color: "#c62828" },
        };
        const c = colors[bucket] || colors["0-30"];
        return {
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: "10px",
            fontSize: "11.5px",
            fontWeight: "600",
            background: c.background,
            color: c.color,
        };
    },
};

export default OutstandingInvoiceReport;