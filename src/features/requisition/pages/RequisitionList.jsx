import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
    PageHeader, 
    DataTable, 
    WorkflowProgressButton, 
} from "@/shared/components";

import {
    STATUS_FILTERS, 
} from "@/utils/docStatus";

import { renderListPDF } from "@/utils/pdf/renderListPDF";
import { generateRequisitionPDF } from '@/features/requisition/utils/generateRequisitionPDF';
import { idempiereApi } from "@/api/idempiereApi";
import { useOrgInfo } from "@/shared/hooks/useOrgInfo";
import "@/App.css";
import DocActionButton from "@/shared/components/DocActionButton";
import { listPageStyles as styles } from "@/utils/listPageStyles";
import { getAvailableActions } from "@/shared/docAction/docActionConfig";

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

const RequisitionList = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const { orgInfo } = useOrgInfo();
    const [requisitions, setRequisitions]   = useState([]);
    const [loading, setLoading]             = useState(false);
    const [search, setSearch]               = useState("");
    const [statusFilter, setStatusFilter]   = useState("ALL");
    const [offset, setOffset]               = useState(0);
    const [totalRecords, setTotalRecords]   = useState(0);
    const [totalLinesAll, setTotalLinesAll] = useState(null);
    const [downloadingId, setDownloadingId] = useState(null);
    const [startDate, setStartDate]         = useState(todayStr);
    const [endDate, setEndDate]             = useState(todayStr);
    const [printingList, setPrintingList]   = useState(false);
    
    // State untuk mendeteksi apakah layar mobile (lebar < 768px)
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const pageSize = 10;
    const navigate = useNavigate();
    
    // --- Pilihan baris untuk aksi massal Close/Void ---
    const [selected, setSelected] = useState(() => new Map());
    const toDocItem = (r) => ({ id: r._requisitionId, documentNo: r.DocumentNo, status: r._status });
    const toggleSelect = (r) =>
        setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(r._requisitionId)) next.delete(r._requisitionId);
            else next.set(r._requisitionId, toDocItem(r));
            return next;
        });
    const handleDocActionDone = () => {
        setSelected(new Map());
        fetchRequisitions();
        fetchTotalLines();
    };

    const getStatusLabel = (status) => {
        const map = { DR: "Draft", IP: "In Progress", CO: "Completed", VO: "Voided", RE: "Reversed", NA: "Ditolak" };
        return map[status] || status;
    };

    const getStatusColor = (status) => {
        const map = { DR: "#f57c00", CO: "#2e7d32", VO: "#c62828", IP: "#1565c0", NA: "#c62828" };
        return map[status] || "#555";
    };

    const buildFilterClause = useCallback((loginUserId) => {
        let filterClause =
            ` CreatedBy eq ${loginUserId}` +
            ` and Created ge ${startDate}T00:00:00Z` +
            ` and Created le ${endDate}T23:59:59Z`;

        if (search) {
            filterClause += ` and contains(tolower(DocumentNo),'${search.toLowerCase()}')`;
        }
        if (statusFilter && statusFilter !== "ALL") {
            filterClause += ` and DocStatus eq '${statusFilter}'`;
        }
        return filterClause;
    }, [search, startDate, endDate, statusFilter]);

    const fetchRequisitions = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return;

        setLoading(true);
        try {
            const filterClause = buildFilterClause(loginUserId);
            const res = await idempiereApi(
                `/models/m_requisition` +
                `?$filter=${filterClause}` +
                `&$select=M_Requisition_ID,DocumentNo,DateDoc,M_Warehouse_ID,TotalLines,DocStatus,M_PriceList_ID,C_DocType_ID` +
                `&$orderby=DocumentNo desc` +
                `&$top=${pageSize}` +
                `&$skip=${offset}`
            );

            setRequisitions(Array.isArray(res.records) ? res.records : []);
            setTotalRecords(res["row-count"] || res.totalRecords || 0);
        } catch (err) {
            console.error("Gagal fetch requisitions:", err.message);
        } finally {
            setLoading(false);
        }
    }, [offset, buildFilterClause]);

    const fetchTotalLines = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return;

        setTotalLinesAll(null); 
        try {
            const filterClause = buildFilterClause(loginUserId);
            const res = await idempiereApi(
                `/models/m_requisition` +
                `?$filter=${filterClause}` +
                `&$select=TotalLines`
            );

            const records = Array.isArray(res.records) ? res.records : [];
            const total   = records.reduce((sum, r) => sum + parseFloat(r.TotalLines || 0), 0);
            setTotalLinesAll(total);
        } catch (err) {
            console.error("Gagal fetch total lines:", err.message);
            setTotalLinesAll(0);
        }
    }, [buildFilterClause]);

    useEffect(() => {
        fetchRequisitions();
    }, [fetchRequisitions]);

    useEffect(() => {
        fetchTotalLines();
    }, [fetchTotalLines]);

    const handleEdit = (requisition) => {
        const raw = requisition._raw ?? requisition;
        let cleanRequisition;
        try {
            cleanRequisition = JSON.parse(JSON.stringify(raw));
        } catch {
            cleanRequisition = raw;
        }
        navigate("/requisition", { state: { editRequisition: cleanRequisition } });
    };

    const totalLinesFormatted = totalLinesAll === null
        ? "Menghitung..."
        : ` ${totalLinesAll.toLocaleString("id-ID")}`;

    const columns = [
        { key: "DocumentNo",    label: "No. Dokumen" },
        { key: "DateDoc",       label: "Tanggal" },
        { key: "M_Warehouse_ID", label: "Gudang" },
        { key: "DocStatus",     label: "Status", align: "center" },
    ];

    const handleDownload = async (requisition) => {
        const requisitionId = requisition._requisitionId ?? requisition.id;
        setDownloadingId(requisitionId);
        try {
            await generateRequisitionPDF(requisitionId, requisition.DocumentNo, orgInfo);
        } catch (err) {
            console.error("Gagal generate PDF:", err.message);
            alert("Gagal membuat dokumen PDF.");
        } finally {
            setDownloadingId(null);
        }
    };

    const tableData = requisitions.map((requisition) => {
        const requisitionId = requisition.id ?? requisition.M_Requisition_ID;
        const status  = requisition.DocStatus?.id ?? requisition.DocStatus ?? "DR";

        return {
            ...requisition,
            _raw:              requisition,
            _requisitionId: requisitionId,
            _status:           status,
            DocumentNo:     requisition.DocumentNo || `#${requisitionId}`,
            DateDoc: requisition.DateDoc
                ? new Date(requisition.DateDoc).toLocaleDateString("id-ID")
                : "-",
            "M_Warehouse_ID": requisition.M_Warehouse_ID?.identifier
                || requisition.M_Warehouse_ID?.Name
                || "-",
            TotalLines: ` ${parseFloat(requisition.TotalLines || 0).toLocaleString("id-ID")}`,
            DocStatus: (
                <span style={{
                    ...styles.badge,
                    backgroundColor: getStatusColor(status),
                }}>
                    {getStatusLabel(status)}
                </span>
            ),
        };
    });

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

    const fetchAllRequisitionsForPrint = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return [];

        let filterClause =
            ` CreatedBy eq ${loginUserId}` +
            ` and Created ge ${startDate}T00:00:00Z` +
            ` and Created le ${endDate}T23:59:59Z`;

        if (search) {
            filterClause += ` and contains(tolower(DocumentNo),'${search.toLowerCase()}')`;
        }

        const res = await idempiereApi(
            `/models/m_requisition` +
            `?$filter=${filterClause}` +
            `&$select=M_Requisition_ID,DocumentNo,Createdby, DateRequired, DateDoc,M_Warehouse_ID,Description, TotalLines` +
            `&$orderby=DocumentNo desc` +
            `&$top=5000`
        );

        return Array.isArray(res.records) ? res.records : [];
    }, [search, startDate, endDate]);

    const handlePrintList = async () => {
        setPrintingList(true);
        try {
            const allRequisitions = await fetchAllRequisitionsForPrint();
            if (allRequisitions.length === 0) {
                alert('Tidak ada data untuk dicetak pada periode ini.');
                return;
            }
            const totalAmount = allRequisitions.reduce((s, odr) => s + parseFloat(odr.TotalLines || 0), 0);
            await renderListPDF({
                title: 'DAFTAR REQUISITION',
                orgInfo,
                periodLabel: `PERIODE : ${formatDateService(startDate)}  ${formatDateService(endDate)}`,
                columns: [
                    { key: 'no',        label: 'No',            width: 30,  align: 'center' },
                    { key: 'documentNo', label: 'Document No',   width: 'auto' },
                    { key: 'dateDoc',    label: 'Date Doc',      width: 'auto' },
                    { key: 'dateReq',    label: 'Date Required', width: 'auto' },
                    { key: 'createdBy',  label: 'Sales Rep',     width: 'auto' },
                    { key: 'partner',    label: 'Warhouse',      width: 'auto' },
                    { key: 'descript',   label: 'Description',   width: 'flex' },
                ],
                rows: allRequisitions.map((odr, idx) => ({
                    no:         idx + 1,
                    documentNo: odr.DocumentNo || `#${odr.id ?? odr.M_Requisition_ID}`,
                    dateDoc:    odr.DateDoc || `#${odr.id ?? odr.DateDoc}`,
                    dateReq:    odr.DateRequired || `#${odr.id ?? odr.DateRequired}`,
                    createdBy:  odr.CreatedBy?.identifier || '-',
                    partner:    odr.M_Warehouse_ID?.identifier || '-',
                    descript:   odr.Description || `#${odr.id ?? odr.Description}`,
                })),
                totalLabel: 'Total Semua',
                totalValue: numberFormatter.format(totalAmount),
                filenamePrefix: `DAFTAR-REQ-${startDate}_${endDate}`,
            });
        } catch (err) {
            console.error('Gagal generate PDF daftar:', err.message);
            alert('Gagal membuat PDF daftar.');
        } finally {
            setPrintingList(false);
        }
    };

    const actionRenderer = (item) => {
        const isEditDisabled = !["DR", "NA"].includes(item._status);
        const editTitle = item._status === "NA"
            ? "Revisi & ajukan ulang untuk approval"
            : "Edit Dokumen";
        const isDownloading = downloadingId === item._requisitionId;
        const isDownloadDisabled = item._status !== "CO" || isDownloading;
    
        // Semua tombol baris memakai ukuran yang sama
        const btnStyle = {
            ...styles.editBtn,
            ...uniformBtn(isMobile ? ROW_BTN_W_MOBILE : ROW_BTN_W),
            ...(isMobile && { fontSize: "14px" }),
        };
    
        return (
            <div style={{ ...styles.actionContainer, alignItems: "center" }}>
                <input
                    type="checkbox"
                    checked={selected.has(item._requisitionId)}
                    disabled={getAvailableActions("M_Requisition", item._status).length === 0}
                    onChange={() => toggleSelect(item)}
                    title="Pilih untuk aksi massal Close/Void"
                    style={{ width: "16px", height: "16px", cursor: "pointer", flexShrink: 0, margin: 0 }}
                />
    
                {/* Tombol Edit / Revisi */}
                <button
                    onClick={() => !isEditDisabled ? handleEdit(item) : null}
                    disabled={isEditDisabled}
                    style={{
                        ...btnStyle,
                        backgroundColor: !isEditDisabled ? (item._status === "NA" ? "#c62828" : "#f57c00") : "#ccc",
                        cursor:          !isEditDisabled ? "pointer" : "not-allowed",
                        opacity:         !isEditDisabled ? 1 : 0.6,
                    }}
                    title={isEditDisabled ? `Status ${getStatusLabel(item._status)} tidak dapat diubah` : editTitle}
                >
                    <span>{item._status === "NA" ? "🔁" : "✏️"}</span>
                    {!isMobile && <span>{item._status === "NA" ? "Revisi" : "Edit"}</span>}
                </button>
    
                {/* Tombol Download PDF */}
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
                            ? "Download hanya tersedia untuk dokumen dengan status Completed"
                            : "Download Dokumen"
                    }
                >
                    <span>{isDownloading ? "⏳" : "⬇️"}</span>
                    {!isMobile && <span>Download</span>}
                </button>
    
                {/* Tombol Workflow Progress */}
                <WorkflowProgressButton
                    tableName="M_Requisition"
                    recordId={item._requisitionId}
                    docStatus={item._status}
                    targetStatus="CO"
                    buttonStyle={btnStyle}
                />
    
                {/* Doc Action Button (Close/Void individual) */}
                <DocActionButton
                    tableName="M_Requisition"
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
    const headerBtn = isMobile
    ? { ...styles.newBtn, ...uniformBtn("auto", 32), minWidth: 44, padding: "0 10px" }
    : { ...styles.newBtn, ...uniformBtn(HEADER_BTN_W, 32) };

    return (
        <div style={styles.cardContainer}>
            <PageHeader
                title="Requisition"
                onSearch={(val) => { setSearch(val); setOffset(0); }}
                filters={STATUS_FILTERS}
                activeFilter={statusFilter}
                onFilterChange={handleFilterChange}
                extraAction={
                    <div style={{ ...styles.headerActions, alignItems: "center" }}>
                        <DocActionButton
                            tableName="M_Requisition"
                            items={[...selected.values()]}
                            label={isMobile ? `⛔ (${selected.size})` : `⛔ Close / Void (${selected.size})`}
                            onDone={handleDocActionDone}
                            style={{ ...headerBtn, backgroundColor: "#6d4c41" }}
                        />
                        <button onClick={handlePrintList} disabled={printingList} style={headerBtn}>
                            <span>{printingList ? "⏳" : "🖨️"}</span>
                            {!isMobile && <span>Print</span>}
                        </button>
                        <button onClick={() => navigate("/requisition")} style={headerBtn}>
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
                    summaryRow={{ columnKey: "TotalLines", value: totalLinesFormatted, label: "Total Semua" }}
                />
            </div>
        </div>
    );
};

export default RequisitionList;