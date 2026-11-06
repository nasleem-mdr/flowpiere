import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { PageHeader } from "@/shared/components";
import { idempiereApi } from "@/api/idempiereApi";
import { renderPivotListPDF } from "@/utils/pdf/renderPivotListPDF"; // duplikasi khusus laporan grouped/pivot — renderListPDF asli tidak diubah karena dipakai di banyak laporan lain
import { useOrgInfo } from "@/shared/hooks/useOrgInfo";
import * as XLSX from "xlsx"; // npm install xlsx (kalau belum ada di project)
import { listPageStyles as base } from "@/utils/listPageStyles";
import "@/App.css";

/**
 * SalesOrderDetailReport
 * ─────────────────────────────────────────────────────────────────────────
 * Laporan detail Sales Order berbasis C_OrderLine (bukan cuma header
 * C_Order seperti POSOrderList), plus ringkasan/sub-total per produk.
 *
 * ALUR FETCH (penting untuk dipahami kalau mau modifikasi):
 *   1) Ambil header C_Order yang cocok rentang tanggal (IsSOTrx = true).
 *      Field C_BPartner_ID sudah otomatis berisi { id, identifier } dari
 *      bxservice, jadi nama customer langsung dipakai tanpa fetch tambahan.
 *   2) Ambil C_OrderLine milik order-order tsb lewat filter
 *      "C_Order_ID eq X or C_Order_ID eq Y or ..." — di-CHUNK per 40 ID
 *      supaya query string tidak kepanjangan/ditolak server. Ini perlu
 *      karena bxservice tidak mendukung join C_Order → C_OrderLine dalam
 *      satu query filter gabungan yang praktis.
 *   3) Gabungkan (join di JS) jadi baris "detail" siap tampil.
 *   4) Filter multi-select produk diterapkan DI SISI CLIENT terhadap hasil
 *      langkah 3 — bukan query ulang ke server — supaya tidak perlu bikin
 *      filter OData yang rumit untuk product-in-list.
 *   5) Ringkasan per produk (qty & total) dihitung dari baris yang SUDAH
 *      difilter, lewat useMemo.
 *
 * ⚠️ ASUMSI yang perlu kamu cek/sesuaikan:
 *   - Path import "@/features/sales/report/..." untuk file ini sendiri —
 *     sesuaikan dengan struktur folder project-mu.
 *   - Kolom C_OrderLine.LineNetAmt saya asumsikan ada (kolom standar
 *     iDempiere). Kalau instance-mu tidak punya/beda nama, fallback ke
 *     QtyOrdered * PriceActual otomatis dipakai.
 *   - Report ini TIDAK dibatasi CreatedBy seperti POSOrderList (laporan
 *     manajemen, bukan "punya saya sendiri"). Kalau perlu dibatasi per
 *     user/role, tinggal tambahkan kondisi di orderFilter.
 */

const CHUNK_SIZE = 40; // jumlah C_Order_ID per batch query C_OrderLine

