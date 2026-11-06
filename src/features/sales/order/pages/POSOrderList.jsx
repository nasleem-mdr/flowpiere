import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, DataTable } from "@/shared/components";
import { idempiereApi } from "@/api/idempiereApi";
import { renderListPDF } from "@/utils/pdf/renderListPDF";
import { useOrgInfo } from '@/shared/hooks/useOrgInfo';
import ReceiptModal from "@/features/sales/order/components/ReceiptModal";
import { fetchReceiptData } from "@/features/sales/order/utils/fetchReceiptData";
import { listPageStyles as styles } from "@/utils/listPageStyles";
import "@/App.css";

const POSOrderList = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const { orgInfo } = useOrgInfo();
    const [orders, setOrders]             = useState([]);
    const [loading, setLoading]           = useState(false);
    const [search, setSearch]             = useState("");
    const [offset, setOffset]             = useState(0);
    const [totalRecords, setTotalRecords] = useState(0);
    const [grandTotalAll, setGrandTotalAll] = useState(null); // null = belum load
    const pageSize                        = 10;
    const [startDate, setStartDate]       = useState(todayStr);
    const [endDate, setEndDate]           = useState(todayStr);
    const navigate                        = useNavigate();
    const [printingList, setPrintingList] = useState(false);

    const getStatusLabel = (status) => {
        const map = { DR: "Draft", IP: "In Progress", CO: "Completed", VO: "Voided", RE: "Reversed" };
        return map[status] || status;
    };

    const getStatusColor = (status) => {
        const map = { DR: "#f57c00", CO: "#2e7d32", VO: "#c62828", IP: "#1565c0" };
        return map[status] || "#555";
    };

    const fetchOrders = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return;

        setLoading(true);
        try {
            let filterClause =
                `IsSOTrx eq true` +
                ` and CreatedBy eq ${loginUserId}` +
                ` and Created ge ${startDate}T00:00:00Z` +
                ` and Created le ${endDate}T23:59:59Z`;

            if (search) {
                filterClause += ` and contains(tolower(DocumentNo),'${search.toLowerCase()}')`;
            }

            const res = await idempiereApi(
                `/models/c_order` +
                `?$filter=${filterClause}` +
                `&$select=C_Order_ID,DocumentNo,DateOrdered,C_BPartner_ID,GrandTotal,DocStatus,M_PriceList_ID,M_Warehouse_ID,C_DocTypeTarget_ID` +
                `&$orderby=DocumentNo desc` +
                `&$top=${pageSize}` +
                `&$skip=${offset}`
            );

            setOrders(Array.isArray(res.records) ? res.records : []);
            setTotalRecords(res["row-count"] || res.totalRecords || 0);
        } catch (err) {
            console.error("Gagal fetch orders:", err.message);
        } finally {
            setLoading(false);
        }
    }, [offset, startDate, endDate, search]);

    const fetchGrandTotal = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return;

        setGrandTotalAll(null);
        try {
            let filterClause =
                `IsSOTrx eq true` +
                ` and CreatedBy eq ${loginUserId}` +
                ` and Created ge ${startDate}T00:00:00Z` +
                ` and Created le ${endDate}T23:59:59Z`;

            if (search) {
                filterClause += ` and contains(tolower(DocumentNo),'${search.toLowerCase()}')`;
            }

            const res = await idempiereApi(
                `/models/c_order` +
                `?$filter=${filterClause}` +
                `&$select=GrandTotal`
            );

            const records = Array.isArray(res.records) ? res.records : [];
            const total   = records.reduce((sum, r) => sum + parseFloat(r.GrandTotal || 0), 0);
            setGrandTotalAll(total);
        } catch (err) {
            console.error("Gagal fetch grand total:", err.message);
            setGrandTotalAll(0);
        }
    }, [search, startDate, endDate]);

    const fetchAllOrdersForPrint = useCallback(async () => {
        const loginUserId = localStorage.getItem("AD_User_ID");
        if (!loginUserId) return [];

        let filterClause =
            ` IsSOTrx eq true` +
            ` and CreatedBy eq ${loginUserId}` +
            ` and Created ge ${startDate}T00:00:00Z` +
            ` and Created le ${endDate}T23:59:59Z`;

        if (search) {
            filterClause += ` and contains(tolower(DocumentNo),'${search.toLowerCase()}')`;
        }

        const res = await idempiereApi(
            `/models/c_order` +
            `?$filter=${filterClause}` +
            `&$select=C_Order_ID,DocumentNo,Createdby, DateOrdered,C_BPartner_ID,GrandTotal` +
            `&$orderby=DocumentNo desc` +
            `&$top=5000`
        );

        return Array.isArray(res.records) ? res.records : [];
    }, [search, startDate, endDate]);
    const [receiptOpen, setReceiptOpen] = useState(false);
    const [receiptData, setReceiptData] = useState(null);
    const [reprintingId, setReprintingId] = useState(null);

    const handlePrintReceipt = async (order) => {
        const orderId = order._orderId ?? order.id ?? order.C_Order_ID;
        setReprintingId(orderId);
        try {
            const data = await fetchReceiptData(orderId);
            setReceiptData(data);
            setReceiptOpen(true);
        } catch (err) {
            console.error("Gagal cetak ulang nota:", err.message);
            alert("Gagal mengambil data nota: " + err.message);
        } finally {
            setReprintingId(null);
        }
    };
    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    useEffect(() => {
        fetchGrandTotal();
    }, [fetchGrandTotal]);

    const handleEdit = (item) => {
        // `item` adalah BARIS TABEL (tableData): DocStatus-nya elemen JSX, dan
        // DocumentNo / DateOrdered / C_BPartner_ID / GrandTotal sudah berupa string
        // terformat. Elemen React tidak bisa di-clone oleh history.pushState
        // (DataCloneError), jadi navigate() gagal diam-diam. Kirim record ASLI
        // dari API (C_BPartner_ID tetap {id, identifier}, dst.).
        const rawOrder = orders.find((o) => (o.id ?? o.C_Order_ID) === item._orderId);
        if (!rawOrder) {
            alert("Data order tidak ditemukan. Silakan refresh daftar lalu coba lagi.");
            return;
        }
        navigate("/pos-order", { state: { editOrder: rawOrder } });
    };

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
                title: 'DAFTAR SALES',
                logoDataUrl: orgInfo?.logoUrl,
                orgName:  orgInfo?.name,     // ← baru
                orgPhone: orgInfo?.phone,    // ← baru
                orgEmail: orgInfo?.email,    // ← baru
                periodLabel: `PERIODE : ${formatDateService(startDate)}  ${formatDateService(endDate)}`,
                columns: [
                    { key: 'no',         label: 'No',          width: 30,     align: 'center' },
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
                filenamePrefix: `DAFTAR-SALES-${startDate}_${endDate}`,
            });
        } catch (err) {
            console.error('Gagal generate PDF daftar:', err.message);
            alert('Gagal membuat PDF daftar.');
        } finally {
            setPrintingList(false);
        }
    };

    const grandTotalFormatted = grandTotalAll === null
        ? "Menghitung..."
        : `${grandTotalAll.toLocaleString("id-ID")}`;

    const columns = [
        { key: "DocumentNo",    label: "No. Dokumen" },
        { key: "DateOrdered",   label: "Tanggal" },
        { key: "C_BPartner_ID", label: "Customer" },
        { key: "GrandTotal",    label: "Grand Total", align: "right" },
        { key: "DocStatus",     label: "Status", align: "center" },
    ];

    const tableData = orders.map((order) => {
        const orderId = order.id ?? order.C_Order_ID;
        const status  = order.DocStatus?.id ?? order.DocStatus ?? "DR";

        return {
            ...order,
            _orderId:    orderId,
            _status:     status,
            DocumentNo:  order.DocumentNo || `#${orderId}`,
            DateOrdered: order.DateOrdered
                ? new Date(order.DateOrdered).toLocaleDateString("id-ID")
                : "-",
            "C_BPartner_ID": order.C_BPartner_ID?.identifier
                || order.C_BPartner_ID?.Name
                || "-",
            GrandTotal: `${parseFloat(order.GrandTotal || 0).toLocaleString("id-ID")}`,
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

    const actionRenderer = (item) => {
        const isEditDisabled = item._status !== "DR";
        const isReprinting   = reprintingId === item._orderId;
        const isPrintDisabled = item._status !== "CO" || isReprinting;
    
        return (
            <div style={{ display: "flex", gap: "6px" }}>
                <button
                    onClick={() => !isEditDisabled ? handleEdit(item) : null}
                    disabled={isEditDisabled}
                    style={{
                        ...styles.editBtn,
                        backgroundColor: !isEditDisabled ? "#f57c00" : "#ccc",
                        cursor:          !isEditDisabled ? "pointer"  : "not-allowed",
                        opacity:         !isEditDisabled ? 1          : 0.6,
                    }}
                    title={isEditDisabled ? `Status ${getStatusLabel(item._status)} tidak dapat diubah` : "Edit Dokumen"}
                >
                    ✏️ Edit
                </button>
    
                <button
                    onClick={() => !isPrintDisabled ? handlePrintReceipt(item) : null}
                    disabled={isPrintDisabled}
                    style={{
                        ...styles.editBtn,
                        backgroundColor: isPrintDisabled ? "#ccc" : "#546e7a",
                        cursor:          isPrintDisabled ? "not-allowed" : "pointer",
                        opacity:         isPrintDisabled ? 0.6 : 1,
                    }}
                    title={item._status !== "CO" ? "Cetak nota hanya untuk order Completed" : "Cetak Ulang Nota"}
                >
                    {isReprinting ? "⏳ ..." : "🧾 Print Nota"}
                </button>
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
                title="📋 Sales Order - POS"
                onSearch={(val) => { setSearch(val); setOffset(0); }}
                extraAction={
                    <div style={styles.headerActions}>
                        <button onClick={handlePrintList} disabled={printingList} style={styles.newBtn}>
                            {printingList ? '⏳ ...' : '🖨️ Print PDF'}
                        </button>
                        <button onClick={() => navigate("/pos-order")} style={styles.newBtn}>
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
                summaryRow={{ columnKey: "GrandTotal", value: grandTotalFormatted, label: "Total Semua" }}
            />
            <ReceiptModal
                isOpen={receiptOpen}
                onClose={() => { setReceiptOpen(false); setReceiptData(null); }}
                receiptData={receiptData}
            />
        </div>
    );
};


export default POSOrderList;