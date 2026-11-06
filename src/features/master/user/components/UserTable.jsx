// src/features/master/user/components/UserTable.jsx
import React from "react";
import styles from "./userStyles";

const UserTable = ({ users, loading, roleNameById, togglingId, loadingEditId, deleting, onEdit, onToggleActive, onDelete }) => {
    if (loading) return <p style={{ color: "#777" }}>Memuat...</p>;
    if (users.length === 0) return <p style={{ color: "#777" }}>Belum ada user aktif.</p>;

    return (
        <div style={{ overflowX: "auto" }}>
            <table className="modern-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Username / Email</th>
                        <th>Role</th>
                        <th style={{ width: "220px" }}>Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map((u) => (
                        <tr key={u.id}>
                            <td>{u.name}</td>
                            <td>{u.email}</td>
                            <td>
                                {u.roleIds.length === 0
                                    ? <span style={{ color: "#999" }}>— tanpa role —</span>
                                    : u.roleIds.map((rid) => (
                                        <span key={rid} style={styles.roleBadge}>{roleNameById.get(rid) || `Role #${rid}`}</span>
                                    ))}
                            </td>
                            <td>
                                <div style={{ display: "flex", gap: "6px" }}>
                                    <button onClick={() => onEdit(u)} disabled={loadingEditId === u.id} style={styles.editBtn}>
                                        {loadingEditId === u.id ? "..." : "✏️ Edit"}
                                    </button>
                                    <button onClick={() => onToggleActive(u)} disabled={togglingId === u.id} style={u.isActive ? styles.deactivateBtn : styles.activateBtn}>
                                        {togglingId === u.id ? "..." : u.isActive ? "Nonaktifkan" : "Aktifkan"}
                                    </button>
                                    <button onClick={() => onDelete(u)} disabled={deleting} style={styles.deleteBtn}>🗑️</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default UserTable;
