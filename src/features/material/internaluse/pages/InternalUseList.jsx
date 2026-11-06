import { 
    useState, 
    useEffect, 
    useCallback,
} from "react";

import { useNavigate } from "react-router-dom";

import { 
    PageHeader, 
    DataTable, 
    WorkflowProgressButton,
} from "@/shared/components";
import { useOrgInfo } from "@/shared/hooks/useOrgInfo";
import { idempiereApi } from "@/api/idempiereApi";
import { renderListPDF } from "@/utils/pdf/renderListPDF";
import {
    STATUS_FILTERS, 
    StatusBadge, 
    normalizeStatus,
    buildStatusCondition, 
} from "@/utils/docStatus";
import "@/App.css";
import{ generateInternalUsePDF } from "@/features/material/internaluse/utils/generateInternalUsePDF"

const InternalUseList = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const { orgInfo } = useOrgInfo();
    
    const [internaluses, setInternalUses]             = useState([]);
    const [loading, setLoading]             = useState(false);
    const [search, setSearch]             = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [offset, setOffset]             = useState(0);
    const [totalRecords, setTotalRecords] = useState(0);
    const [approvalAmtAll, setApprovalAmtAll] = useState(null);
    const [downloadingId, setDownloadingId] = useState(null);
    const [startDate, setStartDate]       = useState(todayStr);
    const [endDate, setEndDate]           = useState(todayStr);
    const [showAllOption, setShowAllOption] = useState('N');
    const [printingList, setPrintingList] = useState(false);

    const pageSize                        = 10;
    const navigate                        = useNavigate();

    const getStatusLabel = (status) => {
        const map = { DR: "Draft", IP: "In Progress", CO: "Completed", CL: "Closed", VO: "Voided", RE: "Reversed", NA: "Ditolak" };
        return map[status] || status;
    };

    const buildFilterClause = useCallback((loginUserId) => {
        const conditions = [
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

    const fetchInternalUses = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return;

        setLoading(true);
        try {
            const filterClause = buildFilterClause(loginUserId);
            const res = await idempiereApi(
                `/models/m_inventory` +
                `?$filter=${filterClause}` +
                `&$select=M_Inventory_ID,DocumentNo,MovementDate,ApprovalAmt,M_Warehouse_ID,DocStatus,C_DocType_ID` +
                `&$orderby=DocumentNo desc` +
                `&$top=${pageSize}` +
                `&$skip=${offset}`
            );

            setInternalUses(Array.isArray(res.records) ? res.records : []);
            setTotalRecords(res["row-count"] || res.totalRecords || 0);
        } catch (err) {
            console.error("Gagal fetch Internal Use:", err.message);
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
                canvas.width = width * 2;  
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

    const fetchApprovalAmts = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return;

        setApprovalAmtAll(null);
        try {
            const filterClause = buildFilterClause(loginUserId);
            const res = await idempiereApi(
                `/models/m_inventory` +
                `?$filter=${filterClause}` +
                `&$select=ApprovalAmt`
            );

            const records = Array.isArray(res.records) ? res.records : [];
            const total   = records.reduce((sum, r) => sum + parseFloat(r.ApprovalAmt || 0), 0);
            setApprovalAmtAll(total);
        } catch (err) {
            console.error("Gagal fetch total lines:", err.message);
            setApprovalAmtAll(0);
        }
    }, [buildFilterClause]);

    useEffect(() => {
        fetchInternalUses();
    }, [fetchInternalUses]);

    useEffect(() => {
        fetchApprovalAmts();
    }, [fetchApprovalAmts]);

    const handleEdit = (internaluse) => {
        const raw = internaluse._raw ?? internaluse;
        let cleanInternalUse;
        try {
            cleanInternalUse = JSON.parse(JSON.stringify(raw));
        } catch {
            cleanInternalUse = raw;
        }
        navigate("/internal-use", { state: { editInternalUse: cleanInternalUse } });
    };

    const approvalAmtFormatted = approvalAmtAll === null
        ? "Menghitung..."
        : ` ${approvalAmtAll.toLocaleString("id-ID")}`;

    const columns = [
        { key: "DocumentNo",    label: "No. Dokumen" },
        { key: "MovementDate",   label: "Tanggal" },
        { key: "M_Warehouse_ID", label: "Gudang" },
        { key: "TotalLines",    label: "Total Lines", align: "right" },
        { key: "DocStatus",     label: "Status", align: "center" },
    ];

    // const handleDownload = async (internaluse) => {
    //     const internaluseId = internaluse._internaluseId ?? internaluse.id;
    //     setDownloadingId(internaluseId);
    //     try {
    //         const token = localStorage.getItem("token");
    //         await generateInternalUsePDF(internaluseId, internaluse.DocumentNo, token);
    //     } catch (err) {
    //         console.error("Gagal generate PDF:", err.message);
    //         alert("Gagal membuat dokumen PDF.");
    //     } finally {
    //         setDownloadingId(null);
    //     }
    // };
    const handleDownload = async (internaluse) => {
        const internaluseId = internaluse._internaluseId ?? internaluse.id;
        
        // Validasi opsional: Beritahu user jika data organisasi masih dimuat
        if (!orgInfo) {
            alert("Data organisasi masih dimuat, silakan coba beberapa saat lagi.");
            return;
        }

        setDownloadingId(internaluseId);
        try {
            await generateInternalUsePDF(internaluseId, internaluse.DocumentNo, orgInfo);
        } catch (err) {
            console.error("Gagal generate PDF:", err.message);
            alert("Gagal membuat dokumen PDF.");
        } finally {
            setDownloadingId(null);
        }
    };
    const tableData = internaluses.map((internaluse) => {
        const internaluseId = internaluse.id ?? internaluse.M_Inventory_ID;
        const status  = normalizeStatus(internaluse.DocStatus);

        return {
            ...internaluse,
            _raw: internaluse, 
            _internaluseId: internaluseId,
            _status: status,
            DocumentNo: internaluse.DocumentNo || `#${internaluseId}`,
            MovementDate: internaluse.MovementDate
                ? new Date(internaluse.MovementDate).toLocaleDateString("id-ID")
                : "-",
            "M_Warehouse_ID": internaluse.M_Warehouse_ID?.identifier
                || internaluse.M_Warehouse_ID?.Name
                || "-",
            TotalLines: ` ${parseFloat(internaluse.ApprovalAmt || 0).toLocaleString("id-ID")}`,
            DocStatus: <StatusBadge status={status} />,
        };
    });

    const actionRenderer = (item) => {
        const isEditDisabled = !["DR", "NA"].includes(item._status);
        const editTitle = item._status === "NA"
            ? "Revisi & ajukan ulang untuk approval"
            : "Edit Dokumen";
        const isDownloading = downloadingId === item._internaluseId;
        const isDownloadDisabled = item._status !== "CO" || isDownloading; 
    
        return (
            <div style={{ display: "flex", gap: "6px" }}>
                <button
                    onClick={() => !isEditDisabled ? handleEdit(item) : null}
                    disabled={isEditDisabled}
                    style={{
                        ...styles.editBtn,
                        backgroundColor: !isEditDisabled ? (item._status === "NA" ? "#c62828" : "#f57c00") : "#ccc",
                        cursor:          !isEditDisabled ? "pointer"  : "not-allowed",
                        opacity:         !isEditDisabled ? 1          : 0.6,
                    }}
                    title={isEditDisabled ? `Status ${getStatusLabel(item._status)} tidak dapat diubah` : editTitle}
                >
                    {item._status === "NA" ? "🔁 Revisi" : "✏️ Edit"}
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
                            ? `Download hanya tersedia untuk dokumen dengan status Completed`
                            : "Download Dokumen"
                    }
                >
                    {isDownloading ? "⏳ ..." : "⬇️ Download"}
                </button>

                <WorkflowProgressButton
                    tableName="M_Inventory"
                    recordId={item._internaluseId}
                    docStatus={item._status}
                    targetStatus="CO"
                    buttonStyle={styles.editBtn}
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

    const fetchAllInternalUsesForPrint = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (showAllOption !== 'Y' && !loginUserId) return [];
    
        const conditions = [
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
            `/models/m_inventory` +
            `?$filter=${encodeURIComponent(filterClause)}` +
            `&$select=M_Inventory_ID,DocumentNo,CreatedBy,MovementDate,M_Warehouse_ID,ApprovalAmt` +
            `&$orderby=DocumentNo desc` +
            `&$top=5000`
        );
    
        return Array.isArray(res.records) ? res.records : [];
    }, [search, startDate, endDate, statusFilter, showAllOption]);

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
            const allItems = await fetchAllInternalUsesForPrint();

            if (allItems.length === 0) {
                alert('Tidak ada data untuk dicetak pada periode ini.');
                return;
            }

            const totalAmt = allItems.reduce((s, itm) => s + parseFloat(itm.ApprovalAmt || 0), 0);
            await renderListPDF({
                title: 'DAFTAR INTERNAL USE',
                orgInfo,   
                periodLabel: `PERIODE : ${formatDateService(startDate)}  ${formatDateService(endDate)}`,
                columns: [
                    { key: 'no',         label: 'No',          width: 30,     align: 'center' },
                    { key: 'documentNo', label: 'Document No', width: 80 },
                    { key: 'dateMove',   label: 'Tanggal',     width: 70 },
                    { key: 'warehouse',  label: 'Gudang',      width: 130 },
                    { key: 'amount',     label: 'Amount',      width: 90, align: 'right' },
                ],
                rows: allItems.map((itm, idx) => ({
                    no:         idx + 1,
                    documentNo: itm.DocumentNo || `#${itm.id ?? itm.M_Inventory_ID}`,
                    dateMove:   itm.MovementDate ? new Date(itm.MovementDate).toLocaleDateString("id-ID") : "-",
                    warehouse:  itm.M_Warehouse_ID?.identifier || '-',
                    amount:     numberFormatter.format(itm.ApprovalAmt ?? 0),
                })),
                totalLabel: 'Total Semua',
                totalValue: numberFormatter.format(totalAmt),
                filenamePrefix: `DAFTAR-INTERNAL-USE-${startDate}_${endDate}`,
            });
        } catch (err) {
            console.error('Gagal generate PDF daftar:', err.message);
            alert('Gagal membuat PDF daftar.');
        } finally {
            setPrintingList(false);
        }
    };

    return (
        <div style={styles.cardContainer}>
            <PageHeader
                title="Internal Use"
                onSearch={(val) => { setSearch(val); setOffset(0); }}
                filters={STATUS_FILTERS}
                activeFilter={statusFilter}
                onFilterChange={handleFilterChange}
                extraAction={
                    <div style={styles.headerActions}>
                        <button onClick={handlePrintList} disabled={printingList} style={styles.newBtn}>
                            {printingList ? '⏳ ...' : '🖨️ Print PDF'}
                        </button>
                        <button onClick={() => navigate("/internal-use")} style={styles.newBtn}>
                            + Transaksi Baru
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

                <div style={{ ...styles.dateField, justifyContent: 'center' }}>
                    <label style={{ ...styles.dateLabel, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '24px' }}>
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

            <DataTable
                columns={columns}
                data={tableData}
                loading={loading}
                offset={offset}
                pageSize={pageSize}
                totalRecords={totalRecords}
                onPageChange={(newOffset) => setOffset(newOffset)}
                renderActions={actionRenderer}
                summaryRow={{ columnKey: "TotalLines", value: approvalAmtFormatted, label: "Total Semua" }}
            />
        </div>
    );
};

