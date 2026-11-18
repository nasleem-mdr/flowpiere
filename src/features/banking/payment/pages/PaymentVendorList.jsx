// src/features/banking/payment/pages/PaymentVendorList.jsx
// Daftar pembayaran ke vendor (C_Payment, IsReceipt = false) — struktur sama dengan PurchasingList.
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, DataTable } from "@/shared/components";
import { useOrgInfo } from "@/shared/hooks/useOrgInfo";
import { idempiereApi } from "@/api/idempiereApi";
import { renderListPDF } from "@/utils/pdf/renderListPDF";
import { generatePaymentVendorPDF } from "@/features/banking/payment/utils/generatePaymentVendorPDF";
import {
    STATUS_FILTERS,
    StatusBadge,
    normalizeStatus,
    buildStatusCondition,
} from "@/utils/docStatus";
import { listPageStyles as styles } from "@/utils/listPageStyles";

import "@/App.css";

// Route form "Bayar ke Vendor" (PaymentVendorContainer) — sesuaikan dengan router-mu
const NEW_ROUTE = "/payment-vendor";

// Ukuran tombol seragam (sama seperti PurchasingList)
const ROW_BTN_W = 96;
const ROW_BTN_W_MOBILE = 38;
const HEADER_BTN_W = 132;

const uniformBtn = (width, height = 30) => ({
    boxSizing: "border-box",
    width,
    minWidth: width,
    height,
    padding: "0 8px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flexShrink: 0,
    whiteSpace: "nowrap",
    lineHeight: 1,
});

const PAGE_SIZE_SERVER = 100;

// Ambil SEMUA record dengan paging ($skip dimajukan sebanyak record yang benar-benar diterima,
// karena server bisa membatasi ukuran halaman). Dipakai untuk total keseluruhan & cetak daftar.
const fetchAllRecords = async (path) => {
    const sep = path.includes("?") ? "&" : "?";
    const all = [];
    let skip = 0;
    let prevFirstId = null;
    for (let i = 0; i < 100; i++) {
        const res = await idempiereApi(`${path}${sep}$top=${PAGE_SIZE_SERVER}&$skip=${skip}`);
        const page = Array.isArray(res.records) ? res.records : [];
        if (page.length === 0) break;
        const firstId = page[0]?.id;
        if (firstId != null && firstId === prevFirstId) break; // server mengabaikan $skip
        prevFirstId = firstId;
        all.push(...page);
        skip += page.length;
        const total = res["row-count"];
        if (typeof total === "number" && skip >= total) break;
    }
    return all;
};

