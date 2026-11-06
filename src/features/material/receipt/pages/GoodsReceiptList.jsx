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
    normalizeStatus,
    buildStatusCondition, 
} from "@/utils/docStatus";
import DocActionButton from "@/shared/components/DocActionButton";
import { getAvailableActions } from "@/shared/docAction/docActionConfig";

import { useOrgInfo } from "@/shared/hooks/useOrgInfo";
import { idempiereApi } from "@/api/idempiereApi";
import { listPageStyles as styles } from "@/utils/listPageStyles";
import { generateGoodsReceiptPDF } from "@/features/material/receipt/utils/generateGoodsReceiptPDF";
import "@/App.css";

const GoodsReceiptList = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const { orgInfo } = useOrgInfo();
    const [goodsreceipts, setGoodsReceipts]      = useState([]);
    const [loading, setLoading]             = useState(false);
    const [search, setSearch]             = useState("");
    const [offset, setOffset]             = useState(0);
    const [totalRecords, setTotalRecords] = useState(0);
    const [chargeAmtAll, setChargeAmtAll] = useState(null);
    const [downloadingId, setDownloadingId] = useState(null);
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [startDate, setStartDate]       = useState(todayStr);
    const [endDate, setEndDate]           = useState(todayStr);
    const [showAllOption, setShowAllOption] = useState('N');

    // State untuk mendeteksi apakah layar perangkat adalah mobile (< 768px)
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const pageSize                        = 10;
    const navigate                        = useNavigate();

    // --- Pilihan baris untuk aksi massal Close/Void ---
    const [selected, setSelected] = useState(() => new Map());
    const toDocItem = (g) => ({ id: g._goodsreceiptId, documentNo: g.DocumentNo, status: g._status });
    const toggleSelect = (g) =>
        setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(g._goodsreceiptId)) next.delete(g._goodsreceiptId);
            else next.set(g._goodsreceiptId, toDocItem(g));
            return next;
        });
    const handleDocActionDone = () => {
        setSelected(new Map());
        fetchGoodsReceipts();
        fetchChargeAmts();
    };

    // Buat fungsi filter clause yang konsisten
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

    const fetchGoodsReceipts = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (showAllOption !== 'Y' && !loginUserId) return;

        setLoading(true);
        try {
            const filterClause = buildFilterClause(loginUserId);
            const res = await idempiereApi(
                `/models/m_inout` +
                `?$filter=${filterClause}` +
                `&$select=M_InOut_ID,DocumentNo,MovementDate,M_Warehouse_ID,ChargeAmt,DocStatus,C_DocType_ID` +
                `&$orderby=DocumentNo desc` +
                `&$top=${pageSize}` +
                `&$skip=${offset}`
            );

            setGoodsReceipts(Array.isArray(res.records) ? res.records : []);
            setTotalRecords(res["row-count"] || res.totalRecords || 0);
        } catch (err) {
            console.error("Gagal fetch Goods receipt:", err.message);
        } finally {
            setLoading(false);
        }
    }, [offset, buildFilterClause, showAllOption]);

    const fetchChargeAmts = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (showAllOption !== 'Y' && !loginUserId) return;

        setChargeAmtAll(null); 
        try {
            const filterClause = buildFilterClause(loginUserId);
            const res = await idempiereApi(
                `/models/m_inout` +
                `?$filter=${filterClause}` +
                `&$select=ChargeAmt`
            );

            const records = Array.isArray(res.records) ? res.records : [];
            const total   = records.reduce((sum, r) => sum + parseFloat(r.ChargeAmt || 0), 0);
            setChargeAmtAll(total);
        } catch (err) {
            console.error("Gagal fetch total lines:", err.message);
            setChargeAmtAll(0);
        }
    }, [buildFilterClause, showAllOption]);

    useEffect(() => {
        fetchGoodsReceipts();
    }, [fetchGoodsReceipts]);

    useEffect(() => {
        fetchChargeAmts();
    }, [fetchChargeAmts]);

    const handleEdit = (goodsreceipt) => {
        const raw = goodsreceipt._raw ?? goodsreceipt;
        let cleanGoodsReceipt;
        try {
            cleanGoodsReceipt = JSON.parse(JSON.stringify(raw));
        } catch {
            cleanGoodsReceipt = raw;
        }
        navigate("/goods-receipt", { state: { editGoodsReceipt: cleanGoodsReceipt } });
    };

    const chargeAmtFormatted = chargeAmtAll === null
        ? "Menghitung..."
        : `${chargeAmtAll.toLocaleString("id-ID")}`;

    const columns = [
        { key: "DocumentNo",    label: "No. Dokumen" },
        { key: "MovementDate",   label: "Tanggal" },
        { key: "M_Warehouse_ID", label: "Gudang" },
        { key: "TotalLines",    label: "Total Lines", align: "right" },
        { key: "DocStatus",     label: "Status", align: "center" },
    ];
    
    const handleDownload = async (goodsreceipt) => {
        const goodsreceiptId = goodsreceipt._goodsreceiptId ?? goodsreceipt.id;
        setDownloadingId(goodsreceiptId);
        try {
            await generateGoodsReceiptPDF(goodsreceiptId, goodsreceipt.DocumentNo, orgInfo);
        } catch (err) {
            console.error("Gagal generate PDF:", err.message);
            alert("Gagal membuat dokumen PDF.");
        } finally {
            setDownloadingId(null);
        }
    };

    const tableData = goodsreceipts.map((goodsreceipt) => {
        const goodsreceiptId = goodsreceipt.id ?? goodsreceipt.M_InOut_ID;
        const status = normalizeStatus(goodsreceipt.DocStatus);

        return {
            ...goodsreceipt,
            _raw: goodsreceipt, 
            _goodsreceiptId: goodsreceiptId,
            _status: status,
            DocumentNo: goodsreceipt.DocumentNo || `#${goodsreceiptId}`,
            MovementDate: goodsreceipt.MovementDate
                ? new Date(goodsreceipt.MovementDate).toLocaleDateString("id-ID")
                : "-",
            "M_Warehouse_ID": goodsreceipt.M_Warehouse_ID?.identifier
                || goodsreceipt.M_Warehouse_ID?.Name
                || "-",
            TotalLines: `${parseFloat(goodsreceipt.TotalLines || 0).toLocaleString("id-ID")}`,
            DocStatus: <StatusBadge status={status} />,
        };
    });

    const actionRenderer = (item) => {
        const isEditDisabled = !["DR", "NA"].includes(item._status);
        const editTitle = item._status === "NA"
            ? "Revisi & ajukan ulang untuk approval"
            : "Edit Dokumen";
        const isDownloading = downloadingId === item._goodsreceiptId;
        const isDownloadDisabled = item._status !== "CO" || isDownloading;
    
        const btnStyle = isMobile ? { ...styles.editBtn, padding: "6px 8px", fontSize: "14px" } : styles.editBtn;

        return (
            <div style={styles.actionContainer}>
                <input
                    type="checkbox"
                    checked={selected.has(item._goodsreceiptId)}
                    disabled={getAvailableActions("M_InOut", item._status).length === 0}
                    onChange={() => toggleSelect(item)}
                    title="Pilih untuk aksi massal Close/Void"
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                />
                
                {/* Tombol Edit / Revisi */}
                <button
                    onClick={() => !isEditDisabled ? handleEdit(item) : null}
                    disabled={isEditDisabled}
                    style={{
                        ...btnStyle,
                        backgroundColor: !isEditDisabled ? (item._status === "NA" ? "#c62828" : "#f57c00") : "#ccc",
                        cursor: !isEditDisabled ? "pointer" : "not-allowed",
                        opacity: !isEditDisabled ? 1 : 0.6,
                    }}
                    title={isEditDisabled ? `Status tidak dapat diubah` : editTitle}
                >
                    {item._status === "NA" ? "🔁" : "✏️"} {!isMobile && (item._status === "NA" ? "Revisi" : "Edit")}
                </button>
    
                {/* Tombol Download PDF */}
                <button
                    onClick={() => !isDownloadDisabled ? handleDownload(item) : null}
                    disabled={isDownloadDisabled}
                    style={{
                        ...btnStyle,
                        backgroundColor: isDownloadDisabled ? "#ccc" : "#546e7a",
                        cursor: isDownloadDisabled ? "not-allowed" : "pointer",
                        opacity: isDownloadDisabled ? 0.6 : 1,
                    }}
                    title={
                        item._status !== "CO"
                            ? `Download hanya tersedia untuk dokumen dengan status Completed`
                            : "Download Dokumen"
                    }
                >
                    {isDownloading ? "⏳" : "⬇️"} {!isMobile && "Download"}
                </button>

                {/* Tombol Workflow Progress */}
                <WorkflowProgressButton
                    tableName="M_InOut"
                    recordId={item._goodsreceiptId}
                    docStatus={item._status}
                    targetStatus="CO"
                    buttonStyle={btnStyle}
                />

                {/* Doc Action Button */}
                <DocActionButton
                    tableName="M_InOut"
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

    return (
        <div style={styles.cardContainer}>
            <PageHeader
                filters={STATUS_FILTERS}
                activeFilter={statusFilter}
                onFilterChange={(newStatus) => { setStatusFilter(newStatus); setOffset(0); }}
                title="Goods Receipt"
                onSearch={(val) => { setSearch(val); setOffset(0); }}
                extraAction={
                    <div style={styles.headerActions}>
                        <DocActionButton
                            tableName="M_InOut"
                            items={[...selected.values()]}
                            label={isMobile ? `⛔ (${selected.size})` : `⛔ Close / Void (${selected.size})`}
                            onDone={handleDocActionDone}
                            style={{ ...styles.newBtn, backgroundColor: "#6d4c41" }}
                        />
                        <button
                            onClick={() => navigate("/goods-receipt")}
                            style={styles.newBtn}
                        >
                            + Baru
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
                    summaryRow={{ columnKey: "TotalLines", value: chargeAmtFormatted, label: "Total Semua" }}
                />
            </div>
        </div>
    );
};

export default GoodsReceiptList;