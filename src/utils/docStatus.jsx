import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// docStatus.jsx
// Utilitas bersama untuk DocStatus iDempiere di halaman List / Report:
//   - STATUS_FILTERS       : tab filter untuk <PageHeader filters={...} />
//   - getStatusLabel/Color : label & warna badge
//   - normalizeStatus      : ambil kode status dari record API
//   - buildStatusCondition : potongan $filter OData untuk DocStatus
//   - StatusBadge          : komponen badge siap pakai
//   - EDITABLE / DOWNLOADABLE : aturan aksi per status
// ─────────────────────────────────────────────────────────────────────────────

// ─── Tab filter (PageHeader: filters / activeFilter / onFilterChange) ───────
export const STATUS_FILTERS = [
    { value: "ALL", label: "Semua" },
    { value: "DR",  label: "Draft" },
    { value: "IP",  label: "Diproses" },
    { value: "NA",  label: "Ditolak" },
    { value: "VO",  label: "Void" },
    { value: "RE",  label: "Reversed" },
    { value: "CO",  label: "Selesai" },
];

// ─── Label & warna badge ─────────────────────────────────────────────────────
export const STATUS_LABELS = {
    DR: "Draft",
    IP: "In Progress",
    CO: "Completed",
    CL: "Closed",
    VO: "Voided",
    RE: "Reversed",
    NA: "Ditolak",
};

export const STATUS_COLORS = {
    DR: "#f57c00",
    IP: "#1565c0",
    CO: "#2e7d32",
    CL: "#37474f",
    VO: "#c62828",
    RE: "#c62828",
    NA: "#c62828",
};

const DEFAULT_STATUS_COLOR = "#555";

export const getStatusLabel = (status) => STATUS_LABELS[status] || status;
export const getStatusColor = (status) => STATUS_COLORS[status] || DEFAULT_STATUS_COLOR;

/**
 * Ambil kode status dari field DocStatus record REST API.
 * API bisa mengembalikan object { id: "CO", identifier: "Completed" }
 * atau string langsung. Kalau kosong, pakai fallback (default "DR").
 */
export const normalizeStatus = (docStatus, fallback = "DR") =>
    docStatus?.id ?? docStatus ?? fallback;

/**
 * Potongan $filter untuk DocStatus.
 * Mengembalikan null kalau filter = "ALL" / kosong, supaya mudah dipakai
 * dengan pola array conditions:
 *
 *   const statusCond = buildStatusCondition(statusFilter);
 *   if (statusCond) conditions.push(statusCond);
 */
export const buildStatusCondition = (statusFilter) =>
    statusFilter && statusFilter !== "ALL"
        ? `DocStatus eq '${String(statusFilter).replace(/'/g, "''")}'`
        : null;

// ─── Aturan aksi per status ──────────────────────────────────────────────────
export const EDITABLE_STATUSES = ["DR", "NA"];     // Edit / Revisi
export const DOWNLOADABLE_STATUSES = ["CO"];       // Download PDF

export const isEditable = (status) => EDITABLE_STATUSES.includes(status);
export const isDownloadable = (status) => DOWNLOADABLE_STATUSES.includes(status);

// ─── Badge ───────────────────────────────────────────────────────────────────
const badgeStyle = {
    color: "#fff",
    padding: "3px 10px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: "bold",
    display: "inline-block",
};

/**
 * <StatusBadge status="CO" />
 * Bisa juga langsung dari record: <StatusBadge status={normalizeStatus(rec.DocStatus)} />
 */
export const StatusBadge = ({ status, style }) => (
    <span style={{ ...badgeStyle, backgroundColor: getStatusColor(status), ...style }}>
        {getStatusLabel(status)}
    </span>
);
