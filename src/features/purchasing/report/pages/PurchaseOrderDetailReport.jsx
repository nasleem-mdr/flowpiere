// src/features/purchasing/report/pages/PurchaseOrderDetailReport.jsx
// Laporan Detail Purchase Order (berbasis C_OrderLine, pivot per Produk / Vendor / No. Order) — HANYA UI.
// Data, filter & pivot: hooks/usePurchaseOrderDetailReport.js
// Print PDF & Excel: hooks/usePurchaseOrderDetailExport.js
import React, { useState, useEffect, useRef } from "react";
import { PageHeader } from "@/shared/components";
import "@/App.css";
import usePurchaseOrderDetailReport, {
    getProductId,
    PIVOT_FILTERS,
} from "../hooks/usePurchaseOrderDetailReport";
import { listPageStyles as base } from "@/utils/listPageStyles";
import usePurchaseOrderDetailExport from "../hooks/usePurchaseOrderDetailExport";

const PurchaseOrderDetailReport = () => {
    const {
        loading, errorMsg, refresh,
        groups, grandTotal,
        groupBy, setGroupBy, pivotConfig,
        startDate, setStartDate, endDate, setEndDate,
        productOptions, selectedProductIds, toggleProduct, clearProductFilter,
    } = usePurchaseOrderDetailReport();

    const { printing, exportingExcel, printPdf, exportExcel } =
        usePurchaseOrderDetailExport({ groups, groupBy, grandTotal, startDate, endDate });

    // ─── State UI dropdown multi-select produk ──────────────────────────────
    const [productSearch, setProductSearch] = useState("");
    const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
    const productDropdownRef = useRef(null);

    // Tutup dropdown kalau klik di luar area-nya
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (productDropdownRef.current && !productDropdownRef.current.contains(e.target)) {
                setIsProductDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredProductOptions = productOptions.filter(
        (p) => !productSearch || (p.Name || "").toLowerCase().includes(productSearch.toLowerCase())
    );

    const productFilterLabel =
        selectedProductIds.length === 0 ? "Semua Produk" : `${selectedProductIds.length} produk dipilih`;

    const fmt = (n) => n.toLocaleString("id-ID");

    // Kolom teks detail mengikuti mode pivot; Qty / Harga / Total selalu ada.
    const detailCols = pivotConfig.detailCols;
    const totalColCount = detailCols.length + 3;

    const handlePrint = async () => {
        const res = await printPdf();
        if (!res.ok) alert(res.message);
    };
    const handleExcel = () => {
        const res = exportExcel();
        if (!res.ok) alert(res.message);
    };

    return (
        <div style={base.cardContainer}>
            <PageHeader
                title="🛒 Laporan Detail Purchase Order"
                filters={PIVOT_FILTERS}
                activeFilter={groupBy}
                onFilterChange={setGroupBy}
                extraAction={
                    <div style={base.headerActions}>
                        <button onClick={handleExcel} disabled={exportingExcel} style={styles.excelBtn}>
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
                <div style={styles.field}>
                    <label style={styles.fieldLabel}>Date From</label>
                    <input
                        type="date"
                        value={startDate}
                        max={endDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        style={styles.dateInput}
                    />
                </div>
                <div style={styles.field}>
                    <label style={styles.fieldLabel}>Date To</label>
                    <input
                        type="date"
                        value={endDate}
                        min={startDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        style={styles.dateInput}
                    />
                </div>

                <div style={{ position: "relative" }} ref={productDropdownRef}>
                    <label style={styles.fieldLabel}>Filter Produk</label>
                    <button
                        type="button"
                        onClick={() => setIsProductDropdownOpen((v) => !v)}
                        style={styles.productDropdownBtn}
                    >
                        {productFilterLabel} ▾
                    </button>

                    {isProductDropdownOpen && (
                        <div style={styles.productDropdownPanel}>
                            <input
                                type="text"
                                placeholder="Cari produk..."
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                style={styles.productSearchInput}
                            />
                            <div style={styles.productOptionList}>
                                {filteredProductOptions.length === 0 && (
                                    <div style={{ padding: "8px", color: "#888" }}>Tidak ada produk.</div>
                                )}
                                {filteredProductOptions.map((p) => {
                                    const pid = getProductId(p);
                                    return (
                                        <label key={pid} style={styles.productOptionRow}>
                                            <input
                                                type="checkbox"
                                                checked={selectedProductIds.includes(pid)}
                                                onChange={() => toggleProduct(pid)}
                                            />
                                            {p.Name}
                                        </label>
                                    );
                                })}
                            </div>
                            {selectedProductIds.length > 0 && (
                                <button type="button" onClick={clearProductFilter} style={styles.clearFilterBtn}>
                                    Hapus semua pilihan
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div style={styles.field}>
                    <label style={styles.fieldLabel}>&nbsp;</label>
                    <button onClick={refresh} disabled={loading} style={styles.refreshBtn}>
                        {loading ? "⏳ Memuat..." : "🔄 Refresh"}
                    </button>
                </div>
            </div>

            {/* ─── Pesan error ────────────────────────────────────────────── */}
            {errorMsg && (
                <div style={styles.errorBox}>
                    ❌ <strong>Gagal memuat laporan:</strong> {errorMsg}
                </div>
            )}

            {/* ─── Detail Transaksi — pivot sesuai mode terpilih ──────────── */}
            <div style={styles.detailSection}>
                <h3 style={styles.detailTitle}>Detail Transaksi {pivotConfig.label}</h3>
                {loading ? (
                    <p>Memuat data...</p>
                ) : errorMsg ? null : groups.length === 0 ? (
                    <p style={{ color: "#777" }}>Tidak ada data untuk filter ini.</p>
                ) : (
                    <div style={base.tableResponsiveContainer}>
                        <table className="modern-table">
                            <thead>
                                <tr>
                                    {detailCols.map((c) => (
                                        <th key={c.key}>{c.label}</th>
                                    ))}
                                    <th style={{ textAlign: "right" }}>Qty</th>
                                    <th style={{ textAlign: "right" }}>Harga</th>
                                    <th style={{ textAlign: "right" }}>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map((group) => (
                                    <React.Fragment key={group.key}>
                                        <tr style={styles.groupHeaderRow}>
                                            <td colSpan={totalColCount}>
                                                <div style={styles.groupHeaderContent}>
                                                    <span style={styles.groupHeaderName}>
                                                        {pivotConfig.icon} {group.label}
                                                    </span>
                                                    <span style={styles.groupHeaderStats}>
                                                        Qty: <strong>{fmt(group.totalQty)}</strong>
                                                        &nbsp;&nbsp;|&nbsp;&nbsp;
                                                        Total: <strong>{fmt(group.totalAmount)}</strong>
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                        {group.rows.map((r) => (
                                            <tr key={r.key}>
                                                {detailCols.map((c) => (
                                                    <td key={c.key}>{r[c.key]}</td>
                                                ))}
                                                <td style={{ textAlign: "right" }}>{fmt(r.qty)}</td>
                                                <td style={{ textAlign: "right" }}>{fmt(r.price)}</td>
                                                <td style={{ textAlign: "right" }}>{fmt(r.lineTotal)}</td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={totalColCount - 1} style={{ textAlign: "right", fontWeight: "bold" }}>Grand Total</td>
                                    <td style={{ textAlign: "right", fontWeight: "bold" }}>{fmt(grandTotal)}</td>
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
    // tombol: varian dari newBtn
    printBtn:   { ...base.newBtn, backgroundColor: "#546e7a", padding: "10px 18px" },
    excelBtn:   { ...base.newBtn, backgroundColor: "#1e7e34", padding: "10px 18px" },
    refreshBtn: { ...base.newBtn, backgroundColor: "#1565c0", padding: "8px 16px" },

    // filter: pakai dasar yang sama, override seperlunya
    filterRow:  { ...base.dateFilterRow, gap: "16px", margin: "12px 0 20px" },
    field:      { ...base.dateField, width: "auto", minWidth: "160px" },
    fieldLabel: base.dateLabel,
    dateInput:  base.dateInput,

    // khusus laporan, tetap lokal
    productDropdownBtn: { padding: "8px 14px", borderRadius: "6px", border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontSize: "13px", minWidth: "160px", textAlign: "left" },
    productDropdownPanel: { position: "absolute", top: "100%", left: 0, marginTop: "4px", background: "#fff", border: "1px solid #ddd", borderRadius: "6px", width: "260px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 20, padding: "8px" },
    productSearchInput: { width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid #ccc", marginBottom: "8px", boxSizing: "border-box" },
    productOptionList: { maxHeight: "220px", overflowY: "auto" },
    productOptionRow: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 4px", cursor: "pointer", fontSize: "13px" },
    clearFilterBtn: { marginTop: "8px", width: "100%", padding: "6px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: "4px", cursor: "pointer", fontSize: "12px" },
    errorBox: { background: "#ffebee", border: "1px solid #ef9a9a", color: "#b71c1c", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", marginBottom: "12px", whiteSpace: "pre-line" },

    // header grup (pivot) — oranye
    groupHeaderRow: { backgroundColor: "#fff3e0", borderTop: "2px solid #ffcc80", borderBottom: "1px solid #ffcc80" },
    groupHeaderContent: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", padding: "8px 4px" },
    groupHeaderName: { fontWeight: "700", color: "#e65100", fontSize: "13.5px" },
    groupHeaderStats: { fontSize: "12.5px", color: "#ef6c00" },

    detailSection: { marginTop: "4px", padding: "20px", borderRadius: "6px", backgroundColor: "#f5f6f8", border: "1px solid #ddd" },
    detailTitle: { margin: "0 0 12px", fontSize: "15px", fontWeight: "700", color: "#1a2233" },
};
export default PurchaseOrderDetailReport;