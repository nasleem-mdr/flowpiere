import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { idempiereApi } from "@/api/idempiereApi";
import { renderListPDF } from "@/utils/pdf/renderListPDF";
import { generateInvoicePDF } from '@/features/sales/invoice/utils/generateInvoicePDF';
import { useOrgInfo } from "@/shared/hooks/useOrgInfo";
import { listPageStyles as styles } from "@/utils/listPageStyles";
import { 
    PageHeader, 
    DataTable, 
    WorkflowProgressButton,
} from "@/shared/components";

import {
    STATUS_FILTERS, 
    StatusBadge, 
    normalizeStatus,
    buildStatusCondition, 
} from "@/utils/docStatus";

import "@/App.css";

// ─────────────────────────────────────────────────────────────────────────────
// VendorInvoiceList.jsx
// GET /api/v1/models/ad_table?$select=AD_Table_ID&$filter=TableName eq 'C_Order'
// ─────────────────────────────────────────────────────────────────────────────
const C_INVOICE_AD_TABLE_ID = 423; 
// Ukuran tombol seragam, ubah di sini kalau perlu menyesuaikan
const ROW_BTN_W = 96;          // tombol aksi per baris (desktop)
const ROW_BTN_W_MOBILE = 38;   // mobile: hanya ikon
const HEADER_BTN_W = 132;      // tombol di header (desktop)

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

