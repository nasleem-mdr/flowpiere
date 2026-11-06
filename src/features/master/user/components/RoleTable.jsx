// src/features/master/user/components/RoleTable.jsx
import React from "react";
import { USER_LEVEL_OPTIONS } from "../hooks/roleConstants";
import styles from "./roleStyles";

const RoleTable = ({ roles, loading, togglingId, loadingEditId, deleting, onEdit, onToggleActive, onDelete }) => {
    if (loading) return <p style={{ color: "#777" }}>Memuat...</p>;
    if (roles.length === 0) return <p style={{ color: "#777" }}>Belum ada role aktif.</p>;

    return (
        <div style={{ overflowX: "auto" }}>
            <table className="modern-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th style={{ width: "110px" }}>User Level</th>
                        <th style={{ textAlign: "center" }}>Org</th>
                        <th style={{ textAlign: "center" }}>Window</th>
                        <th style={{ textAlign: "center" }}>Form</th>
                        <th style={{ width: "210px" }}>Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    {roles.map((r) => (
                        <tr key={r.id}>
                            <td>{r.name}</td>
                            <td><span style={styles.lvlBadge}>{USER_LEVEL_OPTIONS.find((o) => o.value === r.userLevel)?.label || r.userLevel}</span></td>
                            <td style={{ textAlign: "center" }}>{r.nOrg}</td>
                            <td style={{ textAlign: "center" }}>{r.nWindow}</td>
                            <td style={{ textAlign: "center" }}>{r.nForm}</td>
                            <td>
                                <div style={{ display: "flex", gap: "6px" }}>
                                    <button onClick={() => onEdit(r)} disabled={loadingEditId === r.id} style={styles.editBtn}>
                                        {loadingEditId === r.id ? "..." : "✏️ Edit"}
                                    </button>
                                    <button onClick={() => onToggleActive(r)} disabled={togglingId === r.id} style={r.isActive ? styles.deactivateBtn : styles.activateBtn}>
                                        {togglingId === r.id ? "..." : r.isActive ? "Nonaktifkan" : "Aktifkan"}
                                    </button>
                                    <button onClick={() => onDelete(r)} disabled={deleting} style={styles.deleteBtn}>🗑️</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default RoleTable;
