// src/features/sales/invoice/pages/InvoiceImport.jsx
// 👉 Sesuaikan lokasi folder & route "/invoice" dengan struktur project Anda.
import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/shared/components";
import {
    parseCsvText,
    buildColumnMap,
    rowsToObjects,
    groupInvoiceRows,
    REQUIRED_COLUMNS,
    columnLabel,
} from "../utils/invoiceCsvParser";
import useInvoiceImport from "../hooks/useInvoiceImport";
import "@/App.css";

// ─── Kolom template CSV (urutan & nama = Export_C_Invoice.csv) ─────────────
// `key` = kolom internal di invoiceCsvParser.js. Kolom header cukup diisi
// di baris pertama tiap invoice; baris berikutnya hanya kolom C_InvoiceLine>.
const TEMPLATE_COLUMNS = [
    { key: "org", label: "AD_Org_ID[Name]", example: "NamaOrganisasi" },
    { key: "document_no", label: "DocumentNo", example: "150010" },
    { key: "po_reference", label: "POReference", example: "" },
    { key: "description", label: "Description", example: "Keterangan invoice" },
    { key: "doctype", label: "C_DocTypeTarget_ID[Name]", example: "AR Invoice" },
    { key: "date_invoiced", label: "DateInvoiced", example: "2026-09-25" },
    { key: "date_acct", label: "DateAcct", example: "2026-09-25" },
    { key: "bpartner", label: "C_BPartner_ID[Value]", example: "KODE-PARTNER" },
    { key: "bpartner_location", label: "C_BPartner_Location_ID[Name]", example: "" },
    { key: "contact", label: "AD_User_ID[Name]", example: "" },
    { key: "pricelist", label: "M_PriceList_ID[Name]", example: "Standard" },
    { key: "conversion_type", label: "C_ConversionType_ID[Value]", example: "S" },
    { key: "override_rate", label: "IsOverrideCurrencyRate", example: "N" },
    { key: "currency_rate", label: "CurrencyRate", example: "" },
    { key: "sales_rep", label: "SalesRep_ID[Name]", example: "" },
    { key: "discount_printed", label: "IsDiscountPrinted", example: "N" },
    { key: "payment_rule", label: "PaymentRule", example: "Cash" },
    { key: "payment_term", label: "C_PaymentTerm_ID[Value]", example: "Immediate" },
    { key: "project", label: "C_Project_ID[Value]", example: "" },
    { key: "activity", label: "C_Activity_ID[Value]", example: "" },
    { key: "org_trx", label: "AD_OrgTrx_ID[Name]", example: "" },
    { key: "department", label: "C_Department_ID[Value]", example: "" },
    { key: "bank_account", label: "C_BankAccount_ID[Value]", example: "" },
    { key: "line_org", label: "C_InvoiceLine>AD_Org_ID[Name]", example: "NamaOrganisasi" },
    { key: "line_invoice", label: "C_InvoiceLine>C_Invoice_ID[DocumentNo]", example: "150010" },
    { key: "line_no", label: "C_InvoiceLine>Line", example: "10" },
    { key: "line_product", label: "C_InvoiceLine>M_Product_ID[Value]", example: "KODE-PRODUK-1" },
    { key: "line_description", label: "C_InvoiceLine>Description", example: "" },
    { key: "line_qty", label: "C_InvoiceLine>QtyEntered", example: "100" },
    { key: "line_uom", label: "C_InvoiceLine>C_UOM_ID[Name]", example: "Each" },
    { key: "line_price", label: "C_InvoiceLine>PriceEntered", example: "200" },
    { key: "line_price_list", label: "C_InvoiceLine>PriceList", example: "200" },
    { key: "line_tax", label: "C_InvoiceLine>C_Tax_ID[Name]", example: "Standard" },
];

// Baris contoh kedua: invoice SAMA, line berikutnya. Kolom header dikosongkan.
const SECOND_LINE_EXAMPLE = {
    line_org: "NamaOrganisasi",
    line_invoice: "150010",
    line_no: "20",
    line_product: "KODE-PRODUK-2",
    line_qty: "1",
    line_uom: "Each",
    line_price: "2000",
    line_price_list: "2000",
    line_tax: "Standard",
};

const fmtMoney = (n) => Number(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });

