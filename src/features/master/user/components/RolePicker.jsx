// src/features/master/user/components/RolePicker.jsx
import React from "react";
import styles from "./userStyles";

const RolePicker = ({ roles, selectedIds, onToggle, loading, required }) => (
    <div style={{ marginTop: "18px" }}>
        <h4 style={{ margin: "0 0 8px" }}>
            Role{required ? " *" : ""} <span style={{ fontWeight: "normal", color: "#666", fontSize: "12.5px" }}>({selectedIds.length} dipilih)</span>
        </h4>
        {loading ? (
            <p style={{ color: "#777" }}>Memuat daftar role...</p>
        ) : (
            <div style={{ ...styles.roleGrid, maxHeight: "180px", overflowY: "auto" }}>
                {roles.map((r) => (
                    <label key={r.id} style={{ ...styles.roleItem, ...(selectedIds.includes(r.id) ? styles.roleItemActive : {}) }}>
                        <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => onToggle(r.id)} />
                        <span>{r.name}</span>
                    </label>
                ))}
            </div>
        )}
    </div>
);

export default RolePicker;
