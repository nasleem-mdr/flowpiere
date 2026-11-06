import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
    PageHeader, 
    DataTable, 
    WorkflowProgressButton,
} from "@/shared/components";
import { useOrgInfo } from "@/shared/hooks/useOrgInfo";
import { idempiereApi } from "@/api/idempiereApi";
import { renderListPDF } from "@/utils/pdf/renderListPDF";
import { generateOrderPDF } from "@/features/purchasing/order/utils/generateOrderPDF";
import {
    STATUS_FILTERS, 
    StatusBadge, 
    normalizeStatus,
    buildStatusCondition, 
} from "@/utils/docStatus";
import { listPageStyles as styles } from "@/utils/listPageStyles";

import DocActionButton from "@/shared/components/DocActionButton";
import { getAvailableActions } from "@/shared/docAction/docActionConfig";

import "@/App.css";
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
const PurchasingList = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const { orgInfo } = useOrgInfo();
    const [orders, setOrders]             = useState([]);
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
    // --- Pilihan baris untuk aksi massal Close/Void ---
    const [selected, setSelected] = useState(() => new Map());
    const toDocItem = (o) => ({ id: o._orderId, documentNo: o.DocumentNo, status: o._status });
    const toggleSelect = (o) =>
        setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(o._orderId)) next.delete(o._orderId);
            else next.set(o._orderId, toDocItem(o));
            return next;
        });
    const handleDocActionDone = () => {
        setSelected(new Map());
        fetchOrders();
        fetchTotalAmount();
    };

    const handleDownload = async (order) => {
        const orderId = order._orderId ?? order.id;
        setDownloadingId(orderId);
        try {
            await generateOrderPDF(orderId, order.DocumentNo, orgInfo);
        } catch (err) {
            console.error("Gagal generate PDF:", err);
            alert("Gagal membuat dokumen PDF: " + err.message);
        } finally {
            setDownloadingId(null);
        }
    };

    const getStatusLabel = (status) => {
        const map = { DR: "Draft", IP: "In Progress", CO: "Completed", CL: "Closed", VO: "Voided", RE: "Reversed", NA: "Ditolak" };
        return map[status] || status;
    };

    const [showAllOption, setShowAllOption] = useState('N');

    const buildFilterClause = useCallback((loginUserId) => {
        const conditions = [
            `IsSOTrx eq false`,
            `Created ge ${startDate}T00:00:00Z`,
            `Created le ${endDate}T23:59:59Z`
        ];

        if (showAllOption !== 'Y' && loginUserId) {
            conditions.unshift(`CreatedBy eq ${loginUserId}`);
        }

        if (search) {
            conditions.push(`contains(tolower(DocumentNo),'${search.toLowerCase()}')`);
        }

        if (statusFilter && statusFilter !== "ALL") {
            conditions.push(`DocStatus eq '${statusFilter}'`);
        }
        const statusCond = buildStatusCondition(statusFilter);
        if (statusCond) conditions.push(statusCond);

        return conditions.join(' and ');
    }, [search, startDate, endDate, statusFilter, showAllOption]);

    const fetchOrders = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return;

        setLoading(true);
        try {
            const filterClause = buildFilterClause(loginUserId);
            const res = await idempiereApi(
                `/models/c_order` +
                `?$filter=${filterClause}` +
                `&$select=C_Order_ID,DocumentNo,DateOrdered,C_BPartner_ID,GrandTotal,DocStatus,C_DocType_ID,M_Warehouse_ID` +
                `&$orderby=DocumentNo desc` +
                `&$top=${pageSize}` +
                `&$skip=${offset}`
            );

            setOrders(Array.isArray(res.records) ? res.records : []);
            setTotalRecords(res["row-count"] || res.totalRecords || 0);
        } catch (err) {
            console.error("Gagal fetch purchase orders:", err.message);
        } finally {
            setLoading(false);
        }
    }, [offset, buildFilterClause]);

    const fetchTotalAmount = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return;

        setTotalAmountAll(null);
        try {
            const filterClause = buildFilterClause(loginUserId);
            const res = await idempiereApi(
                `/models/c_order` +
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
        fetchOrders();
    }, [fetchOrders]);

    useEffect(() => {
        fetchTotalAmount();
    }, [fetchTotalAmount]);

    const handleEdit = (order) => {
        const raw = order._raw ?? order;
        let cleanOrder;
        try {
            cleanOrder = JSON.parse(JSON.stringify(raw));
        } catch {
            cleanOrder = raw;
        }
        navigate("/purchasing", { state: { editOrder: cleanOrder } });
    };

    const fmtRp = (n) => `${Math.round(n || 0).toLocaleString("id-ID")}`;

    const totalAmountFormatted = totalAmountAll === null
        ? "Menghitung..."
        : fmtRp(totalAmountAll);

    const columns = [
        { key: "DocumentNo", label: "No. Dokumen" },
        { key: "DateOrdered", label: "Tanggal" },
        { key: "C_BPartner_ID", label: "Vendor" },
        { key: "GrandTotal", label: "Total", align: "right" },
        { key: "DocStatus", label: "Status", align: "center" },
    ];

    const tableData = orders.map((order) => {
        const orderId = order.id ?? order.C_Order_ID;
        const status = normalizeStatus(order.DocStatus);

        return {
            ...order,
            _raw:      order,
            _orderId:  orderId,
            _status:   status,
            DocumentNo: order.DocumentNo || `#${orderId}`,
            DateOrdered: order.DateOrdered
                ? new Date(order.DateOrdered).toLocaleDateString("id-ID")
                : "-",
            "C_BPartner_ID": order.C_BPartner_ID?.identifier
                || order.C_BPartner_ID?.Name
                || "-",
            GrandTotal: fmtRp(order.GrandTotal),
            DocStatus: <StatusBadge status={status} />,
        };
    });

    const actionRenderer = (item) => {
        const isEditDisabled = !["DR", "NA"].includes(item._status);
        const editTitle = item._status === "NA"
            ? "Revisi & ajukan ulang untuk approval"
            : "Edit Dokumen";
        const isDownloading = downloadingId === item._orderId;
        const isDownloadDisabled = item._status !== "CO" || isDownloading;
        const btnStyle = {
            ...styles.editBtn,
            ...uniformBtn(isMobile ? ROW_BTN_W_MOBILE : ROW_BTN_W),
            ...(isMobile && { fontSize: "14px" }),
        };

        return (
            <div style={{ ...styles.actionContainer, alignItems: "center" }}>
                <input
                    type="checkbox"
                    checked={selected.has(item._orderId)}
                    disabled={getAvailableActions("C_Order", item._status).length === 0}
                    onChange={() => toggleSelect(item)}
                    title="Pilih untuk aksi massal Close/Void"
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                />
                <button
                    onClick={() => !isEditDisabled ? handleEdit(item) : null}
                    disabled={isEditDisabled}
                    style={{
                        ...btnStyle,
                        backgroundColor: !isEditDisabled ? (item._status === "NA" ? "#c62828" : "#f57c00") : "#ccc",
                        cursor:          !isEditDisabled ? "pointer"  : "not-allowed",
                        opacity:         !isEditDisabled ? 1         : 0.6,
                    }}
                    title={isEditDisabled ? `Status ${getStatusLabel(item._status)} tidak dapat diubah` : editTitle}
                >
                    {item._status === "NA" ? "🔁 Revisi" : "✏️ Edit"}
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
                            ? `Download hanya tersedia untuk dokumen dengan status Completed`
                            : "Download Dokumen"
                    }
                >
                    {isDownloading ? "⏳ ..." : "⬇️ Download"}
                </button>
                <WorkflowProgressButton
                    tableName="C_Order"
                    recordId={item._orderId}
                    docStatus={item._status}
                    targetStatus="CO"
                    buttonStyle={btnStyle}
                />
                <DocActionButton
                    tableName="C_Order"
                    items={[toDocItem(item)]}
                    onDone={handleDocActionDone}
                    style={{ ...btnStyle, backgroundColor: "#6d4c41" }}
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
   
    const fetchAllOrdersForPrint = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (showAllOption !== 'Y' && !loginUserId) return [];
    
        const conditions = [
            `IsSOTrx eq false`,
            `Created ge ${startDate}T00:00:00Z`,
            `Created le ${endDate}T23:59:59Z`
        ];
    
        if (showAllOption !== 'Y' && loginUserId) {
            conditions.unshift(`CreatedBy eq ${loginUserId}`);
        }
    
        if (search) {
            conditions.push(`contains(tolower(DocumentNo),'${search.toLowerCase()}')`);
        }
    
        if (statusFilter && statusFilter !== "ALL") {
            conditions.push(`DocStatus eq '${statusFilter}'`);
        }
    
        const filterClause = conditions.join(' and ');
    
        const res = await idempiereApi(
            `/models/c_order` +
            `?$filter=${encodeURIComponent(filterClause)}` +
            `&$select=C_Order_ID,DocumentNo,Createdby,DateOrdered,C_BPartner_ID,GrandTotal` +
            `&$orderby=DocumentNo desc` +
            `&$top=5000`
        );
    
        return Array.isArray(res.records) ? res.records : [];
    }, [search, startDate, endDate, statusFilter, showAllOption]);

    const [printingList, setPrintingList] = useState(false);
    const numberFormatter = new Intl.NumberFormat('en-US');
    const formatDateService = (dateStr) => {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        if (isNaN(d)) return "-";
        const day = d.getDate();
        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };
   
    const handlePrintList = async () => {
        setPrintingList(true);
        try {
            const allOrders = await fetchAllOrdersForPrint();
            if (allOrders.length === 0) {
                alert('Tidak ada data untuk dicetak pada periode ini.');
                return;
            }
            const totalAmount = allOrders.reduce((s, odr) => s + parseFloat(odr.GrandTotal || 0), 0);
            await renderListPDF({
                title: 'DAFTAR PURCHASE ORDER',
                orgInfo,   
                periodLabel: `PERIODE : ${formatDateService(startDate)}  ${formatDateService(endDate)}`,
                columns: [
                    { key: 'no',        label: 'No',          width: 30,    align: 'center' },
                    { key: 'documentNo', label: 'Document No', width: 70 },
                    { key: 'dateOrder',  label: 'Date',        width: 60 },
                    { key: 'createdBy',  label: 'Sales Rep',   width: 80 },
                    { key: 'partner',    label: 'Customer',    width: 200 },
                    { key: 'amount',     label: 'Amount',      width: 85, align: 'right' },
                ],
                rows: allOrders.map((odr, idx) => ({
                    no:         idx + 1,
                    documentNo: odr.DocumentNo || `#${odr.id ?? odr.C_Order_ID}`,
                    dateOrder:  odr.DateOrdered || `#${odr.id ?? odr.DateOrdered}`,
                    createdBy:  odr.CreatedBy?.identifier || '-',
                    partner:    odr.C_BPartner_ID?.identifier || '-',
                    amount:     numberFormatter.format(odr.GrandTotal ?? 0),
                })),
                totalLabel: 'Total Semua',
                totalValue: numberFormatter.format(totalAmount),
                filenamePrefix: `DAFTAR-PO-${startDate}_${endDate}`,
            });
        } catch (err) {
            console.error('Gagal generate PDF daftar:', err.message);
            alert('Gagal membuat PDF daftar.');
        } finally {
            setPrintingList(false);
        }
    };
    const headerBtn = isMobile
    ? { ...styles.newBtn, ...uniformBtn("auto", 32), minWidth: 44, padding: "0 10px" }
    : { ...styles.newBtn, ...uniformBtn(HEADER_BTN_W, 32) };

    return (
        <div style={styles.cardContainer}>
            <PageHeader
                title="Purchasing"
                onSearch={(val) => { setSearch(val); setOffset(0); }}
                filters={STATUS_FILTERS}
                activeFilter={statusFilter}
                onFilterChange={handleFilterChange}
                extraAction={
                    <div style={{ ...styles.headerActions, alignItems: "center" }}>
                        <DocActionButton
                            tableName="C_Order"
                            items={[...selected.values()]}
                            label={`⛔ Close / Void (${selected.size})`}
                            onDone={handleDocActionDone}
                            style={{ ...headerBtn, backgroundColor: "#6d4c41" }}
                        />
                        <button onClick={handlePrintList} disabled={printingList} style={headerBtn}>
                            {printingList ? '⏳ ...' : '🖨️ Print'}
                        </button>
                        <button onClick={() => navigate("/purchasing")} style={headerBtn}>
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
                        onChange={(e) => handleStartDateChange(e.target.value)}
                        style={styles.dateInput}
                    />
                </div>

                <div style={styles.dateField}>
                    <label style={styles.dateLabel}>Sampai Tanggal</label>
                    <input
                        type="date"
                        value={endDate}
                        min={startDate}
                        onChange={(e) => handleEndDateChange(e.target.value)}
                        style={styles.dateInput}
                    />
                </div>

                <div style={styles.dateFieldCheckbox}>
                    <label style={styles.checkboxLabel}>
                        <input
                            type="checkbox"
                            checked={showAllOption === 'Y'}
                            onChange={(e) => setShowAllOption(e.target.checked ? 'Y' : 'N')}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        Tampilkan Semua User
                    </label>
                </div>
            </div>

            {/* Container tabel responsif agar tidak terpotong di layar kecil */}
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
                    summaryRow={{ columnKey: "GrandTotal", value: totalAmountFormatted, label: "Total Semua" }}
                />
            </div>
        </div>
    );
};

export default PurchasingList;