const InvoiceImport = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const [dragOver, setDragOver] = useState(false);

    const [fileName, setFileName] = useState(null);
    const [rows, setRows] = useState([]);
    const [parseError, setParseError] = useState(null);
    const [showOnlyProblems, setShowOnlyProblems] = useState(false);
    const [completeAfter, setCompleteAfter] = useState(false);

    const { phase, progress, summary, validateRows, startImport } = useInvoiceImport();

    const validRows = rows.filter((r) => r._status === "valid");
    const failedRows = rows.filter((r) => r._status === "failed");
    const visibleRows = showOnlyProblems
        ? rows.filter((r) => r._status === "invalid" || r._status === "failed")
        : rows;

    const csvEscape = (v) => {
        const s = String(v ?? "");
        return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    // ─── Template CSV: header + 2 baris contoh (1 invoice, 2 line) ────────
    const downloadTemplate = () => {
        const headers = TEMPLATE_COLUMNS.map((c) => c.label);
        const example = TEMPLATE_COLUMNS.map((c) => c.example);
        const example2 = TEMPLATE_COLUMNS.map((c) => SECOND_LINE_EXAMPLE[c.key] ?? "");

        const csv = "\uFEFF" + [headers, example, example2].map((r) => r.map(csvEscape).join(",")).join("\r\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "template-import-invoice.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    // ─── Baca & validasi file ─────────────────────────────────────────────
    const handleFile = async (file) => {
        if (!file) return;
        setFileName(file.name);
        setParseError(null);
        setRows([]);
        setShowOnlyProblems(false);
        try {
            const text = await file.text();
            const parsed = parseCsvText(text);
            const colMap = buildColumnMap(parsed.headers); // lempar Error kalau kolom wajib kurang
            const objects = rowsToObjects(parsed, colMap);
            if (objects.length === 0) {
                setParseError("File tidak berisi baris data (hanya header / kosong).");
                return;
            }
            // Gabungkan baris per DocumentNo jadi 1 invoice dengan banyak line
            const invoices = groupInvoiceRows(objects);
            setRows(invoices);
            await validateRows(invoices); // mutasi _status/_errors/_resolved per invoice
            setRows([...invoices]);
        } catch (err) {
            setParseError(err.message);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    };

    // ─── Import & retry ───────────────────────────────────────────────────
    const handleImport = async () => {
        await startImport(validRows, { complete: completeAfter });
        setRows([...rows]);
    };

    const handleRetryFailed = async () => {
        // Re-validasi dulu. Invoice yang sudah ter-create (punya _invoiceId)
        // dilewati dari cek duplikat, jadi retry hanya melanjutkan sisa
        // langkah (line / complete) yang belum berhasil.
        const revalidated = await validateRows(failedRows);
        const retryable = revalidated.filter((r) => r._status === "valid");
        setRows([...rows]);
        if (retryable.length === 0) return;
        await startImport(retryable, { complete: completeAfter });
        setRows([...rows]);
    };

    const busy = phase === "importing" || phase === "validating";

    return (
        <div className="card-container">
            <PageHeader
                title="📥 Import Invoice (CSV)"
                extraAction={
                    <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={downloadTemplate} style={styles.templateBtn}>⬇️ Download Template</button>
                        <button onClick={() => navigate("/invoice")} style={styles.backBtn}>← Kembali ke List</button>
                    </div>
                }
            />

            <div style={styles.infoBox}>
                <strong>Format file</strong> sama dengan Export C_Invoice iDempiere. <strong>Kolom wajib:</strong>{" "}
                {REQUIRED_COLUMNS.map(columnLabel).join(", ")} (plus Payment Term &amp; Tax per line).
                FK diisi dengan <em>Value/Name</em> sesuai nama kolom ([Value] / [Name]).
                Angka boleh format Indonesia (1.500.000,50); tanggal <code>yyyy-mm-dd</code> atau <code>dd/mm/yyyy</code>.
                File Excel? Save As dulu jadi CSV.
                <br />
                <strong>Banyak line per invoice:</strong> baris pertama berisi data header + line pertama; baris
                berikutnya cukup kolom <code>C_InvoiceLine&gt;</code> (header dikosongkan). Baris dengan{" "}
                <code>DocumentNo</code> yang sama otomatis digabung. <code>DocumentNo</code> kosong = nomor
                di-generate iDempiere (satu baris yang mengisi data header = satu invoice baru).
                <br />
                Invoice dibuat berstatus <strong>Draft</strong> kecuali opsi <em>Complete</em> dicentang.
                UOM line harus sama dengan UOM produk.
            </div>

            {/* ─── Drop zone / file picker ─────────────────────────────── */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{ ...styles.dropZone, ...(dragOver ? styles.dropZoneActive : {}) }}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    style={{ display: "none" }}
                    onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
                />
                <div style={{ fontSize: "32px" }}>📄</div>
                <div>
                    {fileName ? (
                        <strong>{fileName}</strong>
                    ) : (
                        <>Klik untuk pilih file CSV, atau drag &amp; drop ke sini</>
                    )}
                </div>
                <div style={{ fontSize: "12px", color: "#888" }}>Delimiter koma (,) atau titik koma (;) otomatis dideteksi</div>
            </div>

            {parseError && <div style={styles.errorBox}>❌ {parseError}</div>}

            {/* ─── Progress import ─────────────────────────────────────── */}
            {phase === "importing" && (
                <div style={styles.progressWrap}>
                    <div style={styles.progressBar}>
                        <div style={{ ...styles.progressFill, width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
                    </div>
                    <span style={{ fontSize: "12.5px", color: "#555" }}>
                        {progress.done}/{progress.total} — {progress.current || "..."}
                    </span>
                </div>
            )}

            {/* ─── Ringkasan hasil ─────────────────────────────────────── */}
            {summary && (
                <div style={{ ...styles.summaryBox, background: summary.failed === 0 ? "#e8f5e9" : "#fff8e1" }}>
                    {summary.failed === 0
                        ? `✅ Import selesai: ${summary.success} invoice berhasil dibuat.`
                        : `⚠️ Import selesai: ${summary.success} berhasil, ${summary.failed} gagal — perbaiki baris yang gagal (lihat kolom Status) lalu klik "Ulangi yang Gagal".`}
                </div>
            )}

            {/* ─── Preview + hasil per invoice ─────────────────────────── */}
            {rows.length > 0 && (
                <div className="detail-section">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
                        <h3 style={{ margin: 0 }}>
                            Preview ({validRows.length} valid / {rows.filter((r) => r._status === "invalid").length} bermasalah / {failedRows.length} gagal import)
                        </h3>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                            <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "5px" }}>
                                <input type="checkbox" checked={showOnlyProblems} onChange={(e) => setShowOnlyProblems(e.target.checked)} />
                                Hanya tampilkan bermasalah
                            </label>
                            <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "5px" }}>
                                <input type="checkbox" checked={completeAfter} disabled={busy} onChange={(e) => setCompleteAfter(e.target.checked)} />
                                Complete (CO) setelah import
                            </label>
                            {failedRows.length > 0 && !busy && (
                                <button onClick={handleRetryFailed} style={styles.retryBtn}>🔁 Ulangi yang Gagal ({failedRows.length})</button>
                            )}
                            <button onClick={handleImport} disabled={validRows.length === 0 || busy} style={styles.importBtn}>
                                🚀 Import {validRows.length} Invoice
                            </button>
                        </div>
                    </div>

                    <div style={{ maxHeight: "520px", overflowY: "auto", overflowX: "auto" }}>
                        <table className="modern-table">
                            <thead>
                                <tr>
                                    <th style={{ width: "70px" }}>Baris</th>
                                    <th>Document No</th>
                                    <th>Tipe Dokumen</th>
                                    <th>Tgl Invoice</th>
                                    <th>Partner</th>
                                    <th>Price List</th>
                                    <th style={{ minWidth: "260px" }}>Line</th>
                                    <th style={{ textAlign: "right" }}>Total</th>
                                    <th style={{ width: "240px" }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map((r) => (
                                    <tr key={r._row} style={r._status === "failed" ? { backgroundColor: "#fff5f5" } : {}}>
                                        <td>{(r._rows || [r._row]).join(", ")}</td>
                                        <td>{r._documentNo || r.document_no || "(otomatis)"}</td>
                                        <td>{r.doctype}</td>
                                        <td>{r.date_invoiced}</td>
                                        <td>{r.bpartner}</td>
                                        <td>{r.pricelist}</td>
                                        <td><LinesCell row={r} /></td>
                                        <td style={{ textAlign: "right" }}>{r._total ? fmtMoney(r._total) : "-"}</td>
                                        <td><StatusCell row={r} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Daftar line per invoice ──────────────────────────────────────────────
const LinesCell = ({ row }) => {
    const lines = row.lines || [];
    if (lines.length === 0) return <span>-</span>;
    return (
        <div>
            {lines.map((l) => (
                <div key={l._row} style={{ fontSize: "12px", lineHeight: 1.5 }}>
                    <span style={{ color: "#666" }}>{l.line_no || "·"}</span>{" "}
                    {l.line_product || "(tanpa produk)"} × <strong>{l.line_qty || 0}</strong>
                    {l.line_uom ? ` ${l.line_uom}` : ""} @ {l.line_price || 0}
                </div>
            ))}
        </div>
    );
};

// ─── Badge + pesan error per invoice ──────────────────────────────────────
const StatusCell = ({ row }) => {
    if (row._status === "valid") return <span style={styles.badge("#e8f5e9", "#2e7d32")}>✔ Valid</span>;
    if (row._status === "success") {
        return (
            <span>
                <span style={styles.badge("#e8f5e9", "#2e7d32")}>✅ Berhasil</span>
                <span style={{ fontSize: "11.5px", color: "#666", marginLeft: "6px" }}>
                    ID: {row._invoiceId}
                    {row._linesDone?.size > 0 && ` • ${row._linesDone.size} line`}
                    {row._completed ? " • Completed" : " • Draft"}
                </span>
            </span>
        );
    }
    if (row._status === "failed") {
        return (
            <div>
                <span style={styles.badge("#ffebee", "#c62828")}>❌ Gagal import</span>
                {row._invoiceId && (
                    <div style={{ fontSize: "11.5px", color: "#666", marginTop: "3px" }}>
                        Invoice sudah dibuat (ID: {row._invoiceId}
                        {row._linesDone?.size > 0 && `, ${row._linesDone.size} line OK`}) — klik "Ulangi yang Gagal" untuk melanjutkan sisanya.
                    </div>
                )}
                <div style={{ fontSize: "11.5px", color: "#c62828", marginTop: "3px" }}>{row._error}</div>
            </div>
        );
    }
    return (
        <div>
            <span style={styles.badge("#ffebee", "#c62828")}>⚠ {row._errors?.length || 0} masalah</span>
            <div style={{ fontSize: "11.5px", color: "#c62828", marginTop: "3px" }}>
                {(row._errors || []).join(" • ")}
            </div>
        </div>
    );
};

const styles = {
    templateBtn: { backgroundColor: "#1e7e34", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" },
    backBtn: { backgroundColor: "#546e7a", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" },
    importBtn: { backgroundColor: "#1565c0", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" },
    retryBtn: { backgroundColor: "#ef6c00", color: "#fff", border: "none", padding: "10px 14px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" },
    infoBox: {
        background: "#f0f4ff", border: "1px solid #c5cae9", borderRadius: "8px",
        padding: "10px 14px", fontSize: "13px", color: "#333", marginBottom: "14px", lineHeight: 1.6,
    },
    dropZone: {
        border: "2px dashed #90a4ae", borderRadius: "10px", padding: "28px 16px",
        textAlign: "center", cursor: "pointer", color: "#546e7a", background: "#fafbfc",
        marginBottom: "14px", transition: "all .15s",
    },
    dropZoneActive: { borderColor: "#1565c0", background: "#e3f2fd" },
    errorBox: {
        background: "#ffebee", border: "1px solid #ef9a9a", color: "#c62828",
        borderRadius: "8px", padding: "10px 14px", fontSize: "13px", marginBottom: "14px", whiteSpace: "pre-line",
    },
    progressWrap: { margin: "10px 0 16px" },
    progressBar: { height: "10px", background: "#e0e0e0", borderRadius: "6px", overflow: "hidden", marginBottom: "6px" },
    progressFill: { height: "100%", background: "#1565c0", transition: "width .2s" },
    summaryBox: { borderRadius: "8px", padding: "12px 14px", fontSize: "13.5px", fontWeight: 600, marginBottom: "14px" },
    badge: (bg, color) => ({
        display: "inline-block", padding: "3px 10px", borderRadius: "10px",
        fontSize: "12px", fontWeight: "600", background: bg, color,
    }),
};

export default InvoiceImport;