const styles = {
    cardContainer: {
        padding: "12px",
        maxWidth: "100%",
        boxSizing: "box-sizing",
        overflowX: "hidden",
        backgroundColor: "#fff",
        borderRadius: "5px",
    },
    newBtn: { 
        backgroundColor: "#1976d2", 
        color: "#fff", 
        border: "none", 
        padding: "8px 12px", 
        borderRadius: "6px", 
        cursor: "pointer", 
        fontWeight: "bold",
        fontSize: "13px",
        whiteSpace: "nowrap"
    },
    editBtn: { 
        color: "#fff", 
        border: "none", 
        padding: "6px 10px", 
        borderRadius: "6px", 
        fontWeight: "bold", 
        fontSize: "11px", 
        transition: "all 0.2s ease",
        whiteSpace: "nowrap"
    },
    actionContainer: {
        display: "flex", 
        gap: "4px", 
        alignItems: "center", 
        flexWrap: "nowrap",
    },
    dateFilterRow: { 
        display: "flex", 
        gap: "12px", 
        flexWrap: "wrap", 
        margin: "12px 0 16px",
        alignItems: "flex-end"
    },
    dateField: { 
        display: "flex", 
        flexDirection: "column", 
        gap: "4px",
        flex: "0 0 auto",   // tidak melebar, ukuran mengikuti input
        width: "160px",
    },
    dateLabel: { 
        fontSize: "12px", 
        fontWeight: "600", 
        color: "#555" 
    },
    dateInput: { 
        padding: "8px 10px", 
        borderRadius: "6px", 
        border: "1px solid #ccc", 
        fontSize: "13px",
        width: "100%",
        boxSizing: "border-box",   // sebelumnya "box-sizing" (salah)
    },
    headerActions: {
        display: "flex", 
        gap: "6px", 
        flexWrap: "wrap",
    },
    tableResponsiveContainer: {
        width: "100%",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
    },
};

export default InternalUseList;