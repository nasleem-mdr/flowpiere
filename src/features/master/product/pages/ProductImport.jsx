// src/features/master/product/pages/ProductImport.jsx
import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { idempiereApi } from "@/api/idempiereApi";
import { PageHeader } from "@/shared/components";
import {
    parseCsvText,
    buildColumnMap,
    rowsToObjects,
    groupProductRows,
    REQUIRED_COLUMNS,
} from "../utils/productCsvParser";
import useProductImport from "../hooks/useProductImport";
import "@/App.css";

// ─── Kolom template CSV (urutan = urutan kolom di file) ───────────────────
// 4 kolom pertama WAJIB (mirror validasi mandatory ProductDetail.jsx),
// sisanya opsional. Header boleh pakai alias lain (lihat HEADER_ALIASES
// di productCsvParser.js), asal kolom wajibnya ada.
const TEMPLATE_COLUMNS = [
    { key: "value", label: "value", required: true, example: "STA-001", hint: "Search Key — unik. Ulangi di baris berikutnya untuk menambah price list" },
    { key: "name", label: "name", required: true, example: "Buku Tukis 100lbr", hint: "Nama produk" },
    { key: "description", label: "description", required: false, example: "Buku Tulis berisi 100 lembar halaman", hint: "" },
    { key: "upc", label: "upc", required: false, example: "8999999000011", hint: "UPC/EAN (barcode)" },
    { key: "product_category", label: "product_category", required: true, example: "Stationary", hint: "Nama kategori (bukan ID juga boleh)" },
    { key: "uom", label: "uom", required: true, example: "Each", hint: "Nama satuan" },
    { key: "charge", label: "c_charge_id", required: false, example: "", hint: "Default charge Internal Use — nama Charge (angka ID juga boleh)" },
    { key: "is_purchased", label: "is_purchased", required: false, example: "Y", hint: "Y/N, default N" },
    { key: "is_sold", label: "is_sold", required: false, example: "Y", hint: "Y/N, default N" },
    { key: "is_stocked", label: "is_stocked", required: false, example: "Y", hint: "Y/N, default Y" },
    { key: "is_bom", label: "is_bom", required: false, example: "N", hint: "Y/N — komponen BOM tetap diisi lewat halaman edit" },
    { key: "markup_percent", label: "markup_percent", required: false, example: "25", hint: "Angka %" },
    { key: "rounding_type", label: "rounding_type", required: false, example: "100", hint: "0/50/100/500/1000/5000/10000" },
    { key: "vendor", label: "vendor", required: false, example: "PT ABC", hint: "Nama vendor (IsVendor)" },
    { key: "vendor_product_no", label: "vendor_product_no", required: false, example: "SKU-VENDOR-1", hint: "Default = name kalau kosong" },
    { key: "vendor_price_list", label: "vendor_price_list", required: false, example: "15000", hint: "Harga beli vendor" },
    { key: "vendor_price_last_po", label: "vendor_price_last_po", required: false, example: "14000", hint: "Harga PO terakhir" },
    { key: "price_list_version", label: "price_list_version", required: false, example: "Standard2026", hint: "Wajib kalau ada harga jual. Satu baris = satu price list" },
    { key: "sales_price_list", label: "sales_price_list", required: false, example: "20000", hint: "" },
    { key: "sales_price_std", label: "sales_price_std", required: false, example: "20000", hint: "Harga jual" },
    { key: "sales_price_limit", label: "sales_price_limit", required: false, example: "18000", hint: "" },
];

// Baris contoh kedua di template: produk SAMA (value sama), price list lain.
// Kolom produk dikosongkan — cukup value + kolom price list.
const SECOND_PRICE_EXAMPLE = {
    value: "STA-001",
    price_list_version: "Purchase Price 2026",
    sales_price_list: "15000",
    sales_price_std: "15000",
    sales_price_limit: "14000",
};

