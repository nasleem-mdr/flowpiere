// src/features/master/user/components/UserForm.jsx
import React from "react";
import styles from "./userManagement.styles";

/** Presentational: form tambah user + pilihan role. Tanpa logika data. */
const UserForm = ({
    form,
    onFieldChange,
    roles,
    rolesLoading,
    selectedRoleIds,
    onToggleRole,
    saving,
    onSubmit,
}) => (
    <form onSubmit={onSubmit}>
        <div style={styles.formGrid}>
            <div style={styles.field}>
                <label style={styles.label}>Name *</label>
                <input
                    style={styles.input}
                    value={form.name}
                    onChange={(e) => onFieldChange("name", e.target.value)}
                    placeholder="Nama lengkap user"
                />
            </div>
            <div style={styles.field}>
                <label style={styles.label}>Username / Email *</label>
                <input
                    style={styles.input}
                    value={form.email}
                    onChange={(e) => onFieldChange("email", e.target.value)}
                    placeholder="Dipakai untuk login iDempiere"
                />
            </div>
            <div style={styles.field}>
                <label style={styles.label}>Password *</label>
                <input
                    style={styles.input}
                    type="password"
                    value={form.password}
                    onChange={(e) => onFieldChange("password", e.target.value)}
                    placeholder="Min. 6 karakter"
                />
            </div>
            <div style={styles.field}>
                <label style={styles.label}>Konfirmasi Password *</label>
                <input
                    style={styles.input}
                    type="password"
                    value={form.confirm}
                    onChange={(e) => onFieldChange("confirm", e.target.value)}
                />
            </div>
            <div style={{ ...styles.field, gridColumn: "1 / -1" }}>
                <label style={styles.label}>Description</label>
                <input
                    style={styles.input}
                    value={form.description}
                    onChange={(e) => onFieldChange("description", e.target.value)}
                    placeholder="Opsional — jabatan / keterangan"
                />
            </div>
            <div style={styles.field}>
                <label style={{ ...styles.label, display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) => onFieldChange("isActive", e.target.checked)}
                    />
                    User Aktif
                </label>
            </div>
        </div>

        <h4 style={{ margin: "18px 0 8px" }}>Role * ({selectedRoleIds.length} dipilih)</h4>
        {rolesLoading ? (
            <p style={{ color: "#777" }}>Memuat daftar role...</p>
        ) : roles.length === 0 ? (
            <p style={{ color: "#777" }}>Tidak ada role aktif di iDempiere.</p>
        ) : (
            <div style={styles.roleGrid}>
                {roles.map((r) => (
                    <label
                        key={r.id}
                        style={{
                            ...styles.roleItem,
                            ...(selectedRoleIds.includes(r.id) ? styles.roleItemActive : {}),
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={selectedRoleIds.includes(r.id)}
                            onChange={() => onToggleRole(r.id)}
                        />
                        <span>{r.name}</span>
                    </label>
                ))}
            </div>
        )}

        <button type="submit" disabled={saving} style={{ ...styles.saveBtn, marginTop: "18px" }}>
            {saving ? "⏳ Menyimpan..." : "💾 Buat User + Assignment Role"}
        </button>
    </form>
);

export default UserForm;
