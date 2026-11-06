import { 
    useState, 
    useEffect, 
    useCallback, 
} from "react";
import { 
    PageHeader, 
    DataTable, 
    WorkflowProgressButton,
} from "@/shared/components";
import { idempiereApi } from "@/api/idempiereApi";
import { renderListPDF } from "@/utils/pdf/renderListPDF";
import { generateShipmentPDF } from "@/features/sales/order/utils/generateShipmentPDF";
import { useOrgInfo } from "@/shared/hooks/useOrgInfo";
import {
    STATUS_FILTERS, 
    StatusBadge, 
    normalizeStatus,
    buildStatusCondition, 
    isDownloadable,
} from "@/utils/docStatus";
import { listPageStyles as styles } from "@/utils/listPageStyles";
import "@/App.css";

// ─────────────────────────────────────────────────────────────────────────────
// ShipmentCustomerReport.jsx
// Laporan Shipment (Customer) dari tabel M_InOut — pola sama dengan
// SalesInvoiceList.jsx (filter tanggal, search DocumentNo, paging, Print PDF
// daftar, Download PDF per dokumen).
//
// Beda dengan Sales Invoice:
//   - Filter: IsSOTrx eq true + MovementType eq 'C-' (Customer Shipment saja,
//     Customer Return 'C+' tidak ikut) dan tanggal pakai MovementDate.
//   - M_InOut tidak punya nominal, jadi summary = jumlah dokumen (bukan total Rp).
//   - Tidak ada tombol Edit / New: Shipment dibuat otomatis dari Sales Order
//     (lihat useSalesShipmentSubmit.jsx).
// ─────────────────────────────────────────────────────────────────────────────

