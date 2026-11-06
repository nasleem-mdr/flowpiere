import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
    PageHeader, 
    DataTable,
    WorkflowProgressButton,
} from "@/shared/components";

import {
    STATUS_FILTERS, 
    StatusBadge, 
    buildStatusCondition, 
} from "@/utils/docStatus";

import { LogoSMAMerahHitam } from "@/shared/components/icon";
import { idempiereApi } from "@/api/idempiereApi";
import { renderDocumentPDF } from "@/utils/pdf/renderDocumentPDF";

import DocActionButton from "@/shared/components/DocActionButton";
import { getAvailableActions } from "@/shared/docAction/docActionConfig";
import { listPageStyles as styles } from "@/utils/listPageStyles";
import "@/App.css";

/** ─────────────────────────────────────────────────────────────────────────────
 * VendorInvoiceList.jsx
 * GET /api/v1/models/ad_table?$select=AD_Table_ID&$filter=TableName eq 'C_Order'
 * ─────────────────────────────────────────────────────────────────────────────
 */

const C_INVOICE_AD_TABLE_ID = 318; 

const VendorInvoiceList = () => {
    const todayStr = new Date().toISOString().split("T")[0];

    const [invoices, setInvoices]             = useState([]);
    const [loading, setLoading]           = useState(false);
    const [search, setSearch]             = useState("");
    const [offset, setOffset]             = useState(0);
    const [totalRecords, setTotalRecords] = useState(0);
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [totalAmountAll, setTotalAmountAll] = useState(null);
    const [downloadingId, setDownloadingId] = useState(null);
    const [startDate, setStartDate]       = useState(todayStr);
    const [endDate, setEndDate]           = useState(todayStr);
    const pageSize                        = 10;
    const navigate                        = useNavigate();

    const [selected, setSelected] = useState(() => new Map());
        const toDocItem = (i) => ({ id: i._invoiceId, documentNo: i.DocumentNo, status: i._status });
        const toggleSelect = (i) =>
            setSelected((prev) => {
                const next = new Map(prev);
                if (next.has(i._invoiceId)) next.delete(i._invoiceId);
                else next.set(i._invoiceId, toDocItem(i));
                return next;
            });
        const handleDocActionDone = () => {
            setSelected(new Map());
            fetchInvoices();
            fetchTotalAmount();
        };
    

    const getStatusLabel = (status) => {
        const map = { DR: "Draft", IP: "In Progress", CO: "Completed", CL: "Closed", VO: "Voided", RE: "Reversed", NA: "Ditolak" };
        return map[status] || status;
    };

    const getStatusColor = (status) => {
        const map = { DR: "#f57c00", CO: "#19cc22", CL: "#37474f", VO: "#f81010", IP: "#1565c0", NA: "#c62828" };
        return map[status] || "#555";
    };
    const [showAllOption, setShowAllOption] = useState('N');
    
    const buildFilterClause = useCallback((loginUserId) => {
            // Array untuk menampung semua kondisi filter
            const conditions = [
                `IsSOTrx eq false`,
                `Created ge ${startDate}T00:00:00Z`,
                `Created le ${endDate}T23:59:59Z`
            ];
    
            // Kondisi IF: Hanya tambahkan CreatedBy jika opsi tampilkan semua BUKAN 'Y'
            if (showAllOption !== 'Y' && loginUserId) {
                conditions.unshift(`CreatedBy eq ${loginUserId}`);
            }
    
            // Filter Search
            if (search) {
                conditions.push(`contains(tolower(DocumentNo),'${search.toLowerCase()}')`);
            }
    
            // Filter Status
            if (statusFilter && statusFilter !== "ALL") {
                conditions.push(`DocStatus eq '${statusFilter}'`);
            }
            const statusCond = buildStatusCondition(statusFilter);
            if (statusCond) conditions.push(statusCond);
    
            // Gabungkan semua kondisi dengan kata ' and '
            return conditions.join(' and ');
    }, [search, startDate, endDate, statusFilter, showAllOption]);
        
    // Invoice bersifat sentral (tidak scoped ke 1 gudang), tapi tetap
    // hanya menampilkan Invoice yang dibuat oleh user yang sedang login — sama
    // seperti perilaku RequisitionList.jsx untuk FPB.
    const fetchInvoices = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return;

        setLoading(true);
        try {
            const filterClause = buildFilterClause(loginUserId);
            const res = await idempiereApi(
                `/models/c_invoice` +
                `?$filter=${filterClause}` +
                `&$select=C_Invoice_ID,DocumentNo,DateInvoiced,C_BPartner_ID,GrandTotal,DocStatus,C_DocType_ID` +
                `&$orderby=DocumentNo desc` +
                `&$top=${pageSize}` +
                `&$skip=${offset}`
            );

            setInvoices(Array.isArray(res.records) ? res.records : []);
            setTotalRecords(res["row-count"] || res.totalRecords || 0);
        } catch (err) {
            console.error("Gagal fetch purchase invoices:", err.message);
        } finally {
            setLoading(false);
        }
    }, [offset, buildFilterClause]);

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
            const filterClause = buildFilterClause(loginUserId);

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
    }, [buildFilterClause]);

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
        navigate("/vendor-invoice", { state: { editInvoice: cleanInvoice } });
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

   const generateInvoicePDF = async (invoiceId, documentNo) => {
    const header = await idempiereApi(
        `/models/c_invoice/${invoiceId}` +
        `?$select=DocumentNo,DateInvoiced,Description,DocStatus,AD_Org_ID,CreatedBy,C_BPartner_ID,GrandTotal`
    );

    const linesRes = await idempiereApi(
        `/models/c_invoiceline` +
        `?$filter=C_Invoice_ID eq ${invoiceId}` +
        `&$select=Line,M_Product_ID,QtyEntered,C_UOM_ID,PriceActual,LineNetAmt,Description` +
        `&$orderby=Line`
    );
    const lines = linesRes.records || [];

    const historyRes = await idempiereApi(
        `/models/ad_wf_eventaudit` +
        `?$filter=AD_Table_ID eq ${C_INVOICE_AD_TABLE_ID} and Record_ID eq ${invoiceId}` +
        `&$select=AD_WF_Node_ID,AD_User_ID,Updated` +
        `&$orderby=Updated asc`
    );

    const history = (historyRes.records || [])
        .filter(h => !["(start)", "(docauto)", "(completedocument)"].includes((h.AD_WF_Node_ID?.identifier || "").toLowerCase()))
        .map(h => ({
            nodeName: h.AD_WF_Node_ID?.identifier || "-",
            userName: h.AD_User_ID?.identifier || "-",
            date: new Date(h.Updated).toLocaleDateString("id-ID"),
        }));

    const statusMap = { DR: "Draft", IP: "Dalam Proses Approval", CO: "Selesai / Disetujui", CL: "Ditutup", VO: "Dibatalkan", RE: "Ditolak" };
    const statusCode = header.DocStatus?.id ?? header.DocStatus;

    await renderDocumentPDF({
        title: "PURCHASE INVOICE (PI)",
        subtitle: "Dokumen ini sah dengan histori approval terlampir",
        logo: <LogoSMAMerahHitam />,
        infoLeft: [
            ["No. Dokumen", ": " + header.DocumentNo],
            ["Vendor", ": " + (header.C_BPartner_ID?.identifier || "-")],
            ["Keterangan", ": " + (header.Description || "-")],
        ],
        infoRight: [
            ["Tanggal", ": " + new Date(header.DateInvoiced).toLocaleDateString("id-ID")],
            ["Departemen", ": " + (header.AD_Org_ID?.identifier || "-")],
            ["Status", ": " + (statusMap[statusCode] || statusCode)],
            ["Grand Total", ": " + fmtRp(header.GrandTotal)],
        ],
        table: {
            head: [["No", "Nama Barang", "Qty", "UOM", "Harga", "Line Amount"]],
            body: lines.map((l, idx) => [
                idx + 1,
                l.M_Product_ID?.identifier || "-",
                l.QtyEntered,
                l.C_UOM_ID?.identifier || "-",
                fmtRp(l.PriceActual),
                fmtRp(l.LineNetAmt),
            ]),
        },
        history,
        verifyUrl: `https://192.168.0.126:8432/view/invoice/${header.uid}`,
        verifyCaption: "Scan untuk verifikasi keaslian & status approval dokumen {documentNo}",
        filenamePrefix: "PI",
        documentNo: header.DocumentNo,
    });
};
    const handleDownload = async (invoice) => {
        const invoiceId = invoice._invoiceId ?? invoice.id;
        setDownloadingId(invoiceId);
        try {
            const token = localStorage.getItem("token");
            await generateInvoicePDF(invoiceId, invoice.DocumentNo, token);
        } catch (err) {
            console.error("Failed to generate PDF:", err.message);
            alert("Failed to create PDF Document");
        } finally {
            setDownloadingId(null);
        }
    };

    const tableData = invoices.map((invoice) => {
        const invoiceId = invoice.id ?? invoice.C_Invoice_ID;
        const status  = invoice.DocStatus?.id ?? invoice.DocStatus ?? "DR";

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

        return (
            <div style={{ display: "flex", gap: "6px" }}>
                <input
                    type="checkbox"
                    checked={selected.has(item._invoiceId)}
                    disabled={getAvailableActions("C_Invoice", item._status).length === 0}
                    onChange={() => toggleSelect(item)}
                    title="Pilih untuk aksi massal Close/Void"
                    style={{ width: "16px", height: "16px" }}
                />
                <button
                    onClick={() => !isEditDisabled ? handleEdit(item) : null}
                    disabled={isEditDisabled}
                    style={{
                        ...styles.editBtn,
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
                        ...styles.editBtn,
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
                    buttonStyle={styles.editBtn}
                />
                <DocActionButton
                    tableName="C_Invoice"
                    items={[toDocItem(item)]}
                    onDone={handleDocActionDone}
                    style={{ ...styles.editBtn, backgroundColor: "#6d4c41" }}
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
    return (
        <div style={styles.cardContainer}>

            <PageHeader
                title="Purchasing Invoice"
                onSearch={(val) => { setSearch(val); setOffset(0); }}
                filters={STATUS_FILTERS}
                activeFilter={statusFilter}
                onFilterChange={handleFilterChange}
                extraAction={
                    <div style={styles.headerActions}>
                        <DocActionButton
                            tableName="C_Invoice"
                            items={[...selected.values()]}
                            label={`⛔ Close / Void (${selected.size})`}
                            onDone={handleDocActionDone}
                            style={{ ...styles.newBtn, backgroundColor: "#6d4c41" }}
                        />
                        <button
                            onClick={() => navigate("/vendor-invoice")}
                            style={styles.newBtn}
                        >
                            + New Transactions 
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

export default VendorInvoiceList;
