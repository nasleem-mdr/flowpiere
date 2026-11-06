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
import { generateShipmentPDF } from "@/features/material/shipment/utils/generateShipmentPDF";
import "@/App.css";

// Shipment (Customer) dan Goods Receipt sama-sama tabel M_InOut — dibedakan
// oleh IsSOTrx. Shipment = true.
const SHIPMENT_BASE_FILTER = "IsSOTrx eq true";

const ShipmentList = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const { orgInfo } = useOrgInfo();
    const [shipments, setShipments]         = useState([]);
    const [loading, setLoading]             = useState(false);
    const [search, setSearch]               = useState("");
    const [offset, setOffset]               = useState(0);
    const [totalRecords, setTotalRecords]   = useState(0);
    const [downloadingId, setDownloadingId] = useState(null);
    const [statusFilter, setStatusFilter]   = useState("ALL");
    const [startDate, setStartDate]         = useState(todayStr);
    const [endDate, setEndDate]             = useState(todayStr);
    const [showAllOption]                   = useState('N');

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
    const toDocItem = (s) => ({ id: s._shipmentId, documentNo: s.DocumentNo, status: s._status });
    const toggleSelect = (s) =>
        setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(s._shipmentId)) next.delete(s._shipmentId);
            else next.set(s._shipmentId, toDocItem(s));
            return next;
        });
    const handleDocActionDone = () => {
        setSelected(new Map());
        fetchShipments();
    };

    const buildFilterClause = useCallback((loginUserId) => {
        const conditions = [
            SHIPMENT_BASE_FILTER,
            `Created ge ${startDate}T00:00:00Z`,
            `Created le ${endDate}T23:59:59Z`,
        ];

        if (showAllOption !== 'Y' && loginUserId) {
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

        return conditions.join(' and ');
    }, [search, startDate, endDate, statusFilter, showAllOption]);

    const fetchShipments = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (showAllOption !== 'Y' && !loginUserId) return;

        setLoading(true);
        try {
            const filterClause = buildFilterClause(loginUserId);
            const res = await idempiereApi(
                `/models/m_inout` +
                `?$filter=${filterClause}` +
                `&$select=M_InOut_ID,DocumentNo,MovementDate,M_Warehouse_ID,C_BPartner_ID,C_Order_ID,DocStatus,C_DocType_ID` +
                `&$orderby=DocumentNo desc` +
                `&$top=${pageSize}` +
                `&$skip=${offset}`
            );

            setShipments(Array.isArray(res.records) ? res.records : []);
            setTotalRecords(res["row-count"] || res.totalRecords || 0);
        } catch (err) {
            console.error("Gagal fetch Shipment:", err.message);
        } finally {
            setLoading(false);
        }
    }, [offset, buildFilterClause, showAllOption]);

    useEffect(() => {
        fetchShipments();
    }, [fetchShipments]);

    const handleEdit = (shipment) => {
        const raw = shipment._raw ?? shipment;
        let cleanShipment;
        try {
            cleanShipment = JSON.parse(JSON.stringify(raw));
        } catch {
            cleanShipment = raw;
        }
        navigate("/shipment", { state: { editShipment: cleanShipment } });
    };

    // Catatan: M_InOut tidak punya kolom total. Versi Goods Receipt memakai
    // ChargeAmt sebagai "Total Lines" (nilainya bukan total qty/nilai barang),
    // jadi di sini diganti kolom Customer + No. SO yang lebih informatif.
    const columns = [
        { key: "DocumentNo",     label: "No. Dokumen" },
        { key: "MovementDate",   label: "Tanggal" },
        { key: "C_BPartner_ID",  label: "Customer" },
        { key: "C_Order_ID",     label: "No. SO" },
        { key: "M_Warehouse_ID", label: "Gudang" },
        { key: "DocStatus",      label: "Status", align: "center" },
    ];

    const handleDownload = async (shipment) => {
        const shipmentId = shipment._shipmentId ?? shipment.id;
        setDownloadingId(shipmentId);
        try {
            await generateShipmentPDF(shipmentId, shipment.DocumentNo, orgInfo);
        } catch (err) {
            console.error("Gagal generate PDF:", err.message);
            alert("Gagal membuat dokumen PDF.");
        } finally {
            setDownloadingId(null);
        }
    };

    const tableData = shipments.map((shipment) => {
        const shipmentId = shipment.id ?? shipment.M_InOut_ID;
        const status = normalizeStatus(shipment.DocStatus);

        return {
            ...shipment,
            _raw: shipment,
            _shipmentId: shipmentId,
            _status: status,
            DocumentNo: shipment.DocumentNo || `#${shipmentId}`,
            MovementDate: shipment.MovementDate
                ? new Date(shipment.MovementDate).toLocaleDateString("id-ID")
                : "-",
            C_BPartner_ID: shipment.C_BPartner_ID?.identifier || "-",
            C_Order_ID: shipment.C_Order_ID?.identifier || "-",
            M_Warehouse_ID: shipment.M_Warehouse_ID?.identifier
                || shipment.M_Warehouse_ID?.Name
                || "-",
            DocStatus: <StatusBadge status={status} />,
        };
    });

    const actionRenderer = (item) => {
        const isEditDisabled = !["DR", "NA"].includes(item._status);
        const editTitle = item._status === "NA"
            ? "Revisi & ajukan ulang untuk approval"
            : "Edit Dokumen";
        const isDownloading = downloadingId === item._shipmentId;
        const isDownloadDisabled = item._status !== "CO" || isDownloading;

        const btnStyle = isMobile ? { ...styles.editBtn, padding: "6px 8px", fontSize: "14px" } : styles.editBtn;

        return (
            <div style={styles.actionContainer}>
                <input
                    type="checkbox"
                    checked={selected.has(item._shipmentId)}
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
                            : "Download Surat Jalan"
                    }
                >
                    {isDownloading ? "⏳" : "⬇️"} {!isMobile && "Download"}
                </button>

                {/* Tombol Workflow Progress */}
                <WorkflowProgressButton
                    tableName="M_InOut"
                    recordId={item._shipmentId}
                    docStatus={item._status}
                    targetStatus="CO"
                    buttonStyle={btnStyle}
                />

                {/* Doc Action Button (Complete / Close / Void, dll.) */}
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
                title="Shipment (Customer)"
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
                            onClick={() => navigate("/shipment")}
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
                />
            </div>
        </div>
    );
};

export default ShipmentList;