const ShipmentCustomerReport = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const { orgInfo } = useOrgInfo();
    const [shipments, setShipments]         = useState([]);
    const [loading, setLoading]             = useState(false);
    const [search, setSearch]               = useState("");
    const [offset, setOffset]               = useState(0);
    const [totalRecords, setTotalRecords]   = useState(0);
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [downloadingId, setDownloadingId] = useState(null);
    const [printingList, setPrintingList]   = useState(false);
    const [startDate, setStartDate]         = useState(todayStr);
    const [endDate, setEndDate]             = useState(todayStr);
    const pageSize                          = 10;

    const getStatusLabel = (status) => {
        const map = { DR: "Draft", IP: "In Progress", CO: "Completed", CL: "Closed", VO: "Voided", RE: "Reversed", NA: "Ditolak" };
        return map[status] || status;
    };

    const getStatusColor = (status) => {
        const map = { DR: "#f57c00", CO: "#19cc22", CL: "#37474f", VO: "#f81010", IP: "#1565c0", NA: "#c62828" };
        return map[status] || "#555";
    };

    // Filter dipakai bersama oleh list, print, dan download.
    const buildFilter = useCallback(() => {
        let filterClause =
            ` IsSOTrx eq true` +
            ` and MovementType eq 'C-'` +
            ` and MovementDate ge ${startDate}T00:00:00Z` +
            ` and MovementDate le ${endDate}T23:59:59Z`;
    
        if (search) {
            filterClause += ` and contains(tolower(DocumentNo),'${search.toLowerCase().replace(/'/g, "''")}')`;
        }
    
        const statusCond = buildStatusCondition(statusFilter);
        if (statusCond) filterClause += ` and ${statusCond}`;
    
        return filterClause;
    }, [search, startDate, endDate, statusFilter]);   // ← tambah statusFilter

    const fetchShipments = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return;

        setLoading(true);
        try {
            const res = await idempiereApi(
                `/models/m_inout` +
                `?$filter=${buildFilter()}` +
                `&$select=M_InOut_ID,DocumentNo,MovementDate,C_BPartner_ID,M_Warehouse_ID,C_Order_ID,DocStatus,Description` +
                `&$orderby=DocumentNo desc` +
                `&$top=${pageSize}` +
                `&$skip=${offset}`
            );

            setShipments(Array.isArray(res.records) ? res.records : []);
            setTotalRecords(res["row-count"] || res.totalRecords || 0);
        } catch (err) {
            console.error("Gagal fetch customer shipments:", err.message);
        } finally {
            setLoading(false);
        }
    }, [offset, buildFilter]);

    useEffect(() => {
        fetchShipments();
    }, [fetchShipments]);

    const numberFormatter = new Intl.NumberFormat("en-US");

    const formatDateService = (dateStr) => {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        if (isNaN(d)) return "-";
        return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    };

    const columns = [
        { key: "DocumentNo",     label: "No. Dokumen" },
        { key: "MovementDate",   label: "Tanggal" },
        { key: "C_BPartner_ID",  label: "Customer" },
        { key: "C_Order_ID",     label: "Ref. Order" },
        { key: "M_Warehouse_ID", label: "Gudang" },
        { key: "DocStatus",      label: "Status", align: "center" },
    ];

    // ─── Print daftar (semua halaman, maks 5000 baris) ────────────────────
    const fetchAllShipmentsForPrint = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return [];

        const res = await idempiereApi(
            `/models/m_inout` +
            `?$filter=${buildFilter()}` +
            `&$select=M_InOut_ID,DocumentNo,MovementDate,C_BPartner_ID,M_Warehouse_ID,C_Order_ID` +
            `&$orderby=DocumentNo desc` +
            `&$top=5000`
        );
        return Array.isArray(res.records) ? res.records : [];
    }, [buildFilter]);

    const handlePrintList = async () => {
        setPrintingList(true);
        try {
            const all = await fetchAllShipmentsForPrint();

            if (all.length === 0) {
                alert("Tidak ada data untuk dicetak pada periode ini.");
                return;
            }

            await renderListPDF({
                title: "DAFTAR SHIPMENT (CUSTOMER)",
                orgInfo,
                periodLabel: `PERIODE : ${formatDateService(startDate)}  ${formatDateService(endDate)}`,
                columns: [
                    { key: "no",         label: "No",           width: 30,  align: "center" },
                    { key: "documentNo", label: "Document No",  width: "auto" },
                    { key: "date",       label: "Date",         width: "auto" },
                    { key: "partner",    label: "Customer",     width: "flex" },
                    { key: "order",      label: "Ref. Order",   width: "auto" },
                    { key: "warehouse",  label: "Gudang",       width: "auto" },
                ],
                rows: all.map((s, idx) => ({
                    no:         idx + 1,
                    documentNo: s.DocumentNo || `#${s.id ?? s.M_InOut_ID}`,
                    date:       formatDateService(s.MovementDate),
                    partner:    s.C_BPartner_ID?.identifier || "-",
                    order:      s.C_Order_ID?.identifier || "-",
                    warehouse:  s.M_Warehouse_ID?.identifier || "-",
                })),
                totalLabel: "Total Dokumen",
                totalValue: numberFormatter.format(all.length),
                filenamePrefix: `DAFTAR-SHIPMENT-${startDate}_${endDate}`,
            });
        } catch (err) {
            console.error("Gagal generate PDF daftar:", err.message);
            alert("Gagal membuat PDF daftar.");
        } finally {
            setPrintingList(false);
        }
    };

    // ─── Download PDF per Shipment (Surat Jalan) ──────────────────────────
    const handleDownload = async (shipment) => {
        const shipmentId = shipment._shipmentId;
        setDownloadingId(shipmentId);
        try {
            await generateShipmentPDF(shipmentId, shipment._documentNo, orgInfo);
        } catch (err) {
            console.error("Failed to generate PDF:", err.message);
            alert("Failed to create PDF Document");
        } finally {
            setDownloadingId(null);
        }
    };

    const tableData = shipments.map((s) => {
        const shipmentId = s.id ?? s.M_InOut_ID;
        const status = normalizeStatus(s.DocStatus);

        return {
            ...s,
            _raw:         s,
            _shipmentId:  shipmentId,
            _documentNo:  s.DocumentNo || `#${shipmentId}`,
            _status:      status,
            DocumentNo:   s.DocumentNo || `#${shipmentId}`,
            MovementDate: s.MovementDate
                ? new Date(s.MovementDate).toLocaleDateString("id-ID")
                : "-",
            C_BPartner_ID:  s.C_BPartner_ID?.identifier || s.C_BPartner_ID?.Name || "-",
            C_Order_ID:     s.C_Order_ID?.identifier || "-",
            M_Warehouse_ID: s.M_Warehouse_ID?.identifier || "-",
            DocStatus: <StatusBadge status={status} />,
            // DocStatus: (
            //     <span style={{ ...styles.badge, backgroundColor: getStatusColor(status) }}>
            //         {getStatusLabel(status)}
            //     </span>
            // ),
        };
    });

    const actionRenderer = (item) => {
        const isDownloading      = downloadingId === item._shipmentId;
        const isDownloadDisabled = !isDownloadable(item._status) || isDownloading;
        //const isDownloadDisabled = item._status !== "CO" || isDownloading; // hanya aktif saat Completed

        return (
            <div style={{ display: "flex", gap: "6px" }}>
                <button
                    onClick={() => !isDownloadDisabled ? handleDownload(item) : null}
                    disabled={isDownloadDisabled}
                    style={{
                        ...styles.actionBtn,
                        backgroundColor: isDownloadDisabled ? "#ccc" : "#546e7a",
                        cursor:          isDownloadDisabled ? "not-allowed" : "pointer",
                        opacity:         isDownloadDisabled ? 0.6 : 1,
                    }}
                    title={
                        item._status !== "CO"
                            ? "Download ready only for Completed Document"
                            : "Download Document"
                    }
                >
                    {isDownloading ? "⏳ ..." : "⬇️ Download"}
                </button>
                <WorkflowProgressButton
                     tableName="M_InOut"
                     recordId={item._shipmentId}
                     docStatus={item._status}
                     targetStatus="CO"
                     buttonStyle={styles.editBtn}
                />
            </div>
        );
    };

    const handleStartDateChange = (val) => { setStartDate(val); setOffset(0); };
    const handleEndDateChange   = (val) => { setEndDate(val);   setOffset(0); };

    return (
        <div style={styles.cardContainer}>
            <PageHeader
                title="Shipment (Customer) Report"
                onSearch={(val) => { setSearch(val); setOffset(0); }}
                filters={STATUS_FILTERS}
                activeFilter={statusFilter}
                onFilterChange={(val) => { setStatusFilter(val); setOffset(0); }}
                extraAction={
                    <div style={styles.headerActions}>
                        <button onClick={handlePrintList} disabled={printingList} style={styles.printBtn}>
                            {printingList ? "⏳ ..." : "🖨️ Print PDF"}
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
                summaryRow={{ columnKey: "DocumentNo", value: numberFormatter.format(totalRecords), label: "Total Dokumen" }}
            />
        </div>
    );
};

export default ShipmentCustomerReport;
