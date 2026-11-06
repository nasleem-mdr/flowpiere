// src/features/master/user/components/UserFormModal.jsx
// Satu modal untuk Buat Baru (mode "create") dan Edit (mode "edit").
// Mode "edit" punya seksi "Ganti Password" sendiri (aksi terpisah dari Simpan Perubahan).
import React from "react";
import UserFormFields from "./UserFormFields";
import RolePicker from "./RolePicker";
import styles from "./userStyles";

const pwBoxStyle = {
    marginTop: "16px", padding: "12px 14px", border: "1px solid #e0e0e0",
    borderRadius: "8px", background: "#fafafa",
};
const pwResultStyle = (type) => ({
    marginTop: "10px", padding: "8px 12px", borderRadius: "6px", fontSize: "13px", whiteSpace: "pre-line",
    background: type === "success" ? "#e8f5e9" : "#ffebee",
    border: `1px solid ${type === "success" ? "#a5d6a7" : "#ef9a9a"}`,
    color: type === "success" ? "#2e7d32" : "#c62828",
});

const UserFormModal = ({
    modal, roles, rolesLoading, saving, error,
    onChangeForm, onToggleRole, onSave, onClose,
    // ── ganti password (hanya mode edit) ──
    pwForm, onChangePwForm, pwSaving, pwResult, onSavePassword,
}) => {
    if (!modal) return null;
    const isCreate = modal.mode === "create";
    const busy = saving || pwSaving;
    const setPw = (patch) => onChangePwForm({ ...pwForm, ...patch });

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ marginTop: 0 }}>
                    {isCreate ? "➕ Buat User Baru" : `✏️ Edit User — ${modal.form.name}`}
                </h3>

                <UserFormFields form={modal.form} onChange={onChangeForm} isCreate={isCreate} />

                {!isCreate && (
                    <div style={pwBoxStyle}>
                        <h4 style={{ margin: "0 0 4px" }}>🔑 Ganti Password</h4>
                        <p style={{ fontSize: "12px", color: "#888", margin: "0 0 10px" }}>
                            Reset password user ini. Berlaku langsung tanpa menekan "Simpan Perubahan".
                        </p>
                        <div style={styles.formGrid}>
                            <div style={styles.field}>
                                <label style={styles.label}>Password Baru *</label>
                                <input
                                    style={styles.input}
                                    type="password"
                                    value={pwForm.password}
                                    onChange={(e) => setPw({ password: e.target.value })}
                                    placeholder="Min. 6 karakter"
                                    autoComplete="new-password"
                                    disabled={busy}
                                />
                            </div>
                            <div style={styles.field}>
                                <label style={styles.label}>Konfirmasi Password Baru *</label>
                                <input
                                    style={styles.input}
                                    type="password"
                                    value={pwForm.confirm}
                                    onChange={(e) => setPw({ confirm: e.target.value })}
                                    autoComplete="new-password"
                                    disabled={busy}
                                />
                            </div>
                        </div>
                        <div style={{ marginTop: "10px" }}>
                            <button
                                type="button"
                                onClick={onSavePassword}
                                disabled={busy || !pwForm.password}
                                style={styles.saveBtn}
                            >
                                {pwSaving ? "⏳ Mengganti..." : "🔑 Ganti Password"}
                            </button>
                        </div>
                        {pwResult && <div style={pwResultStyle(pwResult.type)}>{pwResult.type === "success" ? "✅" : "❌"} {pwResult.text}</div>}
                    </div>
                )}

                <RolePicker roles={roles} selectedIds={modal.selectedRoleIds} onToggle={onToggleRole} loading={rolesLoading} required={isCreate} />

                {error && <div style={styles.errorBox}>❌ <strong>Gagal:</strong> {error}</div>}

                <div style={{ display: "flex", gap: "10px", marginTop: "18px", justifyContent: "flex-end" }}>
                    <button type="button" onClick={onClose} disabled={busy} style={styles.ghostBtn}>Batal</button>
                    <button type="button" onClick={onSave} disabled={busy} style={styles.saveBtn}>
                        {saving ? "⏳ Menyimpan..." : isCreate ? "💾 Buat User + Assignment Role" : "💾 Simpan Perubahan"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UserFormModal;