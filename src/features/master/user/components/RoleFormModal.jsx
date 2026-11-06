// src/features/master/user/components/RoleFormModal.jsx
import React from "react";
import RoleFormFields from "./RoleFormFields";
import AccessPicker from "./AccessPicker";
import styles from "./roleStyles";

const RoleFormModal = ({ modal, refs, loadingRefs, saving, error, onChangeForm, onToggle, onSave, onClose }) => {
    if (!modal) return null;
    const isCreate = modal.mode === "create";

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header (Fixed) */}
                <h3 style={{ marginTop: 0, marginBottom: "16px" }}>
                    {isCreate ? "➕ Buat Role Baru" : `✏️ Edit Role — ${modal.form.name}`}
                </h3>

                {/* Body / Content Area (Scrollable) */}
                <div style={styles.modalBody}>
                    <RoleFormFields form={modal.form} onChange={onChangeForm} />
                    <AccessPicker title="🏬 Org Access" items={refs.org} selectedIds={modal.selected.org} onToggle={onToggle("org")} loading={loadingRefs.org} />
                    <AccessPicker title="🪟 Window Access" items={refs.window} selectedIds={modal.selected.window} onToggle={onToggle("window")} loading={loadingRefs.window} />
                    <AccessPicker title="📋 Form Access" items={refs.form} selectedIds={modal.selected.form} onToggle={onToggle("form")} loading={loadingRefs.form} />

                    {error && <div style={styles.errorBox}>❌ <strong>Gagal:</strong> {error}</div>}
                </div>

                {/* Footer (Fixed) */}
                <div style={styles.modalFooter}>
                    <button type="button" onClick={onClose} disabled={saving} style={styles.ghostBtn}>Batal</button>
                    <button type="button" onClick={onSave} disabled={saving} style={styles.saveBtn}>
                        {saving ? "⏳ Menyimpan..." : isCreate ? "💾 Buat Role + Semua Akses" : "💾 Simpan Perubahan"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RoleFormModal;