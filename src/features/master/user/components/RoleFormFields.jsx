// src/features/master/user/components/RoleFormFields.jsx
import React from "react";
import { USER_LEVEL_OPTIONS } from "../hooks/roleConstants";
import { WINDOW_ACCESS_MAP } from "@/config/windowAccessMap";
import FieldRestrictionEditor from "./FieldRestrictionEditor";
import styles from "./roleStyles";

// key window untuk editor pembatasan field = semua key di windowAccessMap.
const WINDOW_KEYS = Object.keys(WINDOW_ACCESS_MAP);

const RoleFormFields = ({ form, onChange, windowKeys = WINDOW_KEYS }) => {
    const set = (patch) => onChange({ ...form, ...patch });
    return (
        <div style={styles.formGrid}>
            <div style={styles.field}>
                <label style={styles.label}>Name *</label>
                <input style={styles.input} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Contoh: Kasir POS, Supervisor Gudang" />
            </div>
            <div style={styles.field}>
                <label style={styles.label}>User Level *</label>
                <select style={styles.input} value={form.userLevel} onChange={(e) => set({ userLevel: e.target.value })}>
                    {USER_LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </div>
            
            <div style={{ ...styles.field, gridColumn: "1 / -1" }}>
                <label style={styles.label}>Description</label>
                <input style={styles.input} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Opsional — deskripsi tugas role" />
            </div>
            <div style={{...styles.field, gridColumn: "1 / -1"}}>
                <label style={styles.label}>Dashboard Widgets</label>
                <input
                    style={styles.input}
                    rows={3}
                    value={form.dashboardWidgets ?? ""}
                    onChange={(e) => set({ dashboardWidgets: e.target.value })}
                    placeholder="mis. sales_summary,stock_alert"
                />
            </div>
            <div style={styles.checkRow}>
                <label style={styles.checkItem}>
                    <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Role Aktif
                </label>
                <label style={styles.checkItem}>
                    <input type="checkbox" checked={form.isCanReport} onChange={(e) => set({ isCanReport: e.target.checked })} /> Can Report
                </label>
                <label style={styles.checkItem}>
                    <input type="checkbox" checked={form.isCanExport} onChange={(e) => set({ isCanExport: e.target.checked })} /> Can Export
                </label>
                <label style={styles.checkItem} title="Tampilkan info akunting">
                    <input type="checkbox" checked={form.isShowAcct} onChange={(e) => set({ isShowAcct: e.target.checked })} /> Show Accounting
                </label>
            </div>
            <div style={{ ...styles.field, gridColumn: "1 / -1" }}>
                <label style={styles.label}>Pembatasan Field (tidak bisa edit / disembunyikan)</label>
                <FieldRestrictionEditor
                    value={form.restrictedFields}
                    onChange={(v) => set({ restrictedFields: v })}
                    windowKeys={windowKeys}
                />
            </div>
        </div>
    );
};

export default RoleFormFields;