const SalesOrderDetailReport = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const { orgInfo } = useOrgInfo();

    const [startDate, setStartDate] = useState(todayStr);
    const [endDate, setEndDate] = useState(todayStr);

    const [detailRows, setDetailRows] = useState([]); // hasil join Order+OrderLine, BELUM difilter produk
    const [loading, setLoading] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);

    // ─── Multi-select filter produk ─────────────────────────────────────────
    const [productOptions, setProductOptions] = useState([]);
    const [selectedProductIds, setSelectedProductIds] = useState([]); // array of number
    const [productSearch, setProductSearch] = useState("");
    const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
    const productDropdownRef = useRef(null);

    // Tutup dropdown multi-select kalau klik di luar area-nya
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (productDropdownRef.current && !productDropdownRef.current.contains(e.target)) {
                setIsProductDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // ─── FETCH: opsi produk untuk multi-select (sekali saat halaman dibuka) ─
    const fetchProductOptions = useCallback(async () => {
        try {
            const res = await idempiereApi(
                `/models/m_product?$filter=IsActive eq true&$select=Value,Name&$orderby=Name&$top=500`
            );
            setProductOptions(Array.isArray(res.records) ? res.records : []);
        } catch (err) {
            console.error("Gagal mengambil daftar produk:", err.message);
        }
    }, []);

    useEffect(() => {
        fetchProductOptions();
    }, [fetchProductOptions]);

    // ─── FETCH: data laporan (Order header → OrderLine, lalu join) ─────────
    const fetchReportData = useCallback(async () => {
        setLoading(true);
        try {
            // Langkah 1: header Order dalam rentang tanggal
            const orderFilter =
                `IsSOTrx eq true` +
                ` and Created ge ${startDate}T00:00:00Z` +
                ` and Created le ${endDate}T23:59:59Z`;

            const orderRes = await idempiereApi(
                `/models/c_order?$filter=${orderFilter}` +
                `&$select=DocumentNo,DateOrdered,C_BPartner_ID,DocStatus&$top=2000`
            );
            const orderRecords = Array.isArray(orderRes.records) ? orderRes.records : [];

            if (orderRecords.length === 0) {
                setDetailRows([]);
                return;
            }

            const orderMap = new Map();
            orderRecords.forEach((o) => {
                const oid = o.id ?? o.C_Order_ID;
                orderMap.set(oid, {
                    documentNo: o.DocumentNo || `#${oid}`,
                    dateOrdered: o.DateOrdered,
                    bpartnerName: o.C_BPartner_ID?.identifier || o.C_BPartner_ID?.Name || "-",
                    docStatus: o.DocStatus?.id ?? o.DocStatus,
                });
            });
            const orderIds = Array.from(orderMap.keys());

            // Langkah 2: C_OrderLine untuk order-order tsb, di-chunk per CHUNK_SIZE
            const lineRecords = [];
            for (let i = 0; i < orderIds.length; i += CHUNK_SIZE) {
                const chunk = orderIds.slice(i, i + CHUNK_SIZE);
                const orClause = chunk.map((oid) => `C_Order_ID eq ${oid}`).join(" or ");
                const lineRes = await idempiereApi(
                    `/models/c_orderline?$filter=${orClause}` +
                    `&$select=C_Order_ID,M_Product_ID,QtyOrdered,PriceActual,LineNetAmt&$top=1000`
                );
                lineRecords.push(...(Array.isArray(lineRes.records) ? lineRes.records : []));
            }

            // Langkah 3: join jadi baris detail siap tampil
            const rows = lineRecords.map((line, idx) => {
                const oid = line.C_Order_ID?.id ?? line.C_Order_ID;
                const orderInfo = orderMap.get(oid) || {};
                const productId = line.M_Product_ID?.id ?? line.M_Product_ID ?? null;
                const productName = line.M_Product_ID?.identifier || line.M_Product_ID?.Name || "-";
                const qty = parseFloat(line.QtyOrdered || 0);
                const price = parseFloat(line.PriceActual || 0);
                // Fallback ke Qty*Price kalau LineNetAmt tidak tersedia di instance-mu
                const lineTotal = line.LineNetAmt != null ? parseFloat(line.LineNetAmt) : qty * price;

                return {
                    key: `${oid}-${idx}`,
                    orderId: oid,
                    documentNo: orderInfo.documentNo || `#${oid}`,
                    dateOrdered: orderInfo.dateOrdered,
                    bpartnerName: orderInfo.bpartnerName || "-",
                    docStatus: orderInfo.docStatus,
                    productId,
                    productName,
                    qty,
                    price,
                    lineTotal,
                };
            });

            setDetailRows(rows);
        } catch (err) {
            console.error("Gagal mengambil data laporan:", err.message);
            setDetailRows([]);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        fetchReportData();
    }, [fetchReportData]);

    // ─── Filter produk (client-side) ────────────────────────────────────────
    const filteredRows = useMemo(() => {
        if (selectedProductIds.length === 0) return detailRows;
        return detailRows.filter((r) => selectedProductIds.includes(r.productId));
    }, [detailRows, selectedProductIds]);

    // ─── Grouping ala pivot: baris detail dikelompokkan per produk, masing2
    // grup bawa subtotal (qty & amount) + daftar baris detail miliknya.
    // Dipakai langsung sebagai baris "header ringkasan" di atas tiap
    // kelompok produk pada SECTION 1 — jadi tidak perlu tabel Ringkasan
    // terpisah lagi seperti sebelumnya (summaryByProduct lama).
    const groupedByProduct = useMemo(() => {
        const map = new Map();
        filteredRows.forEach((r) => {
            if (!map.has(r.productId)) {
                map.set(r.productId, {
                    productId: r.productId,
                    productName: r.productName,
                    totalQty: 0,
                    totalAmount: 0,
                    rows: [],
                });
            }
            const group = map.get(r.productId);
            group.totalQty += r.qty;
            group.totalAmount += r.lineTotal;
            group.rows.push(r);
        });
        return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
    }, [filteredRows]);

    const grandTotal = useMemo(
        () => filteredRows.reduce((sum, r) => sum + r.lineTotal, 0),
        [filteredRows]
    );

    // ─── Handler multi-select produk ────────────────────────────────────────
    const getProductId = (p) => p.id ?? p.M_Product_ID;
    const toggleProduct = (productId) => {
        setSelectedProductIds((prev) =>
            prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
        );
    };
    const clearProductFilter = () => setSelectedProductIds([]);

    const filteredProductOptions = productOptions.filter((p) =>
        !productSearch || (p.Name || "").toLowerCase().includes(productSearch.toLowerCase())
    );

    const productFilterLabel =
        selectedProductIds.length === 0
            ? "Semua Produk"
            : `${selectedProductIds.length} produk dipilih`;

    // ─── Print PDF (detail transaksi, ala pivot per produk) ──────────────────
    // Pakai renderPivotListPDF (duplikasi renderListPDF, lihat file terpisah
    // di @/utils/pdf/renderPivotListPDF.jsx) yang sudah bisa mem-bold +
    // highlight baris header grup lewat flag `_isGroupHeader: true` di tiap
    // baris. Baris header disisipkan manual di antara baris-baris detail
    // per produk, kolom selain "Produk" dikosongkan.
    const handlePrintDetail = async () => {
        if (groupedByProduct.length === 0) {
            alert("Tidak ada data untuk dicetak.");
            return;
        }
        setPrinting(true);
        try {
            const rows = [];
            let no = 0;
            groupedByProduct.forEach((group) => {
                rows.push({
                    no: "",
                    documentNo: "",
                    productName: `${group.productName}  (Qty: ${group.totalQty.toLocaleString("id-ID")} | Total: ${group.totalAmount.toLocaleString("id-ID")})`,
                    qty: "",
                    price: "",
                    lineTotal: "",
                    _isGroupHeader: true,
                });
                group.rows.forEach((r) => {
                    no += 1;
                    rows.push({
                        no,
                        documentNo: r.documentNo,
                        productName: r.productName,
                        qty: r.qty.toLocaleString("id-ID"),
                        price: r.price.toLocaleString("id-ID"),
                        lineTotal: r.lineTotal.toLocaleString("id-ID"),
                    });
                });
            });

            await renderPivotListPDF({
                title: "LAPORAN DETAIL SALES ORDER (PER PRODUK)",
                logoDataUrl: orgInfo?.logoUrl,
                orgName: orgInfo?.name,
                orgPhone: orgInfo?.phone,
                orgEmail: orgInfo?.email,
                periodLabel: `PERIODE : ${startDate}  s/d  ${endDate}`,
                columns: [
                    { key: "no", label: "No", width: 25, align: "center" },
                    { key: "documentNo", label: "No. Order", width: 60 },
                    { key: "productName", label: "Produk", width: 165 },
                    { key: "qty", label: "Qty", width: 40, align: "right" },
                    { key: "price", label: "Harga", width: 65, align: "right" },
                    { key: "lineTotal", label: "Total", width: 75, align: "right" },
                ],
                rows,
                totalLabel: "Grand Total",
                totalValue: grandTotal.toLocaleString("id-ID"),
                filenamePrefix: `SALES-ORDER-DETAIL-PER-PRODUK-${startDate}_${endDate}`,
            });
        } catch (err) {
            console.error("Gagal generate PDF:", err.message);
            alert("Gagal membuat PDF laporan.");
        } finally {
            setPrinting(false);
        }
    };

    // ─── Export Excel (detail transaksi, ala pivot per produk) ───────────────
    // Disusun manual sebagai array-of-arrays (AOA) — bukan lewat json_to_sheet
    // — supaya baris ringkasan per produk bisa disisipkan bebas di antara
    // baris detail, persis pola grouping yang sama dengan tampilan di layar
    // & PDF di atas.
    const handleExportExcel = () => {
        if (groupedByProduct.length === 0) {
            alert("Tidak ada data untuk diexport.");
            return;
        }
        setExportingExcel(true);
        try {
            const aoa = [
                ["LAPORAN DETAIL SALES ORDER (PER PRODUK)"],
                [`Periode: ${startDate} s/d ${endDate}`],
                [],
                ["No", "No. Order", "Customer", "Qty", "Harga", "Total"],
            ];

            let no = 0;
            groupedByProduct.forEach((group) => {
                aoa.push([`📦 ${group.productName}`, "", "", group.totalQty, "", group.totalAmount]);
                group.rows.forEach((r) => {
                    no += 1;
                    aoa.push([no, r.documentNo, r.bpartnerName, r.qty, r.price, r.lineTotal]);
                });
            });

            aoa.push([]);
            aoa.push(["", "", "", "", "Grand Total", grandTotal]);

            const worksheet = XLSX.utils.aoa_to_sheet(aoa);
            worksheet["!cols"] = [
                { wch: 6 },  // No
                { wch: 16 }, // No. Order
                { wch: 26 }, // Customer
                { wch: 10 }, // Qty
                { wch: 14 }, // Harga
                { wch: 16 }, // Total
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Detail per Produk");
            XLSX.writeFile(workbook, `SALES-ORDER-DETAIL-PER-PRODUK-${startDate}_${endDate}.xlsx`);
        } catch (err) {
            console.error("Gagal export Excel:", err.message);
            alert("Gagal membuat file Excel.");
        } finally {
            setExportingExcel(false);
        }
    };

    return (
        <div style={base.cardContainer}>
            <PageHeader
                title="📊 Laporan Detail Sales Order"
                extraAction={
                    <div style={base.headerActions}>
                        <button onClick={handleExportExcel} disabled={exportingExcel} style={styles.excelBtn}>
                            {exportingExcel ? "⏳ ..." : "📥 Download Excel"}
                        </button>
                        <button onClick={handlePrintDetail} disabled={printing} style={styles.printBtn}>
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

                {/* Multi-select produk — dropdown custom + checkbox, karena tidak ada
                    library select-multi yang sudah terpasang di project ini. */}
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
            </div>

            {/* ─── Detail Transaksi — ala pivot: dikelompokkan per Produk, tiap
                grup punya baris header ringkasan (Qty & Total) sendiri.
                Menggantikan SECTION 1 (flat list) + SECTION 2 (Ringkasan per
                Produk terpisah) yang lama — sekarang jadi satu tabel saja. ─── */}
            <div style={styles.detailSection}>
            <h3 style={styles.detailTitle}>Detail Transaksi per Produk</h3>
                {loading ? (
                    <p>Memuat data...</p>
                ) : groupedByProduct.length === 0 ? (
                    <p style={{ color: "#777" }}>Tidak ada data untuk filter ini.</p>
                ) : (
                    <div style={base.tableResponsiveContainer}>
                        <table className="modern-table">
                            <thead>
                                <tr>
                                    <th>No. Order</th>
                                    <th>Customer</th>
                                    <th style={{ textAlign: "right" }}>Qty</th>
                                    <th style={{ textAlign: "right" }}>Harga</th>
                                    <th style={{ textAlign: "right" }}>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupedByProduct.map((group) => (
                                    <React.Fragment key={group.productId ?? group.productName}>
                                        {/* Baris header ringkasan produk — sticky secara visual lewat
                                            warna latar & border, bukan CSS sticky posisi (tabel ini
                                            tidak pakai scroll container tetap). */}
                                        <tr style={styles.groupHeaderRow}>
                                            <td colSpan={5}>
                                                <div style={styles.groupHeaderContent}>
                                                    <span style={styles.groupHeaderName}>📦 {group.productName}</span>
                                                    <span style={styles.groupHeaderStats}>
                                                        Qty: <strong>{group.totalQty.toLocaleString("id-ID")}</strong>
                                                        &nbsp;&nbsp;|&nbsp;&nbsp;
                                                        Total: <strong>{group.totalAmount.toLocaleString("id-ID")}</strong>
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                        {group.rows.map((r) => (
                                            <tr key={r.key}>
                                                <td>{r.documentNo}</td>
                                                <td>{r.bpartnerName}</td>
                                                <td style={{ textAlign: "right" }}>{r.qty.toLocaleString("id-ID")}</td>
                                                <td style={{ textAlign: "right" }}>{r.price.toLocaleString("id-ID")}</td>
                                                <td style={{ textAlign: "right" }}>{r.lineTotal.toLocaleString("id-ID")}</td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={4} style={{ textAlign: "right", fontWeight: "bold" }}>Grand Total</td>
                                    <td style={{ textAlign: "right", fontWeight: "bold" }}>{grandTotal.toLocaleString("id-ID")}</td>
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

export default SalesOrderDetailReport;