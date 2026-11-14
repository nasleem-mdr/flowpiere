// src/features/master/user/components/UserFormModal.jsx
// Satu modal untuk Buat Baru (mode "create") dan Edit (mode "edit").
// Mode "edit" punya seksi "Ganti Password" sendiri (aksi terpisah dari Simpan Perubahan).
import React, { useRef } from "react";
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
    modal, roles, rolesLoading, saving, error, supervisorOptions,
    onChangeForm, onToggleRole, onSave, onClose,
    pwForm, onChangePwForm, pwSaving, pwResult, onSavePassword,
    avatar,
}) => {
    const fileRef = useRef(null);
    if (!modal) return null;
    const isCreate = modal.mode === "create";
    const isProfile = modal.mode === "profile";
    const busy = saving || pwSaving || !!avatar?.saving;
    const noId = isProfile && !modal.id;
    const setPw = (patch) => onChangePwForm({ ...pwForm, ...patch });

    return (
        <div style={styles.overlay} onClick={onClose}>
        <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>
                {isProfile ? "👤 Profil Saya"
                    : isCreate ? "➕ Buat User Baru" : `✏️ Edit User — ${modal.form.name}`}
            </h3>

            {isProfile && avatar && (
            <div style={pwBoxStyle}>
                <h4 style={{ margin: "0 0 12px" }}>🖼️ Foto Profil</h4>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                    {/* Avatar bisa diklik */}
                    <div
                        onClick={() => !busy && fileRef.current?.click()}
                        title="Klik untuk memilih foto"
                        style={{
                            position: "relative", width: 96, height: 96, borderRadius: "50%", overflow: "hidden",
                            background: "#eee", cursor: busy ? "default" : "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                    >
                        {(avatar.preview || avatar.currentUrl)
                            ? <img src={avatar.preview || avatar.currentUrl} alt="avatar"
                                style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <span style={{ fontSize: 36 }}>👤</span>}
                        <div style={{
                            position: "absolute", bottom: 0, left: 0, right: 0, padding: "3px 0",
                            background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 11, textAlign: "center",
                        }}>📷 Ubah</div>
                    </div>

                    {/* Input native disembunyikan */}
                    <input
                        ref={fileRef} type="file" accept="image/*" hidden
                        onChange={(e) => { avatar.onPick(e.target.files?.[0]); e.target.value = ""; }}
                    />

                    {!avatar.file ? (
                        <>
                            <button type="button" style={styles.ghostBtn} disabled={busy}
                                    onClick={() => fileRef.current?.click()}>
                                📷 Pilih Foto
                            </button>
                            <div style={{ fontSize: 12, color: "#888" }}>PNG/JPG, maks. 5 MB</div>
                        </>
                    ) : (
                        <>
                            <div style={{ fontSize: 12, color: "#555" }}>
                                Foto baru dipilih (<em>{avatar.file.name}</em>). <strong>Belum tersimpan.</strong>
                            </div>
                            <div style={{ display: "flex", gap: "8px" }}>
                                <button type="button" style={styles.ghostBtn} disabled={busy} onClick={avatar.onCancel}>
                                    Batal
                                </button>
                                <button type="button" style={styles.saveBtn} disabled={busy || noId} onClick={avatar.onSave}>
                                    {avatar.saving ? "⏳ Mengunggah..." : "💾 Simpan Foto"}
                                </button>
                            </div>
                        </>
                    )}
                </div>
                {avatar.result && (
                    <div style={pwResultStyle(avatar.result.type)}>
                        {avatar.result.type === "success" ? "✅" : "❌"} {avatar.result.text}
                    </div>
                )}
            </div>
        )}

            {!isProfile && (
                <UserFormFields
                    form={modal.form} onChange={onChangeForm} isCreate={isCreate}
                    supervisorOptions={supervisorOptions} disabled={saving}
                />
            )}

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
                                disabled={busy || noId || !pwForm.password}
                                style={styles.saveBtn}
                            >
                                {pwSaving ? "⏳ Mengganti..." : "🔑 Ganti Password"}
                            </button>
                        </div>
                        {pwResult && <div style={pwResultStyle(pwResult.type)}>{pwResult.type === "success" ? "✅" : "❌"} {pwResult.text}</div>}
                    </div>
                )}
                {!isProfile && (
                    <RolePicker roles={roles} selectedIds={modal.selectedRoleIds}
                                onToggle={onToggleRole} loading={rolesLoading} required={isCreate} />
                )}

                {error && <div style={styles.errorBox}>❌ <strong>Gagal:</strong> {error}</div>}

                <div style={{ display: "flex", gap: "10px", marginTop: "18px", justifyContent: "flex-end" }}>
                    <button type="button" onClick={onClose} disabled={busy} style={styles.ghostBtn}>
                        {isProfile ? "Tutup" : "Batal"}
                    </button>
                    {!isProfile && (
                        <button type="button" onClick={onSave} disabled={busy} style={styles.saveBtn}>
                            {saving ? "⏳ Menyimpan..." : isCreate ? "💾 Buat User + Assignment Role" : "💾 Simpan Perubahan"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UserFormModal;