const PaymentVendorList = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const { orgInfo } = useOrgInfo();
    const navigate = useNavigate();

    const [payments, setPayments]         = useState([]);
    const [loading, setLoading]           = useState(false);
    const [search, setSearch]             = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [offset, setOffset]             = useState(0);
    const [totalRecords, setTotalRecords] = useState(0);
    const [totalAmountAll, setTotalAmountAll] = useState(null);
    const [downloadingId, setDownloadingId]   = useState(null);
    const [startDate, setStartDate]       = useState(todayStr);
    const [endDate, setEndDate]           = useState(todayStr);
    const [showAllOption, setShowAllOption] = useState("N");
    const [printingList, setPrintingList] = useState(false);
    const [isMobile, setIsMobile]         = useState(window.innerWidth < 768);
    const pageSize = 10;

    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    const fmtRp = (n) => `${Math.round(n || 0).toLocaleString("id-ID")}`;
    const numberFormatter = new Intl.NumberFormat("en-US");
    const formatShortDate = (dateStr) => {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        if (isNaN(d)) return "-";
        return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    };

    const getStatusLabel = (status) => {
        const map = { DR: "Draft", IP: "In Progress", CO: "Completed", CL: "Closed", VO: "Voided", RE: "Reversed", NA: "Ditolak" };
        return map[status] || status;
    };

    // ── Filter (dipakai list, total, dan cetak daftar — supaya konsisten) ──
    const buildFilterClause = useCallback((loginUserId) => {
        const conditions = [
            `IsReceipt eq false`,
            `DateTrx ge ${startDate}T00:00:00Z`,
            `DateTrx le ${endDate}T23:59:59Z`,
        ];

        if (showAllOption !== "Y" && loginUserId) {
            conditions.unshift(`CreatedBy eq ${loginUserId}`);
        }
        if (search) {
            conditions.push(`contains(tolower(DocumentNo),'${search.toLowerCase().replace(/'/g, "''")}')`);
        }
        if (statusFilter && statusFilter !== "ALL") {
            conditions.push(`DocStatus eq '${statusFilter}'`);
        }
        const statusCond = buildStatusCondition(statusFilter);
        if (statusCond) conditions.push(statusCond);

        return conditions.join(" and ");
    }, [search, startDate, endDate, statusFilter, showAllOption]);

    const fetchPayments = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return;

        setLoading(true);
        try {
            const res = await idempiereApi(
                `/models/c_payment` +
                `?$filter=${buildFilterClause(loginUserId)}` +
                `&$select=C_Payment_ID,DocumentNo,DateTrx,C_BPartner_ID,C_BankAccount_ID,TenderType,PayAmt,DocStatus,C_Currency_ID` +
                `&$orderby=DocumentNo desc` +
                `&$top=${pageSize}` +
                `&$skip=${offset}`
            );
            setPayments(Array.isArray(res.records) ? res.records : []);
            setTotalRecords(res["row-count"] || res.totalRecords || 0);
        } catch (err) {
            console.error("Gagal fetch pembayaran vendor:", err.message);
        } finally {
            setLoading(false);
        }
    }, [offset, buildFilterClause]);

    const fetchTotalAmount = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return;

        setTotalAmountAll(null);
        try {
            const records = await fetchAllRecords(
                `/models/c_payment?$filter=${buildFilterClause(loginUserId)}&$select=PayAmt`
            );
            setTotalAmountAll(records.reduce((sum, r) => sum + parseFloat(r.PayAmt || 0), 0));
        } catch (err) {
            console.error("Gagal fetch total pembayaran:", err.message);
            setTotalAmountAll(0);
        }
    }, [buildFilterClause]);

    useEffect(() => { fetchPayments(); }, [fetchPayments]);
    useEffect(() => { fetchTotalAmount(); }, [fetchTotalAmount]);

    // ── Download PDF (hanya dokumen Completed) ───────────────────────────
    const handleDownload = async (payment) => {
        const paymentId = payment._paymentId ?? payment.id;
        setDownloadingId(paymentId);
        try {
            await generatePaymentVendorPDF(paymentId, payment.DocumentNo, orgInfo);
        } catch (err) {
            console.error("Gagal generate PDF:", err);
            alert("Gagal membuat dokumen PDF: " + err.message);
        } finally {
            setDownloadingId(null);
        }
    };

    // ── Cetak daftar ─────────────────────────────────────────────────────
    const handlePrintList = async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (showAllOption !== "Y" && !loginUserId) return;

        setPrintingList(true);
        try {
            const all = await fetchAllRecords(
                `/models/c_payment` +
                `?$filter=${buildFilterClause(loginUserId)}` +
                `&$select=C_Payment_ID,DocumentNo,DateTrx,C_BPartner_ID,C_BankAccount_ID,PayAmt` +
                `&$orderby=DocumentNo desc`
            );
            if (all.length === 0) {
                alert("Tidak ada data untuk dicetak pada periode ini.");
                return;
            }
            const totalAmount = all.reduce((s, p) => s + parseFloat(p.PayAmt || 0), 0);
            await renderListPDF({
                title: "DAFTAR PEMBAYARAN VENDOR",
                orgInfo,
                periodLabel: `PERIODE : ${formatShortDate(startDate)} s/d ${formatShortDate(endDate)}`,
                columns: [
                    { key: "no",         label: "No",          width: 30,  align: "center" },
                    { key: "documentNo", label: "Document No", width: 80 },
                    { key: "date",       label: "Date",        width: 60 },
                    { key: "partner",    label: "Vendor",      width: 160 },
                    { key: "bank",       label: "Bank / Kas",  width: 105 },
                    { key: "amount",     label: "Amount",      width: 85,  align: "right" },
                ],
                rows: all.map((p, idx) => ({
                    no:         idx + 1,
                    documentNo: p.DocumentNo || `#${p.id ?? p.C_Payment_ID}`,
                    date:       formatShortDate(p.DateTrx),
                    partner:    p.C_BPartner_ID?.identifier || "-",
                    bank:       p.C_BankAccount_ID?.identifier || "-",
                    amount:     numberFormatter.format(p.PayAmt ?? 0),
                })),
                totalLabel: "Total Semua",
                totalValue: numberFormatter.format(totalAmount),
                filenamePrefix: `DAFTAR-PEMBAYARAN-VENDOR-${startDate}_${endDate}`,
            });
        } catch (err) {
            console.error("Gagal generate PDF daftar:", err.message);
            alert("Gagal membuat PDF daftar.");
        } finally {
            setPrintingList(false);
        }
    };

    // ── Tabel ────────────────────────────────────────────────────────────
    const totalAmountFormatted = totalAmountAll === null ? "Menghitung..." : fmtRp(totalAmountAll);

    const columns = [
        { key: "DocumentNo",       label: "No. Dokumen" },
        { key: "DateTrx",          label: "Tanggal" },
        { key: "C_BPartner_ID",    label: "Vendor" },
        { key: "C_BankAccount_ID", label: "Bank / Kas" },
        { key: "TenderType",       label: "Metode" },
        { key: "PayAmt",           label: "Jumlah", align: "right" },
        { key: "DocStatus",        label: "Status", align: "center" },
    ];

    const tableData = payments.map((p) => {
        const paymentId = p.id ?? p.C_Payment_ID;
        const status = normalizeStatus(p.DocStatus);
        return {
            ...p,
            _raw:       p,
            _paymentId: paymentId,
            _status:    status,
            DocumentNo: p.DocumentNo || `#${paymentId}`,
            DateTrx:    p.DateTrx ? new Date(p.DateTrx).toLocaleDateString("id-ID") : "-",
            C_BPartner_ID:    p.C_BPartner_ID?.identifier || p.C_BPartner_ID?.Name || "-",
            C_BankAccount_ID: p.C_BankAccount_ID?.identifier || "-",
            TenderType:       p.TenderType?.identifier || p.TenderType?.id || "-",
            PayAmt:     fmtRp(p.PayAmt),
            DocStatus:  <StatusBadge status={status} />,
        };
    });

    const actionRenderer = (item) => {
        const isDownloading = downloadingId === item._paymentId;
        const isDownloadDisabled = item._status !== "CO" || isDownloading;
        const btnStyle = {
            ...styles.editBtn,
            ...uniformBtn(isMobile ? ROW_BTN_W_MOBILE : ROW_BTN_W),
            ...(isMobile && { fontSize: "14px" }),
        };

        return (
            <div style={{ ...styles.actionContainer, alignItems: "center" }}>
                <button
                    onClick={() => !isDownloadDisabled ? handleDownload(item) : null}
                    disabled={isDownloadDisabled}
                    style={{
                        ...btnStyle,
                        backgroundColor: isDownloadDisabled ? "#ccc" : "#546e7a",
                        cursor:          isDownloadDisabled ? "not-allowed" : "pointer",
                        opacity:         isDownloadDisabled ? 0.6 : 1,
                    }}
                    title={
                        item._status !== "CO"
                            ? `Download hanya tersedia untuk dokumen Completed (status: ${getStatusLabel(item._status)})`
                            : "Download Bukti Pembayaran"
                    }
                >
                    {isDownloading ? "⏳ ..." : "⬇️ Download"}
                </button>
            </div>
        );
    };

    const headerBtn = isMobile
        ? { ...styles.newBtn, ...uniformBtn("auto", 32), minWidth: 44, padding: "0 10px" }
        : { ...styles.newBtn, ...uniformBtn(HEADER_BTN_W, 32) };

    return (
        <div style={styles.cardContainer}>
            <PageHeader
                title="Pembayaran Vendor"
                onSearch={(val) => { setSearch(val); setOffset(0); }}
                filters={STATUS_FILTERS}
                activeFilter={statusFilter}
                onFilterChange={(val) => { setStatusFilter(val); setOffset(0); }}
                extraAction={
                    <div style={{ ...styles.headerActions, alignItems: "center" }}>
                        <button onClick={handlePrintList} disabled={printingList} style={headerBtn}>
                            {printingList ? "⏳ ..." : "🖨️ Print"}
                        </button>
                        <button onClick={() => navigate(NEW_ROUTE)} style={headerBtn}>
                            + New
                        </button>
                    </div>
                }
            />

            <div style={styles.dateFilterRow}>
                <div style={styles.dateField}>
                    <label style={styles.dateLabel}>Dari Tanggal</label>
                    <input
                        type="date"
                        value={startDate}
                        max={endDate}
                        onChange={(e) => { setStartDate(e.target.value); setOffset(0); }}
                        style={styles.dateInput}
                    />
                </div>

                <div style={styles.dateField}>
                    <label style={styles.dateLabel}>Sampai Tanggal</label>
                    <input
                        type="date"
                        value={endDate}
                        min={startDate}
                        onChange={(e) => { setEndDate(e.target.value); setOffset(0); }}
                        style={styles.dateInput}
                    />
                </div>

                <div style={styles.dateFieldCheckbox}>
                    <label style={styles.checkboxLabel}>
                        <input
                            type="checkbox"
                            checked={showAllOption === "Y"}
                            onChange={(e) => { setShowAllOption(e.target.checked ? "Y" : "N"); setOffset(0); }}
                            style={{ width: "16px", height: "16px", cursor: "pointer" }}
                        />
                        Tampilkan Semua User
                    </label>
                </div>
            </div>

            <div style={styles.tableResponsiveContainer}>
                <DataTable
                    columns={columns}
                    data={tableData}
                    loading={loading}
                    offset={offset}
                    pageSize={pageSize}
                    totalRecords={totalRecords}
                    onPageChange={(newOffset) => setOffset(newOffset)}
                    renderActions={actionRenderer}
                    summaryRow={{ columnKey: "PayAmt", value: totalAmountFormatted, label: "Total Semua" }}
                />
            </div>
        </div>
    );
};

export default PaymentVendorList;
