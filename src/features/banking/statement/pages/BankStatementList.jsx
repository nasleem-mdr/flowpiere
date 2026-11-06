import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { idempiereApi } from "@/api/idempiereApi";
import { renderListPDF } from "@/utils/pdf/renderListPDF";
import { useOrgInfo } from "@/shared/hooks/useOrgInfo";
import { useBankAccounts } from "@/shared/hooks";

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

import { listPageStyles as styles } from "@/utils/listPageStyles";

import "@/App.css";

// ─────────────────────────────────────────────────────────────────────────────
// BankStatementList.jsx  (C_BankStatement)
// Daftar Cash/Bank Statement — konsep sama dengan SalesInvoiceList.jsx:
// filter periode (StatementDate), filter status, search Name, filter Bank
// Account, pagination, total seluruh halaman, dan Print PDF daftar.
//
// Kolom "Statement Difference" = EndingBalance - BeginningBalance, dihitung
// native oleh iDempiere (header di-update tiap baris statement disimpan).
// ─────────────────────────────────────────────────────────────────────────────

// Tanggal lokal (bukan UTC) supaya tidak mundur sehari saat dini hari WIB
const todayLocalISO = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const BankStatementList = () => {
    const todayStr = todayLocalISO();
    const { orgInfo } = useOrgInfo();
    const { bankAccounts } = useBankAccounts();
    const navigate = useNavigate();

    const [statements, setStatements]     = useState([]);
    const [loading, setLoading]           = useState(false);
    const [search, setSearch]             = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [bankAccountId, setBankAccountId] = useState("");
    const [offset, setOffset]             = useState(0);
    const [totalRecords, setTotalRecords] = useState(0);
    const [totalDiffAll, setTotalDiffAll] = useState(null);
    const [startDate, setStartDate]       = useState(todayStr);
    const [endDate, setEndDate]           = useState(todayStr);
    const [printingList, setPrintingList] = useState(false);
    const pageSize = 10;

    const getStatusLabel = (status) => {
        const map = { DR: "Draft", IP: "In Progress", CO: "Completed", CL: "Closed", VO: "Voided", RE: "Reversed", NA: "Ditolak" };
        return map[status] || status;
    };

    // Satu sumber filter dipakai oleh list, total, dan print agar selalu konsisten.
    const buildFilter = useCallback(() => {
        let filterClause =
            ` StatementDate ge ${startDate}T00:00:00Z` +
            ` and StatementDate le ${endDate}T23:59:59Z`;

        if (bankAccountId) {
            filterClause += ` and C_BankAccount_ID eq ${parseInt(bankAccountId)}`;
        }
        if (search) {
            const safe = search.toLowerCase().replace(/'/g, "''");
            filterClause += ` and contains(tolower(Name),'${safe}')`;
        }

        const statusCond = buildStatusCondition(statusFilter);
        if (statusCond) filterClause += ` and ${statusCond}`;

        return filterClause;
    }, [startDate, endDate, bankAccountId, search, statusFilter]);

    const fetchStatements = useCallback(async () => {
        setLoading(true);
        try {
            const res = await idempiereApi(
                `/models/c_bankstatement` +
                `?$filter=${buildFilter()}` +
                `&$select=C_BankStatement_ID,Name,StatementDate,C_BankAccount_ID,` +
                `BeginningBalance,EndingBalance,StatementDifference,DocStatus,Description` +
                `&$orderby=StatementDate desc,C_BankStatement_ID desc` +
                `&$top=${pageSize}` +
                `&$skip=${offset}`
            );

            setStatements(Array.isArray(res.records) ? res.records : []);
            setTotalRecords(res["row-count"] || res.totalRecords || 0);
        } catch (err) {
            console.error("Gagal fetch bank statements:", err.message);
        } finally {
            setLoading(false);
        }
    }, [buildFilter, offset]);

    // Total seluruh halaman — hanya dipicu saat filter berubah, bukan saat ganti halaman.
    const fetchTotalDiff = useCallback(async () => {
        setTotalDiffAll(null);
        try {
            const res = await idempiereApi(
                `/models/c_bankstatement` +
                `?$filter=${buildFilter()}` +
                `&$select=StatementDifference`
            );
            const records = Array.isArray(res.records) ? res.records : [];
            setTotalDiffAll(records.reduce((s, r) => s + parseFloat(r.StatementDifference || 0), 0));
        } catch (err) {
            console.error("Gagal fetch total statement difference:", err.message);
            setTotalDiffAll(0);
        }
    }, [buildFilter]);

    useEffect(() => { fetchStatements(); }, [fetchStatements]);
    useEffect(() => { fetchTotalDiff(); }, [fetchTotalDiff]);

    const fmtRp = (n) => ` ${Math.round(n || 0).toLocaleString("id-ID")}`;

    const totalDiffFormatted = totalDiffAll === null ? "Menghitung..." : fmtRp(totalDiffAll);

    const columns = [
        { key: "Name",                label: "Name" },
        { key: "StatementDate",       label: "Tanggal" },
        { key: "C_BankAccount_ID",    label: "Bank Account" },
        { key: "BeginningBalance",    label: "Beginning", align: "right" },
        { key: "StatementDifference", label: "Difference", align: "right" },
        { key: "EndingBalance",       label: "Ending", align: "right" },
        { key: "DocStatus",           label: "Status", align: "center" },
    ];

    // ── Print PDF daftar ─────────────────────────────────────────────────────
    const numberFormatter = new Intl.NumberFormat("en-US");

    const formatDateService = (dateStr) => {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        if (isNaN(d)) return "-";
        return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    };

    const fetchAllForPrint = useCallback(async () => {
        const res = await idempiereApi(
            `/models/c_bankstatement` +
            `?$filter=${buildFilter()}` +
            `&$select=C_BankStatement_ID,Name,StatementDate,C_BankAccount_ID,` +
            `BeginningBalance,EndingBalance,StatementDifference` +
            `&$orderby=StatementDate desc,C_BankStatement_ID desc` +
            `&$top=5000`
        );
        return Array.isArray(res.records) ? res.records : [];
    }, [buildFilter]);

    const handlePrintList = async () => {
        setPrintingList(true);
        try {
            const all = await fetchAllForPrint();

            if (all.length === 0) {
                alert("Tidak ada data untuk dicetak pada periode ini.");
                return;
            }

            const totalDiff = all.reduce((s, r) => s + parseFloat(r.StatementDifference || 0), 0);

            await renderListPDF({
                title: "DAFTAR BANK STATEMENT",
                orgInfo,
                periodLabel: `PERIODE : ${formatDateService(startDate)}  ${formatDateService(endDate)}`,
                columns: [
                    { key: "no",         label: "No",           width: 30,     align: "center" },
                    { key: "name",       label: "Name",         width: "auto" },
                    { key: "date",       label: "Date",         width: "auto" },
                    { key: "bank",       label: "Bank Account", width: "flex" },
                    { key: "beginning",  label: "Beginning",    width: "auto", align: "right" },
                    { key: "difference", label: "Difference",   width: "auto", align: "right" },
                    { key: "ending",     label: "Ending",       width: "auto", align: "right" },
                ],
                rows: all.map((r, idx) => ({
                    no:         idx + 1,
                    name:       r.Name || `#${r.id ?? r.C_BankStatement_ID}`,
                    date:       formatDateService(r.StatementDate),
                    bank:       r.C_BankAccount_ID?.identifier || "-",
                    beginning:  numberFormatter.format(r.BeginningBalance ?? 0),
                    difference: numberFormatter.format(r.StatementDifference ?? 0),
                    ending:     numberFormatter.format(r.EndingBalance ?? 0),
                })),
                totalLabel: "Total Difference",
                totalValue: numberFormatter.format(totalDiff),
                filenamePrefix: `DAFTAR-BANKSTATEMENT-${startDate}_${endDate}`,
            });
        } catch (err) {
            console.error("Gagal generate PDF daftar:", err.message);
            alert("Gagal membuat PDF daftar.");
        } finally {
            setPrintingList(false);
        }
    };

    // ── Tabel ────────────────────────────────────────────────────────────────
    const tableData = statements.map((stmt) => {
        const stmtId = stmt.id ?? stmt.C_BankStatement_ID;
        const status = normalizeStatus(stmt.DocStatus);

        return {
            ...stmt,
            _raw:         stmt,
            _statementId: stmtId,
            _status:      status,
            Name: stmt.Name || `#${stmtId}`,
            StatementDate: stmt.StatementDate
                ? new Date(stmt.StatementDate).toLocaleDateString("id-ID")
                : "-",
            C_BankAccount_ID:
                stmt.C_BankAccount_ID?.identifier || stmt.C_BankAccount_ID?.Name || "-",
            BeginningBalance:    fmtRp(stmt.BeginningBalance),
            StatementDifference: fmtRp(stmt.StatementDifference),
            EndingBalance:       fmtRp(stmt.EndingBalance),
            DocStatus: <StatusBadge status={status} />,
        };
    });

    // Tombol Complete (DR → CO) lewat WorkflowProgressButton, sama seperti SalesInvoiceList.
    // Edit sengaja tidak ada: BankStatementContainer belum punya mode edit draft.
    const actionRenderer = (item) => (
        <div style={{ display: "flex", gap: "6px" }}>
            <WorkflowProgressButton
                tableName="C_BankStatement"
                recordId={item._statementId}
                docStatus={item._status}
                targetStatus="CO"
                buttonStyle={styles.actionBtn}
            />
        </div>
    );

    const handleStartDateChange = (val) => { setStartDate(val); setOffset(0); };
    const handleEndDateChange   = (val) => { setEndDate(val);   setOffset(0); };
    const handleFilterChange    = (val) => { setStatusFilter(val); setOffset(0); };
    const handleBankChange      = (val) => { setBankAccountId(val); setOffset(0); };

    return (
        <div style={styles.cardContainer}>

            <PageHeader
                title="Cash/Bank Statement"
                filters={STATUS_FILTERS}
                activeFilter={statusFilter}
                onFilterChange={handleFilterChange}
                onSearch={(val) => { setSearch(val); setOffset(0); }}
                extraAction={
                    <div style={styles.headerActions}>
                        <button onClick={handlePrintList} disabled={printingList} style={styles.newBtn}>
                            {printingList ? "⏳ ..." : "🖨️ Print PDF"}
                        </button>
                        <button onClick={() => navigate("/bank-statement")} style={styles.newBtn}>
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
                <div style={styles.dateField}>
                    <label style={styles.dateLabel}>Bank Account</label>
                    <select
                        value={bankAccountId}
                        onChange={(e) => handleBankChange(e.target.value)}
                        style={{ ...styles.dateInput, minWidth: "180px" }}
                    >
                        <option value="">Semua Bank Account</option>
                        {bankAccounts.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
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
                    summaryRow={{ columnKey: "StatementDifference", value: totalDiffFormatted, label: "Total Semua" }}
                />
            </div>
        </div>
    );
};


export default BankStatementList;