const SalesInvoiceList = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const { orgInfo } = useOrgInfo(); 
    const [invoices, setInvoices]             = useState([]);
    const [loading, setLoading]           = useState(false);
    const [search, setSearch]             = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [offset, setOffset]             = useState(0);
    const [totalRecords, setTotalRecords] = useState(0);
    const [totalAmountAll, setTotalAmountAll] = useState(null);
    const [downloadingId, setDownloadingId] = useState(null);
    const [startDate, setStartDate]       = useState(todayStr);
    const [endDate, setEndDate]           = useState(todayStr);
    const pageSize                        = 10;
    const navigate                        = useNavigate();
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const getStatusLabel = (status) => {
        const map = { DR: "Draft", IP: "In Progress", CO: "Completed", CL: "Closed", VO: "Voided", RE: "Reversed", NA: "Ditolak" };
        return map[status] || status;
    };

    const getStatusColor = (status) => {
        const map = { DR: "#f57c00", CO: "#19cc22", CL: "#37474f", VO: "#f81010", IP: "#1565c0", NA: "#c62828" };
        return map[status] || "#555";
    };

    // Invoice bersifat sentral (tidak scoped ke 1 gudang), tapi tetap
    // hanya menampilkan Invoice yang dibuat oleh user yang sedang login — sama
    // seperti perilaku RequisitionList.jsx untuk FPB.
    const fetchInvoices = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return;

        setLoading(true);
        try {
            let filterClause =
                ` IsSOTrx eq true` + // sisi penjualan saja (bukan purchase Order)
                ` and DateInvoiced ge ${startDate}T00:00:00Z` +
                ` and DateInvoiced le ${endDate}T23:59:59Z`;

            if (search) {
                filterClause += ` and contains(tolower(DocumentNo),'${search.toLowerCase()}')`;
            }

            // Filter Status
            const statusCond = buildStatusCondition(statusFilter);
            if (statusCond) filterClause += ` and ${statusCond}`;

            const res = await idempiereApi(
                `/models/c_invoice` +
                `?$filter=${filterClause}` +
                `&$select=C_Invoice_ID,DocumentNo,DateInvoiced,C_BPartner_ID,C_BPartner_Location_ID,` +
                `GrandTotal,DocStatus,C_DocType_ID,Description,C_BankAccount_ID` +
                `&$orderby=DocumentNo desc` +
                `&$top=${pageSize}` +
                `&$skip=${offset}`
            );

            setInvoices(Array.isArray(res.records) ? res.records : []);
            setTotalRecords(res["row-count"] || res.totalRecords || 0);
        } catch (err) {
            console.error("Gagal fetch sales invoices:", err.message);
        } finally {
            setLoading(false);
        }
    }, [offset, search, startDate, endDate, statusFilter]);

    const svgToPngDataUrl = (svgString, width, height) => {
        return new Promise((resolve, reject) => {
            const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
            const url = URL.createObjectURL(svgBlob);
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = width * 2;  // 2x untuk hasil lebih tajam di PDF
                canvas.height = height * 2;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL("image/png"));
            };
            img.onerror = reject;
            img.src = url;
        });
    };

    // Fetch total GrandTotal seluruh halaman (bukan cuma TotalLines seperti
    // di Requisition) — hanya dipicu saat filter berubah, bukan saat ganti halaman.
    const fetchTotalAmount = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return;

        setTotalAmountAll(null); // reset saat filter berubah
        try {
            let filterClause =
                ` IsSOTrx eq true` +
                ` and DateInvoiced ge ${startDate}T00:00:00Z` +
                ` and DateInvoiced le ${endDate}T23:59:59Z`;

            if (search) {
                filterClause += ` and contains(tolower(DocumentNo),'${search.toLowerCase()}')`;
            }

            // Filter Status
            const statusCond = buildStatusCondition(statusFilter);
            if (statusCond) filterClause += ` and ${statusCond}`;

            const res = await idempiereApi(
                `/models/c_invoice` +
                `?$filter=${filterClause}` +
                `&$select=GrandTotal`
            );

            const records = Array.isArray(res.records) ? res.records : [];
            const total   = records.reduce((sum, r) => sum + parseFloat(r.GrandTotal || 0), 0);
            setTotalAmountAll(total);
        } catch (err) {
            console.error("Gagal fetch total grand total:", err.message);
            setTotalAmountAll(0);
        }
    }, [search, startDate, endDate, statusFilter]);

    useEffect(() => {
        fetchInvoices();
    }, [fetchInvoices]);

    useEffect(() => {
        fetchTotalAmount();
    }, [fetchTotalAmount]);

    const handleEdit = (invoice) => {
        // Gunakan _raw (data asli sebelum di-overwrite tableData) agar field
        // seperti C_BPartner_ID tetap berupa object {id, identifier}, bukan string.
        const raw = invoice._raw ?? invoice;
        let cleanInvoice;
        try {
            cleanInvoice = JSON.parse(JSON.stringify(raw));
        } catch {
            cleanInvoice = raw;
        }
        // ⚠️ VendorInvoiceContainer.jsx saat ini belum mengonsumsi state.editOrder
        // ini (belum ada mode edit draft PI) — navigasi tetap disiapkan di
        // sini supaya UI konsisten dengan RequisitionList.jsx, tapi perlu
        // ditambahkan handling-nya di PurchasingContainer kalau fitur edit
        // draft PO memang dibutuhkan.
        navigate("/sales-invoice", { state: { editInvoice: cleanInvoice } });
    };

    const fmtRp = (n) => ` ${Math.round(n || 0).toLocaleString("id-ID")}`;

    // Format total seluruh halaman dari state (null = sedang loading)
    const totalAmountFormatted = totalAmountAll === null
        ? "Menghitung..."
        : fmtRp(totalAmountAll);

    const columns = [
        { key: "DocumentNo", label: "No. Dokumen" },
        { key: "DateInvoiced", label: "Tanggal" },
        { key: "C_BPartner_ID", label: "Vendor" },
        { key: "GrandTotal", label: "Total", align: "right" },
        { key: "DocStatus", label: "Status", align: "center" },
    ];

    const numberFormatter = new Intl.NumberFormat('en-US');

    const formatDateService = (dateStr) => {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        if (isNaN(d)) return "-";
        const day = d.getDate();
        const month = d.getMonth() + 1; // getMonth() 0-based
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };

        
    const fetchAllInvoicesForPrint = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return [];
    
        let filterClause =
            ` IsSOTrx eq true` +
            ` and DateInvoiced ge ${startDate}T00:00:00Z` +
            ` and DateInvoiced le ${endDate}T23:59:59Z`;
    
        if (search) {
            filterClause += ` and contains(tolower(DocumentNo),'${search.toLowerCase()}')`;
        }

        // Filter Status
        const statusCond = buildStatusCondition(statusFilter);
        if (statusCond) filterClause += ` and ${statusCond}`;
    
        const res = await idempiereApi(
            `/models/c_invoice` +
            `?$filter=${filterClause}` +
            `&$select=C_Invoice_ID,DocumentNo,DateInvoiced,C_BPartner_ID,GrandTotal` +
            `&$orderby=DocumentNo desc` +
            `&$top=5000`
        );
    
        return Array.isArray(res.records) ? res.records : [];
    }, [search, startDate, endDate, statusFilter]);

    const [printingList, setPrintingList] = useState(false);

    const handlePrintList = async () => {
        setPrintingList(true);
        try {
            const allInvoices = await fetchAllInvoicesForPrint();

            if (allInvoices.length === 0) {
                alert('Tidak ada data untuk dicetak pada periode ini.');
                return;
            }

            const totalAmount = allInvoices.reduce((s, inv) => s + parseFloat(inv.GrandTotal || 0), 0);

            await renderListPDF({
                title: 'DAFTAR SALES',
                orgInfo,
                periodLabel: `PERIODE : ${formatDateService(startDate)}  ${formatDateService(endDate)}`,
                columns: [
                    { key: 'no',         label: 'No',                width: 30,  align: 'center' },
                    { key: 'documentNo', label: 'Document No',       width: 'auto' },
                    { key: 'dateInvoice', label: 'Date',       width: 'auto' },
                    { key: 'partner',    label: 'Customer', width: 'flex' },
                    { key: 'amount',     label: 'Amount',            width: 'auto', align: 'right' },
                ],
                rows: allInvoices.map((inv, idx) => ({
                    no:         idx + 1,
                    documentNo: inv.DocumentNo || `#${inv.id ?? inv.C_Invoice_ID}`,
                    dateInvoice: inv.DateInvoiced || `#${inv.id ?? inv.DateInvoiced}`,
                    partner:    inv.C_BPartner_ID?.identifier || '-',
                    amount:     numberFormatter.format(inv.GrandTotal ?? 0),
                })),
                totalLabel: 'Total Semua',
                totalValue: numberFormatter.format(totalAmount),
                filenamePrefix: `DAFTAR-SALES-${startDate}_${endDate}`,
            });
        } catch (err) {
            console.error('Gagal generate PDF daftar:', err.message);
            alert('Gagal membuat PDF daftar.');
        } finally {
            setPrintingList(false);
        }
    };
    const handleDownload = async (invoice) => {
        const invoiceId = invoice._invoiceId ?? invoice.id;
        setDownloadingId(invoiceId);
        try {
            await generateInvoicePDF(invoiceId, invoice.DocumentNo, orgInfo);
        } catch (err) {
            console.error("Failed to generate PDF:", err.message);
            alert("Failed to create PDF Document");
        } finally {
            setDownloadingId(null);
        }
    };

    const tableData = invoices.map((invoice) => {
        const invoiceId = invoice.id ?? invoice.C_Invoice_ID;
        //const status  = invoice.DocStatus?.id ?? invoice.DocStatus ?? "DR";
        const status = normalizeStatus(invoice.DocStatus);

        return {
            ...invoice,
            _raw:      invoice,
            _invoiceId:  invoiceId,
            _status:   status,
            DocumentNo: invoice.DocumentNo || `#${invoiceId}`,
            DateInvoiced: invoice.DateInvoiced
                ? new Date(invoice.DateInvoiced).toLocaleDateString("id-ID")
                : "-",
            "C_BPartner_ID": invoice.C_BPartner_ID?.identifier
                || invoice.C_BPartner_ID?.Name
                || "-",
            GrandTotal: fmtRp(invoice.GrandTotal),
            DocStatus: <StatusBadge status={status} />,
        };
    });

    const actionRenderer = (item) => {
        const isEditDisabled = !["DR", "NA"].includes(item._status);
        const editTitle = item._status === "NA"
            ? "Revise and resubmit for approval."
            : "Edit Document";
        const isDownloading = downloadingId === item._invoiceId;
        const isDownloadDisabled = item._status !== "CO" || isDownloading; // ⬅️ hanya aktif saat Completed

        const btnStyle = {
            ...styles.editBtn,
            ...uniformBtn(isMobile ? ROW_BTN_W_MOBILE : ROW_BTN_W),
            ...(isMobile && { fontSize: "14px" }),
        };

        return (
            <div style={{ ...styles.actionContainer, alignItems: "center" }}>
                <button
                    onClick={() => !isEditDisabled ? handleEdit(item) : null}
                    disabled={isEditDisabled}
                    style={{
                        ...btnStyle,
                        backgroundColor: !isEditDisabled ? (item._status === "NA" ? "#c62828" : "#f57c00") : "#ccc",
                        cursor:          !isEditDisabled ? "pointer"  : "not-allowed",
                        opacity:         !isEditDisabled ? 1          : 0.6,
                    }}
                    title={isEditDisabled ? `Status ${getStatusLabel(item._status)} can't change` : editTitle}
                >
                    {item._status === "NA" ? "🔁 Revised" : "✏️ Edit"}
                </button>

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
                            ? `Download ready only for Completed Document`
                            : "Download Document"
                    }
                >
                    {isDownloading ? "⏳ ..." : "⬇️ Download"}
                </button>
                <WorkflowProgressButton
                     tableName="C_Invoice"
                     recordId={item._invoiceId}
                     docStatus={item._status}
                     targetStatus="CO"
                     buttonStyle={btnStyle}
                />
            </div>
        );
    };

    const handleStartDateChange = (val) => {
        setStartDate(val);
        setOffset(0);
    };

    const handleEndDateChange = (val) => {
        setEndDate(val);
        setOffset(0);
    };

    const handleFilterChange = (val) => {
        setStatusFilter(val);
        setOffset(0);
    };

    const headerBtn = isMobile
    ? { ...styles.newBtn, ...uniformBtn("auto", 32), minWidth: 44, padding: "0 10px" }
    : { ...styles.newBtn, ...uniformBtn(HEADER_BTN_W, 32) };

    return (
        <div style={styles.cardContainer}>
            <PageHeader
                title="Sales Invoice"
                filters={STATUS_FILTERS}
                activeFilter={statusFilter}
                onFilterChange={handleFilterChange}
                onSearch={(val) => { setSearch(val); setOffset(0); }}
                extraAction={
                    <div style={{ ...styles.headerActions, alignItems: "center" }}>
                        <button onClick={handlePrintList} disabled={printingList} style={headerBtn}>
                            {printingList ? '⏳ ...' : '🖨️ Print PDF'}
                        </button>
                        <button onClick={() => navigate("/sales-invoice")} style={headerBtn}>
                            + New
                        </button>
                    </div>
                }
            />
            
            <div style={styles.dateFilterRow}>
                <div style={styles.dateField}>
                    <label style={styles.dateLabel}>Date from</label>
                    <input
                        type="date"
                        value={startDate}
                        max={endDate}
                        onChange={(e) => handleStartDateChange(e.target.value)}
                        style={styles.dateInput}
                    />
                </div>
                <div style={styles.dateField}>
                    <label style={styles.dateLabel}>Date To</label>
                    <input
                        type="date"
                        value={endDate}
                        min={startDate}
                        onChange={(e) => handleEndDateChange(e.target.value)}
                        style={styles.dateInput}
                    />
                </div>
            </div>

            <DataTable
                columns={columns}
                data={tableData}
                loading={loading}
                offset={offset}
                pageSize={pageSize}
                totalRecords={totalRecords}
                onPageChange={(newOffset) => setOffset(newOffset)}
                renderActions={actionRenderer}
                summaryRow={{ columnKey: "GrandTotal", value: totalAmountFormatted, label: "Total Semua" }}
            />
        </div>
    );
};



export default SalesInvoiceList;