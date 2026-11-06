import React, { useState, useEffect, useRef } from "react";
import { PageHeader } from "@/shared/components";
import { listPageStyles as base } from "@/utils/listPageStyles";
import { useGeneralLedger } from "@/features/reporting/financial/hooks/useGeneralLedger";
import { useGeneralLedgerExport } from "@/features/reporting/financial/hooks/useGeneralLedgerExport";
import {
    FY_START_MONTH, fmtDate, fmtSigned, fmtNumber, getAccountId, POSTING_TYPES,
} from "@/features/reporting/financial/utils/generalLedger";

import "@/App.css";

/**
 * GeneralLedgerReport — Laporan Buku Besar (halaman UI saja)
 * Data/filter/kalkulasi : hooks/useGeneralLedger.js
 * Export PDF & Excel    : hooks/useGeneralLedgerExport.js
 * Rumus balance & util  : utils/generalLedger.js (A/E/M: Dr−Cr, L/O/R: Cr−Dr)
 */
const typeBadgeColor = { NERACA: "#1a237e", "LABA-RUGI": "#7c5800" };

const GeneralLedgerReport = () => {
    const {
        startDate, setStartDate, endDate, setEndDate, loading,
        postingType, setPostingType, postingTypeLabel,
        accountOptions, selectedAccountIds, toggleAccount, clearAccountFilter, accountFilterLabel,
        accountSearch, setAccountSearch,
        partnerOptions, selectedPartnerKeys, togglePartner, clearPartnerFilter,
        partnerFilterLabel, partnerFilterSummary,
        filteredGroups, grandTotal,
    } = useGeneralLedger();

    const { handlePrintPdf, handleExportExcel, printing, exportingExcel } = useGeneralLedgerExport({
        groups: filteredGroups, grandTotal, startDate, endDate, partnerFilterSummary,
    });

    // ─── State UI dropdown akun (murni tampilan) ────────────────────────────
    const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
    const accountDropdownRef = useRef(null);
    const [isPartnerDropdownOpen, setIsPartnerDropdownOpen] = useState(false);
    const [partnerSearch, setPartnerSearch] = useState(""); // hanya memfilter daftar opsi partner
    const partnerDropdownRef = useRef(null);
    const visiblePartnerOptions = partnerOptions.filter((o) =>
        o.name.toLowerCase().includes(partnerSearch.trim().toLowerCase())
    );
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target)) {
                setIsAccountDropdownOpen(false);
            }
            if (partnerDropdownRef.current && !partnerDropdownRef.current.contains(e.target)) {
                setIsPartnerDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div style={base.cardContainer}>
            <div sytle={styles.innerContainer}>
            <PageHeader
                title="📒 Laporan Buku Besar"
                extraAction={
                    <div style={base.headerActions}>
                        <button onClick={handleExportExcel} disabled={exportingExcel} style={styles.excelBtn}>
                            {exportingExcel ? "⏳ ..." : "📥 Download Excel"}
                        </button>
                        <button onClick={handlePrintPdf} disabled={printing} style={styles.printBtn}>
                            {printing ? "⏳ ..." : "🖨️ Print PDF"}
                        </button>
                    </div>
                }
            />

            {/* ─── Filter bar ─────────────────────────────────────────────── */}
            <div style={styles.filterRow}>
                <div style={styles.dateField}>
                    <label style={styles.fieldLabel}>Date From</label>
                    <input type="date" value={startDate} max={endDate}
                        onChange={(e) => setStartDate(e.target.value)} style={styles.dateInput} />
                </div>
                <div style={styles.dateField}>
                    <label style={styles.fieldLabel}>Date To</label>
                    <input type="date" value={endDate} min={startDate}
                        onChange={(e) => setEndDate(e.target.value)} style={styles.dateInput} />
                </div>
                <div style={styles.dateField}>
                    <label style={styles.fieldLabel}>Tipe Transaksi</label>
                    <select value={postingType} onChange={(e) => setPostingType(e.target.value)}
                        style={styles.dateInput}>
                        {POSTING_TYPES.map((p) => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                    </select>
                </div>
                {/* Multi-select akun */}
                <div style={styles.dropdownField} ref={accountDropdownRef}>
                    <label style={styles.fieldLabel}>Filter Akun</label>
                    <button type="button" onClick={() => setIsAccountDropdownOpen((v) => !v)}
                        style={styles.accountDropdownBtn}>
                        {accountFilterLabel} ▾
                    </button>
                    {isAccountDropdownOpen && (
                        <div style={styles.accountDropdownPanel}>
                            <input type="text" placeholder="Cari akun..." value={accountSearch}
                                onChange={(e) => setAccountSearch(e.target.value)} style={styles.accountSearchInput} />
                            <div style={styles.accountOptionList}>
                                {accountOptions.length === 0 && (
                                    <div style={{ padding: "8px", color: "#888" }}>Tidak ada akun.</div>
                                )}
                                {accountOptions.map((a) => {
                                    const aid = getAccountId(a);
                                    return (
                                        <label key={aid} style={styles.accountOptionRow}>
                                            <input type="checkbox" checked={selectedAccountIds.includes(aid)}
                                                onChange={() => toggleAccount(aid)} />
                                            {a.Value} — {a.Name}
                                        </label>
                                    );
                                })}
                            </div>
                            {selectedAccountIds.length > 0 && (
                                <button type="button" onClick={clearAccountFilter} style={styles.clearFilterBtn}>
                                    Hapus semua pilihan
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Multi-select Business Partner */}
                <div style={styles.dropdownField} ref={partnerDropdownRef}>
                    <label style={styles.fieldLabel}>Business Partner</label>
                    <button type="button" onClick={() => setIsPartnerDropdownOpen((v) => !v)}
                        style={styles.accountDropdownBtn}>
                        {partnerFilterLabel} ▾
                    </button>
                    {isPartnerDropdownOpen && (
                        <div style={styles.accountDropdownPanel}>
                            <input type="text" placeholder="Cari partner..." value={partnerSearch}
                                onChange={(e) => setPartnerSearch(e.target.value)} style={styles.accountSearchInput} />
                            <div style={styles.accountOptionList}>
                                {visiblePartnerOptions.length === 0 && (
                                    <div style={{ padding: "8px", color: "#888" }}>Tidak ada partner.</div>
                                )}
                                {visiblePartnerOptions.map((o) => (
                                    <label key={o.key} style={styles.accountOptionRow}>
                                        <input type="checkbox" checked={selectedPartnerKeys.includes(o.key)}
                                            onChange={() => togglePartner(o.key)} />
                                        {o.name}
                                    </label>
                                ))}
                            </div>
                            {selectedPartnerKeys.length > 0 && (
                                <button type="button" onClick={clearPartnerFilter} style={styles.clearFilterBtn}>
                                    Hapus semua pilihan
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div style={styles.searchField}>
                    <label style={styles.fieldLabel}>Cari</label>
                    <input type="text" placeholder="Akun / keterangan / partner..." value={accountSearch}
                        onChange={(e) => setAccountSearch(e.target.value)} style={styles.searchInput} />
                </div>
            </div>

            {/* ─── Buku Besar per Akun ────────────────────────────────────── */}
            <div style={styles.detailSection}>
                <h3>Buku Besar per Akun</h3>
                {loading ? (
                    <p>Memuat data...</p>
                ) : filteredGroups.length === 0 ? (
                    <p style={{ color: "#777" }}>Tidak ada data untuk filter ini.</p>
                ) : (
                    <div style={base.tableResponsiveContainer}>
                        <table className="modern-table">
                            <thead sytle={styles.tableHead}>
                                <tr>
                                    <th>Tanggal</th>
                                    <th>Akun / Keterangan</th>
                                    <th>Business Partner</th>
                                    <th style={{ textAlign: "right" }}>Debet</th>
                                    <th style={{ textAlign: "right" }}>Kredit</th>
                                    <th style={{ textAlign: "right" }}>Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    let lastSection = "";
                                    return filteredGroups.map((group) => {
                                        const sectionRow =
                                            group.typeInfo.group !== lastSection ? (
                                                (lastSection = group.typeInfo.group),
                                                <tr key={`section-${group.typeInfo.group}`} style={styles.sectionRow}>
                                                    <td colSpan={6}>{group.typeInfo.group === "NERACA" ? "🏛️ NERACA" : "📈 LABA-RUGI"}</td>
                                                </tr>
                                            ) : null;
                                        return (
                                            <React.Fragment key={group.accountId ?? group.accountName}>
                                                {sectionRow}
                                                {/* Header akun: badge tipe + posisi normal */}
                                                <tr style={styles.groupHeaderRow}>
                                                    <td colSpan={6}>
                                                        <div style={styles.groupHeaderContent}>
                                                            <span style={styles.groupHeaderName}>
                                                                📒 {group.accountName}
                                                                <span style={{ ...styles.typeBadge, color: typeBadgeColor[group.typeInfo.group] }}>
                                                                    [{group.accountType}] {group.typeInfo.label} • Normal: {group.typeInfo.normal}
                                                                </span>
                                                            </span>
                                                            <span style={styles.groupHeaderStats}>
                                                                Saldo Awal: <strong>{fmtSigned(group.openingBalance)}</strong>
                                                                &nbsp;&nbsp;|&nbsp;&nbsp;
                                                                Saldo Akhir: <strong>{fmtSigned(group.closingBalance)}</strong>
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {/* Baris saldo awal */}
                                                <tr style={styles.openingRow}>
                                                    <td>{fmtDate(startDate)}</td>
                                                    <td style={{ fontStyle: "italic", color: "#555" }}>
                                                        {group.openingRow.description}
                                                    </td>
                                                    <td></td>
                                                    <td style={{ textAlign: "right", color: "#999" }}>—</td>
                                                    <td style={{ textAlign: "right", color: "#999" }}>—</td>
                                                    <td style={{ textAlign: "right", fontWeight: "600", ...(group.openingBalance < 0 ? styles.negative : {}) }}>
                                                        {fmtSigned(group.openingBalance)}
                                                    </td>
                                                </tr>
                                                {/* Transaksi dengan balance kumulatif */}
                                                {group.rows.map((r) => (
                                                    <tr key={r.key}>
                                                        <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.dateAcct)}</td>
                                                        <td>{r.description || group.accountName}</td>
                                                        <td>{r.bpartnerName || "—"}</td>
                                                        <td style={{ textAlign: "right" }}>{r.debit ? fmtNumber(r.debit) : "—"}</td>
                                                        <td style={{ textAlign: "right" }}>{r.credit ? fmtNumber(r.credit) : "—"}</td>
                                                        <td style={{ textAlign: "right", fontWeight: "500", ...(r.balance < 0 ? styles.negative : {}) }}>
                                                            {fmtSigned(r.balance)}
                                                        </td>
                                                    </tr>
                                                ))}
                                                <tr style={styles.subtotalRow}>
                                                    <td colSpan={3} style={{ fontWeight: "bold" }}>
                                                        Subtotal {group.accountName}
                                                    </td>
                                                    <td style={{ textAlign: "right", fontWeight: "bold" }}>
                                                        {fmtNumber(group.totalDebit)}
                                                    </td>
                                                    <td style={{ textAlign: "right", fontWeight: "bold" }}>
                                                        {fmtNumber(group.totalCredit)}
                                                    </td>
                                                    <td></td>
                                                </tr>
                                            </React.Fragment>
                                        );
                                    });
                                })()}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={3} style={{ fontWeight: "bold" }}>
                                        Grand Total ({fmtDate(startDate)} – {fmtDate(endDate)})
                                    </td>
                                    <td style={{ textAlign: "right", fontWeight: "bold" }}>
                                        {fmtNumber(grandTotal.debit)}
                                    </td>
                                    <td style={{ textAlign: "right", fontWeight: "bold" }}>
                                        {fmtNumber(grandTotal.credit)}
                                    </td>
                                    <td
                                        style={{ textAlign: "right", fontWeight: "bold" }}
                                        title={grandTotal.closing === null ? "Tidak dijumlahkan: akun Debet-normal dan Kredit-normal bercampur" : undefined}
                                    >
                                        {grandTotal.closing === null ? "—" : fmtSigned(grandTotal.closing)}
                                    </td>                                    
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
                <p style={{ marginTop: "8px", fontSize: "12px", color: "#888" }}>
                    Balance mengikuti posisi normal akun — Aset/Beban: Saldo Awal + (Debet − Kredit);
                    Liabilitas/Ekuitas/Pendapatan: Saldo Awal + (Kredit − Debet). Neraca: saldo awal dari seluruh
                    histori. Laba-rugi: saldo awal dari awal tahun fiskal (bulan ke-{FY_START_MONTH}).
                    Saldo dalam kurung merah = berlawanan dengan posisi normal akun.
                    {partnerFilterSummary && (
                        <>
                            <br />
                            <strong>Filter Business Partner aktif ({partnerFilterSummary}):</strong> saldo awal,
                            balance, dan total dihitung hanya dari posting partner terpilih.
                            <strong>Tipe transaksi: {postingTypeLabel}.</strong>{" "}
                        </>
                    )}
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
    searchField: { 
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        flex: "0 0 auto",
        width: "250px",
    },
    searchInput: {
        padding: "8px 10px",
        borderRadius: "6px",
        border: "1px solid #ccc",
        fontSize: "13px",
        width: "100%",
        boxSizing: "border-box",
    },
    // Wrapper dropdown: label di atas tombol (kolom), + position:relative sebagai
    // jangkar panel absolute. Spread styles.dateField bila ada (aman kalau undefined).
    dropdownField: { ...base.dateField, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px", position: "relative" },
    accountDropdownBtn: { padding: "8px 14px", borderRadius: "6px", border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontSize: "13px", minWidth: "160px", textAlign: "left" },
    accountDropdownPanel: { position: "absolute", top: "100%", left: 0, marginTop: "4px", background: "#fff", border: "1px solid #ddd", borderRadius: "6px", width: "300px", boxShadow: "0 4px 12px #94a3b8", zIndex: 20, padding: "8px" },
    accountSearchInput: { width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid #ccc", marginBottom: "8px", boxSizing: "border-box" },
    accountOptionList: { maxHeight: "220px", overflowY: "auto" },
    accountOptionRow: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 4px", cursor: "pointer", fontSize: "13px" },
    clearFilterBtn: { marginTop: "8px", width: "100%", padding: "6px", background: "#f5f5f5", border: "1px solid #ddd", borderRadius: "4px", cursor: "pointer", fontSize: "12px" },
    groupHeaderRow: { backgroundColor: "#c8c8c8", borderTop: "2px solid #ffe082", borderBottom: "1px solid #ffe082" },
    groupHeaderContent: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", padding: "8px 4px" },
    groupHeaderName: { fontWeight: "700", color: "#7c5800", fontSize: "13.5px" },
    groupHeaderStats: { fontSize: "12.5px", color: "#8d6e00" },
    typeBadge: { marginLeft: "10px", fontSize: "11px", fontWeight: "600" },
    sectionRow: { backgroundColor: "#37474f", color: "#fff", fontWeight: "700", fontSize: "13px" },
    openingRow: { backgroundColor: "#fafafa" },
    subtotalRow: { backgroundColor: "#fffde7", borderTop: "1px dashed #ffe082" },
    negative: { color: "#c62828" },
    innerContainer: { backgroundColor: "#fff", border:"1px solid #ddd", borderRadius: "5px", padding: "15px" },
    tableHead: { backgroundColoer: "#ddd", color: "#fff" },  
};

export default GeneralLedgerReport;