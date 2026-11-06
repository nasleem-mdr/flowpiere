// src/features/master/user/components/FieldRestrictionEditor.jsx
import React, { useState } from "react";
import { parseRestrictedRows, serializeRestrictedRows } from "@/config/fieldRestriction";
import styles from "./roleStyles";

const MODES = [
    { value: "readonly", label: "Read-only (tidak bisa edit)" },
    { value: "hidden", label: "Sembunyikan" },
];

/**
 * Editor baris untuk kolom RestrictedFields AD_Role.
 * value/onChange berupa STRING (format ada di config/fieldRestriction.js).
 * Baris disimpan di state lokal supaya baris yang belum lengkap tidak hilang
 * saat mengetik; hanya baris lengkap yang ikut diserialisasi.
 *
 * Mount ulang tiap modal dibuka (state awal diambil dari `value`).
 * windowKeys: saran untuk kolom Window (diisi dari key WINDOW_ACCESS_MAP oleh RoleFormFields).
 */
const FieldRestrictionEditor = ({ value, onChange, windowKeys = [] }) => {
    const [rows, setRows] = useState(() => parseRestrictedRows(value));

    const commit = (next) => {
        setRows(next);
        onChange(serializeRestrictedRows(next));
    };
    const update = (i, patch) => commit(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    const remove = (i) => commit(rows.filter((_, idx) => idx !== i));
    const add = () => setRows([...rows, { windowKey: "", field: "", mode: "readonly" }]);

    const preview = serializeRestrictedRows(rows);

    // Key yang diketik tapi tidak ada di windowAccessMap (dan bukan "*") tidak akan
    // pernah cocok di aplikasi — beri tanda supaya salah ketik cepat ketahuan.
    const knownKeys = new Set(windowKeys.map((k) => k.toLowerCase()));
    const isUnknownKey = (k) => {
        const t = k.trim().toLowerCase();
        return windowKeys.length > 0 && t !== "" && t !== "*" && !knownKeys.has(t);
    };

    return (
        <div>
            <datalist id="rfe-window-keys">
                <option value="*" />
                {windowKeys.map((k) => <option key={k} value={k} />)}
            </datalist>

            {rows.length === 0 && (
                <p style={{ color: "#777", fontSize: "12.5px", margin: "0 0 8px" }}>
                    Belum ada pembatasan — role ini boleh mengubah semua field.
                </p>
            )}

            {rows.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                    <input
                        style={{
                            ...styles.input,
                            flex: "1 1 120px",
                            ...(isUnknownKey(r.windowKey) ? { borderColor: "#f57c00", background: "#fff8e1" } : {}),
                        }}
                        title={isUnknownKey(r.windowKey) ? "Key ini tidak ada di windowAccessMap — pembatasan tidak akan cocok" : undefined}
                        list="rfe-window-keys"
                        value={r.windowKey}
                        onChange={(e) => update(i, { windowKey: e.target.value })}
                        placeholder="Window (mis. pos, atau *)"
                    />
                    <input
                        style={{ ...styles.input, flex: "1 1 140px" }}
                        value={r.field}
                        onChange={(e) => update(i, { field: e.target.value })}
                        placeholder="Field (mis. PriceEntered)"
                    />
                    <select
                        style={{ ...styles.input, flex: "1 1 170px" }}
                        value={r.mode}
                        onChange={(e) => update(i, { mode: e.target.value })}
                    >
                        {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <button
                        type="button"
                        onClick={() => remove(i)}
                        title="Hapus baris"
                        style={{ background: "#fff", color: "#c62828", border: "1px solid #c62828", borderRadius: "6px", padding: "0 10px", cursor: "pointer" }}
                    >✕</button>
                </div>
            ))}

            <button
                type="button"
                onClick={add}
                style={{ background: "#fff", color: "#1565c0", border: "1px dashed #1565c0", borderRadius: "6px", padding: "6px 12px", cursor: "pointer", fontSize: "12.5px" }}
            >+ Tambah pembatasan</button>

            <div style={{ marginTop: "8px", fontSize: "11.5px", color: "#777" }}>
                Baris yang belum lengkap diabaikan. Tersimpan sebagai:{" "}
                <code>{preview || "(kosong)"}</code>
            </div>
        </div>
    );
};

export default FieldRestrictionEditor;