// src/features/finance/bank-transfer/pages/BankTransferList.jsx
// Daftar Bank/Cash Transfer (C_BankTransfer): filter periode & status, buat/edit draft,
// Complete, dan Void. Pola sama dengan SalesInvoiceList / PurchasingList.
import React, { useState, useEffect, useCallback } from "react";
import { PageHeader, DataTable } from "@/shared/components/setup";
import { StatusBadge, getStatusLabel } from "@/utils/docStatus";
import BankTransferModal from "../components/BankTransferModal";
import {
    fetchTransfers, runDocAction, getVoidBlocker,
    fmtAmt, fmtDate, todayIso, readError,
} from "../utils/bankTransferApi";
import "@/App.css";

const STATUS_FILTERS = [
    { value: "ALL", label: "Semua" },
    { value: "DR",  label: "Draft" },
    { value: "CO",  label: "Selesai" },
    { value: "VO",  label: "Void" },
];

const firstOfMonthIso = () => `${todayIso().slice(0, 8)}01`;

const BankTransferList = () => {
    const pageSize = 10;
    const [rows, setRows]                 = useState([]);
    const [totalRecords, setTotalRecords] = useState(0);
    const [loading, setLoading]           = useState(false);
    const [offset, setOffset]             = useState(0);
    const [search, setSearch]             = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [startDate, setStartDate]       = useState(firstOfMonthIso());
    const [endDate, setEndDate]           = useState(todayIso());
    const [busyId, setBusyId]             = useState(null);
    const [modalOpen, setModalOpen]       = useState(false);
    const [editRecord, setEditRecord]     = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { rows: data, total } = await fetchTransfers({
                search, startDate, endDate, status: statusFilter, offset, pageSize,
            });
            setRows(data);
            setTotalRecords(total);
        } catch (err) {
            console.error("Gagal fetch bank transfer:", err.message);
            alert("Gagal memuat daftar transfer: " + readError(err));
        } finally {
            setLoading(false);
        }
    }, [search, startDate, endDate, statusFilter, offset]);

    useEffect(() => { load(); }, [load]);

    // ─── aksi ────────────────────────────────────────────────────────────────
    const openNew = () => { setEditRecord(null); setModalOpen(true); };
    const openEdit = (row) => { setEditRecord(row); setModalOpen(true); };

    const handleComplete = async (row) => {
        if (!window.confirm(`Complete transfer ${row.documentNo}?\nSistem akan membuat 2 payment (keluar & masuk).`)) return;
        setBusyId(row.id);
        try {
            await runDocAction(row.id, "CO");
            await load();
        } catch (err) {
            alert("Gagal Complete: " + readError(err));
        } finally {
            setBusyId(null);
        }
    };

    const handleVoid = async (row) => {
        setBusyId(row.id);
        try {
            // Transfer yang sudah Completed: blokir bila payment-nya sudah direkonsiliasi
            if (row.status === "CO") {
                const blocker = await getVoidBlocker(row.id);
                if (blocker) { alert(blocker); return; }
            }
            if (!window.confirm(`Void transfer ${row.documentNo}?`)) return;
            await runDocAction(row.id, "VO");
            await load();
        } catch (err) {
            alert("Gagal Void: " + readError(err));
        } finally {
            setBusyId(null);
        }
    };

    // ─── tabel ───────────────────────────────────────────────────────────────
    const columns = [
        { key: "DocumentNo", label: "No. Dokumen" },
        { key: "PayDate",    label: "Tanggal" },
        { key: "From",       label: "Dari Rekening" },
        { key: "To",         label: "Ke Rekening" },
        { key: "FromAmt",    label: "Jumlah", align: "right" },
        { key: "ToAmt",      label: "Diterima", align: "right" },
        { key: "Status",     label: "Status", align: "center" },
    ];

    const tableData = rows.map((r) => ({
        id: r.id,
        _row: r,
        DocumentNo: r.documentNo || `#${r.id}`,
        PayDate:    fmtDate(r.payDate),
        From:       r.fromAccount || "-",
        To:         r.toAccount || "-",
        FromAmt:    `${fmtAmt(r.fromAmt)} ${r.fromCurrency}`.trim(),
        ToAmt:      `${fmtAmt(r.toAmt)} ${r.toCurrency}`.trim(),
        Status:     <StatusBadge status={r.status} />,
    }));

    const actionRenderer = (item) => {
        const row = item._row;
        const busy = busyId === row.id;
        const canEdit = row.status === "DR";
        const canComplete = row.status === "DR";
        const canVoid = row.status === "DR" || row.status === "CO";

        const btn = (enabled, color) => ({
            ...styles.actionBtn,
            backgroundColor: enabled && !busy ? color : "#ccc",
            cursor: enabled && !busy ? "pointer" : "not-allowed",
            opacity: enabled && !busy ? 1 : 0.6,
        });

        return (
            <div style={{ display: "flex", gap: "6px" }}>
                <button
                    onClick={() => canEdit && !busy && openEdit(row)}
                    disabled={!canEdit || busy}
                    style={btn(canEdit, "#f57c00")}
                    title={canEdit ? "Edit Draft" : `Status ${getStatusLabel(row.status)} tidak dapat diubah`}
                >
                    ✏️ Edit
                </button>
                <button
                    onClick={() => canComplete && !busy && handleComplete(row)}
                    disabled={!canComplete || busy}
                    style={btn(canComplete, "#2e7d32")}
                    title={canComplete ? "Complete" : "Hanya untuk dokumen Draft"}
                >
                    {busy ? "⏳ ..." : "✅ Complete"}
                </button>
                <button
                    onClick={() => canVoid && !busy && handleVoid(row)}
                    disabled={!canVoid || busy}
                    style={btn(canVoid, "#c62828")}
                    title={canVoid ? "Void" : "Dokumen sudah Void"}
                >
                    🚫 Void
                </button>
            </div>
        );
    };

    return (
        <div className="card-container">
            <PageHeader
                title="🏦 Bank/Cash Transfer"
                filters={STATUS_FILTERS}
                activeFilter={statusFilter}
                onFilterChange={(v) => { setStatusFilter(v); setOffset(0); }}
                onSearch={(val) => { setSearch(val); setOffset(0); }}
                extraAction={
                    <button onClick={openNew} style={styles.newBtn}>+ New</button>
                }
            />

            <div style={styles.dateFilterRow}>
                <div style={styles.dateField}>
                    <label style={styles.dateLabel}>Date from</label>
                    <input type="date" value={startDate} max={endDate}
                        onChange={(e) => { setStartDate(e.target.value); setOffset(0); }} style={styles.dateInput} />
                </div>
                <div style={styles.dateField}>
                    <label style={styles.dateLabel}>Date To</label>
                    <input type="date" value={endDate} min={startDate}
                        onChange={(e) => { setEndDate(e.target.value); setOffset(0); }} style={styles.dateInput} />
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
            />

            <BankTransferModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSaved={load}
                editRecord={editRecord}
            />
        </div>
    );
};

const styles = {
    newBtn:        { backgroundColor: "#1976d2", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" },
    actionBtn:     { color: "#fff", border: "none", padding: "6px 12px", borderRadius: "6px", fontWeight: "bold", fontSize: "12px", transition: "all 0.2s ease" },
    dateFilterRow: { display: "flex", gap: "16px", flexWrap: "wrap", margin: "12px 0 16px" },
    dateField:     { display: "flex", flexDirection: "column", gap: "4px" },
    dateLabel:     { fontSize: "12px", fontWeight: "600", color: "#555" },
    dateInput:     { padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px" },
};

export default BankTransferList;