const ProductImport = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const [dragOver, setDragOver] = useState(false);

    const [fileName, setFileName] = useState(null);
    const [rows, setRows] = useState([]);
    const [parseError, setParseError] = useState(null);
    const [showOnlyProblems, setShowOnlyProblems] = useState(false);

    const { phase, progress, summary, validateRows, startImport } = useProductImport();

    const validRows = rows.filter((r) => r._status === "valid");
    const failedRows = rows.filter((r) => r._status === "failed");
    const visibleRows = showOnlyProblems
        ? rows.filter((r) => r._status === "invalid" || r._status === "failed")
        : rows;

    const csvEscape = (v) => {
        const s = String(v ?? "");
        return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    // ─── Template CSV: header + 2 baris contoh (produk yang sama dengan 2
    //     price list). Kategori/UOM diisi default dari server kalau bisa,
    //     supaya contohnya langsung relevan ───────────────────────────────
    const downloadTemplate = async () => {
        let exampleCategory = "NamaKategori";
        let exampleUom = "Each";
        try {
            const [catRes, uomRes] = await Promise.all([
                idempiereApi(`/models/m_product_category?$filter=IsActive eq true&$select=Name,IsDefault&$top=1`),
                idempiereApi(`/models/c_uom?$filter=IsActive eq true&$select=Name,IsDefault&$top=1`),
            ]);
            const cat = (catRes.records || [])[0];
            const uom = (uomRes.records || [])[0];
            if (cat?.Name) exampleCategory = cat.Name;
            if (uom?.Name) exampleUom = uom.Name;
        } catch (_) { /* pakai placeholder saja */ }

        const headers = TEMPLATE_COLUMNS.map((c) => c.label);
        const example = TEMPLATE_COLUMNS.map((c) => {
            if (c.key === "product_category") return exampleCategory;
            if (c.key === "uom") return exampleUom;
            return c.example;
        });
        const example2 = TEMPLATE_COLUMNS.map((c) => SECOND_PRICE_EXAMPLE[c.key] ?? "");

        const csv = "\uFEFF" + [headers, example, example2].map((r) => r.map(csvEscape).join(",")).join("\r\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "template-import-produk.csv";
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
            // Gabungkan baris ber-value sama jadi 1 produk dengan banyak price list
            const products = groupProductRows(objects);
            setRows(products);
            await validateRows(products); // mutasi _status/_errors/_resolved per produk
            setRows([...products]);
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
        await startImport(validRows);
        setRows([...rows]);
    };

    const handleRetryFailed = async () => {
        // Re-validasi dulu. Produk yang sudah ter-create (punya _productId)
        // dilewati dari cek duplikat, jadi retry hanya melanjutkan sisa
        // langkah (vendor/harga) yang belum berhasil.
        const revalidated = await validateRows(failedRows);
        const retryable = revalidated.filter((r) => r._status === "valid");
        setRows([...rows]);
        if (retryable.length === 0) return;
        await startImport(retryable);
        setRows([...rows]);
    };

    const busy = phase === "importing" || phase === "validating";

    return (
        <div className="card-container">
            <PageHeader
                title="📥 Import Produk (CSV)"
                extraAction={
                    <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={downloadTemplate} style={styles.templateBtn}>⬇️ Download Template</button>
                        <button onClick={() => navigate("/product")} style={styles.backBtn}>← Kembali ke List</button>
                    </div>
                }
            />

            {/* Info singkat aturan mandatory */}
            <div style={styles.infoBox}>
                <strong>Kolom wajib:</strong> {REQUIRED_COLUMNS.join(", ")} — sama seperti form ProductDetail.
                Kategori &amp; UOM bisa pakai <em>nama</em> atau <em>ID angka</em>.
                Angka boleh format Indonesia (1.500.000,50). File Excel? Save As dulu jadi CSV.
                Produk <strong>IsBOM</strong> diimpor hanya flag-nya, komponen BOM diisi lewat halaman edit.
                <br />
                <strong>Banyak Price List per produk:</strong> tulis produk yang sama di beberapa baris dengan{" "}
                <code>value</code> yang sama — satu baris per <code>price_list_version</code>. Data produk
                cukup diisi di baris pertama; baris berikutnya boleh hanya <code>value</code> + kolom harga jual.
                <br />                
                <strong>Kolom UPC/EAN:</strong> <code>upc</code> opsional. Di Excel, format kolom ini sebagai
                Text supaya barcode tidak berubah jadi notasi ilmiah (8.999E+12) atau kehilangan angka 0 di depan.
                
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
                        ? `✅ Import selesai: ${summary.success} produk berhasil dibuat.`
                        : `⚠️ Import selesai: ${summary.success} berhasil, ${summary.failed} gagal — perbaiki baris yang gagal (lihat kolom Status) lalu klik "Ulangi yang Gagal".`}
                </div>
            )}

            {/* ─── Preview + hasil per produk ──────────────────────────── */}
            {rows.length > 0 && (
                <div className="detail-section">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
                        <h3 style={{ margin: 0 }}>
                            Preview ({validRows.length} valid / {rows.filter((r) => r._status === "invalid").length} bermasalah / {failedRows.length} gagal import)
                        </h3>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                            <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "5px" }}>
                                <input type="checkbox" checked={showOnlyProblems} onChange={(e) => setShowOnlyProblems(e.target.checked)} />
                                Hanya tampilkan bermasalah
                            </label>
                            {failedRows.length > 0 && !busy && (
                                <button onClick={handleRetryFailed} style={styles.retryBtn}>🔁 Ulangi yang Gagal ({failedRows.length})</button>
                            )}
                            <button onClick={handleImport} disabled={validRows.length === 0 || busy} style={styles.importBtn}>
                                🚀 Import {validRows.length} Produk
                            </button>
                        </div>
                    </div>

                    <div style={{ maxHeight: "520px", overflowY: "auto", overflowX: "auto" }}>
                        <table className="modern-table">
                            <thead>
                                <tr>
                                    <th style={{ width: "70px" }}>Baris</th>
                                    <th>Search Key</th>
                                    <th>Name</th>
                                    <th>UPC/EAN</th>
                                    <th>Kategori</th>
                                    <th>UOM</th>
                                    <th>Charge</th>
                                    <th>Vendor</th>
                                    <th style={{ textAlign: "right", minWidth: "200px" }}>Harga Jual (Std) per Price List</th>
                                    <th style={{ width: "240px" }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map((r) => (
                                    <tr key={r._row} style={r._status === "failed" ? { backgroundColor: "#fff5f5" } : {}}>
                                        <td>{(r._rows || [r._row]).join(", ")}</td>
                                        <td>{r.value}</td>
                                        <td>{r.name}</td>
                                        <td>{r.upc || "-"}</td>
                                        <td>{r.product_category}</td>
                                        <td>{r.uom}</td>
                                        <td>{r.charge || "-"}</td>
                                        <td>{r.vendor || "-"}</td>
                                        <td style={{ textAlign: "right" }}>
                                            <PriceCell row={r} />
                                        </td>
                                        <td>
                                            <StatusCell row={r} />
                                        </td>
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

// ─── Daftar harga jual per price list version ─────────────────────────────
const PriceCell = ({ row }) => {
    const prices = row.prices || [];
    if (prices.length === 0) return <span>-</span>;
    return (
        <div>
            {prices.map((p) => (
                <div key={p._row} style={{ fontSize: "12px", lineHeight: 1.5 }}>
                    <span style={{ color: "#666" }}>{p.price_list_version || "(tanpa PLV)"}:</span>{" "}
                    <strong>{p.sales_price_std || 0}</strong>
                </div>
            ))}
        </div>
    );
};

// ─── Badge + pesan error per baris ────────────────────────────────────────
const StatusCell = ({ row }) => {
    if (row._status === "valid") return <span style={styles.badge("#e8f5e9", "#2e7d32")}>✔ Valid</span>;
    if (row._status === "success") {
        return (
            <span>
                <span style={styles.badge("#e8f5e9", "#2e7d32")}>✅ Berhasil</span>
                <span style={{ fontSize: "11.5px", color: "#666", marginLeft: "6px" }}>
                    ID: {row._productId}
                    {row._pricesDone?.size > 0 && ` • ${row._pricesDone.size} price list`}
                </span>
            </span>
        );
    }
    if (row._status === "failed") {
        return (
            <div>
                <span style={styles.badge("#ffebee", "#c62828")}>❌ Gagal import</span>
                {row._productId && (
                    <div style={{ fontSize: "11.5px", color: "#666", marginTop: "3px" }}>
                        Produk sudah dibuat (ID: {row._productId}
                        {row._pricesDone?.size > 0 && `, ${row._pricesDone.size} price list OK`}) — klik "Ulangi yang Gagal" untuk melanjutkan sisanya.
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

export default ProductImport;