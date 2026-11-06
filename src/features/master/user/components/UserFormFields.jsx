// src/features/master/user/components/UserFormFields.jsx
// Password & konfirmasi hanya tampil saat mode "create".
import React from "react";
import styles from "./userStyles";

const UserFormFields = ({ form, onChange, isCreate }) => {
    const set = (patch) => onChange({ ...form, ...patch });
    return (
        <div style={styles.formGrid}>
            <div style={styles.field}>
                <label style={styles.label}>Name *</label>
                <input style={styles.input} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Nama lengkap user" />
            </div>
            <div style={styles.field}>
                <label style={styles.label}>Username / Email *</label>
                <input style={styles.input} value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="Dipakai untuk login iDempiere" />
            </div>
            {isCreate && (
                <>
                    <div style={styles.field}>
                        <label style={styles.label}>Password *</label>
                        <input style={styles.input} type="password" value={form.password} onChange={(e) => set({ password: e.target.value })} placeholder="Min. 6 karakter" autoComplete="new-password" />
                    </div>
                    <div style={styles.field}>
                        <label style={styles.label}>Konfirmasi Password *</label>
                        <input style={styles.input} type="password" value={form.confirm} onChange={(e) => set({ confirm: e.target.value })} autoComplete="new-password" />
                    </div>
                </>
            )}
            <div style={{ ...styles.field, gridColumn: "1 / -1" }}>
                <label style={styles.label}>Description</label>
                <input style={styles.input} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Opsional — jabatan / keterangan" />
            </div>
            <div style={styles.field}>
                <label style={{ ...styles.label, display: "flex", alignItems: "center", gap: "8px" }}>
                    <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
                    User Aktif
                </label>
            </div>
        </div>
    );
};

export default UserFormFields;
