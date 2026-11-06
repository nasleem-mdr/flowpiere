// src/features/master/user/components/AccessPicker.jsx
import React, { useMemo } from "react";
import styles from "./roleStyles";

const AccessPicker = ({ title, items, selectedIds, onToggle, loading }) => {
    // Akses yang sudah dimiliki role tapi tidak ada di daftar tampil (mis. window di luar whitelist)
    // tetap tersimpan & tidak diubah; hanya dihitung terpisah.
    const { visibleCount, hiddenCount } = useMemo(() => {
        const visible = new Set(items.map((i) => i.id));
        const v = selectedIds.filter((id) => visible.has(id)).length;
        return { visibleCount: v, hiddenCount: selectedIds.length - v };
    }, [items, selectedIds]);

    return (
        <div style={{ marginTop: "14px" }}>
            <h4 style={{ margin: "0 0 8px", fontSize: "14px" }}>
                {title} <span style={{ fontWeight: "normal", color: "#666", fontSize: "12.5px" }}>({visibleCount} dipilih)</span>
            </h4>
            {loading ? (
                <p style={{ color: "#777", fontSize: "13px" }}>Memuat...</p>
            ) : items.length === 0 ? (
                <p style={{ color: "#777", fontSize: "13px" }}>Tidak ada data aktif.</p>
            ) : (
                <div style={styles.pickerGrid}>
                    {items.map((it) => (
                        <label key={it.id} style={{ ...styles.pickerItem, ...(selectedIds.includes(it.id) ? styles.pickerItemActive : {}) }}>
                            <input type="checkbox" checked={selectedIds.includes(it.id)} onChange={() => onToggle(it.id)} />
                            <span>{it.name}</span>
                        </label>
                    ))}
                </div>
            )}
            {!loading && hiddenCount > 0 && (
                <p style={{ color: "#888", fontSize: "12px", margin: "6px 0 0" }}>
                    +{hiddenCount} akses lain di luar daftar ini tetap dipertahankan.
                </p>
            )}
        </div>
    );
};

export default AccessPicker;