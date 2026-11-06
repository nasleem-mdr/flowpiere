// src/features/inventory/report/pages/InventoryStockReport.jsx
// Laporan Inventory / Ketersediaan Stok — HANYA UI.
// Data & filter: hooks/useInventoryStockReport.js
// Print PDF & Excel: hooks/useInventoryStockExport.js
import React, { useState, useEffect, useRef } from "react";
import { PageHeader } from "@/shared/components";

import "@/App.css";
import useInventoryStockReport, { getWarehouseId } from "../hooks/useInventoryStockReport";
import useInventoryStockExport from "../hooks/useInventoryStockExport";
import { listPageStyles as base } from "@/utils/listPageStyles";
import { PiX } from "react-icons/pi";

const InventoryStockReport = () => {
    const {
        loading, errorMsg, warningMsg, refresh,
        groupedByWarehouse, grandTotal,
        warehouseOptions, selectedWarehouseIds, toggleWarehouse, clearWarehouseFilter,
        productSearchText, setProductSearchText,
    } = useInventoryStockReport();

    const { printing, exportingExcel, printPdf, exportExcel } =
        useInventoryStockExport({ groupedByWarehouse, grandTotal });

    // ─── State UI dropdown multi-select gudang ──────────────────────────────
    const [warehouseSearch, setWarehouseSearch] = useState("");
    const [isWarehouseDropdownOpen, setIsWarehouseDropdownOpen] = useState(false);
    const warehouseDropdownRef = useRef(null);

    // Tutup dropdown kalau klik di luar area-nya
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (warehouseDropdownRef.current && !warehouseDropdownRef.current.contains(e.target)) {
                setIsWarehouseDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredWarehouseOptions = warehouseOptions.filter(
        (w) => !warehouseSearch || (w.Name || "").toLowerCase().includes(warehouseSearch.toLowerCase())
    );

    const warehouseFilterLabel =
        selectedWarehouseIds.length === 0 ? "Semua Gudang" : `${selectedWarehouseIds.length} gudang dipilih`;

    const fmt = (n) => n.toLocaleString("id-ID");

    const handlePrint = async () => {
        const res = await printPdf();
        if (!res.ok) alert(res.message);
    };
    const handleExcel = () => {
        const res = exportExcel();
        if (!res.ok) alert(res.message);
    };

    return (
        <div style={styles.cardContainer}>
            <div style={styles.innerContainer}>
            <PageHeader
                title="📦 Laporan Inventory (Ketersediaan Stok)"
                extraAction={
                    <div style={styles.headerActions}>
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
                <div style={{ position: "relative" }} ref={warehouseDropdownRef}>
                    <label style={styles.fieldLabel}>Filter Gudang</label>
                    <button
                        type="button"
                        onClick={() => setIsWarehouseDropdownOpen((v) => !v)}
                        style={styles.warehouseDropdownBtn}
                    >
                        {warehouseFilterLabel} ▾
                    </button>

                    {isWarehouseDropdownOpen && (
                        <div style={styles.warehouseDropdownPanel}>
                            <input
                                type="text"
                                placeholder="Cari gudang..."
                                value={warehouseSearch}
                                onChange={(e) => setWarehouseSearch(e.target.value)}
                                style={styles.warehouseSearchInput}
                            />
                            <div style={styles.warehouseOptionList}>
                                {filteredWarehouseOptions.length === 0 && (
                                    <div style={{ padding: "8px", color: "#888" }}>Tidak ada gudang.</div>
                                )}
                                {filteredWarehouseOptions.map((w) => {
                                    const wid = getWarehouseId(w);
                                    return (
                                        <label key={wid} style={styles.warehouseOptionRow}>
                                            <input
                                                type="checkbox"
                                                checked={selectedWarehouseIds.includes(wid)}
                                                onChange={() => toggleWarehouse(wid)}
                                            />
                                            {w.Name}
                                        </label>
                                    );
                                })}
                            </div>
                            {selectedWarehouseIds.length > 0 && (
                                <button type="button" onClick={clearWarehouseFilter} style={styles.clearFilterBtn}>
                                    Hapus semua pilihan
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div style={styles.field}>
                    <label style={styles.fieldLabel}>Cari Produk</label>
                    <input
                        type="text"
                        placeholder="Ketik nama produk..."
                        value={productSearchText}
                        onChange={(e) => setProductSearchText(e.target.value)}
                        style={styles.textInput}
                    />
                </div>

                <div style={styles.field}>
                    <label style={styles.fieldLabel}>&nbsp;</label>
                    <button onClick={refresh} disabled={loading} style={styles.refreshBtn}>
                        {loading ? "⏳ Memuat..." : "🔄 Refresh"}
                    </button>
                </div>
            </div>

            {/* ─── Pesan error / peringatan ───────────────────────────────── */}
            {errorMsg && (
                <div style={styles.errorBox}>
                    ❌ <strong>Gagal memuat laporan:</strong> {errorMsg}
                </div>
            )}
            {warningMsg && !errorMsg && <div style={styles.warningBox}>⚠ {warningMsg}</div>}

            {/* ─── Ketersediaan Stok per Gudang — ala pivot ───────────────── */}
            <div className="detail-section">
                <h3>Ketersediaan Stok per Gudang</h3>
                {loading ? (
                    <p>Memuat data...</p>
                ) : errorMsg ? null : groupedByWarehouse.length === 0 ? (
                    <p style={{ color: "#777" }}>Tidak ada data untuk filter ini.</p>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table className="modern-table">
                            <thead>
                                <tr>
                                    <th>Produk</th>
                                    <th style={{ textAlign: "right" }}>On Hand</th>
                                    <th style={{ textAlign: "right" }}>Reserved</th>
                                    <th style={{ textAlign: "right" }}>Available</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupedByWarehouse.map((group) => (
                                    <React.Fragment key={group.warehouseId ?? group.warehouseName}>
                                        <tr style={styles.groupHeaderRow}>
                                            <td colSpan={4}>
                                                <div style={styles.groupHeaderContent}>
                                                    <span style={styles.groupHeaderName}>🏭 {group.warehouseName}</span>
                                                    <span style={styles.groupHeaderStats}>
                                                        OnHand: <strong>{fmt(group.totalOnHand)}</strong>
                                                        &nbsp;&nbsp;|&nbsp;&nbsp;
                                                        Reserved: <strong>{fmt(group.totalReserved)}</strong>
                                                        &nbsp;&nbsp;|&nbsp;&nbsp;
                                                        Available: <strong>{fmt(group.totalAvailable)}</strong>
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                        {group.rows.map((r) => (
                                            <tr key={`${r.productId}-${r.warehouseId}`}>
                                                <td>{r.productName}</td>
                                                <td style={{ textAlign: "right" }}>{fmt(r.onHand)}</td>
                                                <td style={{ textAlign: "right" }}>{fmt(r.reserved)}</td>
                                                <td
                                                    style={{
                                                        textAlign: "right",
                                                        fontWeight: r.available <= 0 ? "bold" : "normal",
                                                        color: r.available <= 0 ? "#c62828" : "inherit",
                                                    }}
                                                >
                                                    {fmt(r.available)}
                                                </td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td style={{ fontWeight: "bold" }}>Grand Total</td>
                                    <td style={{ textAlign: "right", fontWeight: "bold" }}>{fmt(grandTotal.onHand)}</td>
                                    <td style={{ textAlign: "right", fontWeight: "bold" }}>{fmt(grandTotal.reserved)}</td>
                                    <td style={{ textAlign: "right", fontWeight: "bold" }}>{fmt(grandTotal.available)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
                <p style={{ marginTop: "8px", fontSize: "12px", color: "#888" }}>
                    On Hand = stok fisik di locator &nbsp;•&nbsp; Reserved = stok yang sudah
                    dialokasikan/dipesan (SO) &nbsp;•&nbsp; Available = On Hand − Reserved
                </p>
            </div>
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
    innerContainer: { backgroundColor: "#fff", padding: "16px", border: "1px solid #ddd", borderRadius: "6px" },
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
    warehouseDropdownBtn: { padding: "8px 14px", borderRadius: "6px", border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontSize: "13px", minWidth: "160px", textAlign: "left" },
    warehouseDropdownPanel: { position: "absolute", top: "100%", left: 0, marginTop: "4px", background: "#fff", border: "1px solid #ddd", borderRadius: "6px", width: "260px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 20, padding: "8px" },
    warehouseSearchInput: { width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid #ccc", marginBottom: "8px", boxSizing: "border-box" },
    warehouseOptionList: { maxHeight: "220px", overflowY: "auto" },
    warehouseOptionRow: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 4px", cursor: "pointer", fontSize: "13px" },
    clearFilterBtn: { marginTop: "8px", width: "100%", padding: "6px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: "4px", cursor: "pointer", fontSize: "12px" },
    errorBox: { background: "#ffebee", border: "1px solid #ef9a9a", color: "#b71c1c", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", marginBottom: "12px", whiteSpace: "pre-line" },
    warningBox: { background: "#fff8e1", border: "1px solid #ffe082", color: "#8d6e00", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", marginBottom: "12px" },
    groupHeaderRow: { backgroundColor: "#eef7ee", borderTop: "2px solid #a5d6a7", borderBottom: "1px solid #a5d6a7" },
    groupHeaderContent: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", padding: "8px 4px" },
    groupHeaderName: { fontWeight: "700", color: "#1b5e20", fontSize: "13.5px" },
    groupHeaderStats: { fontSize: "12.5px", color: "#2e7d32" },
};

export default InventoryStockReport;
                
