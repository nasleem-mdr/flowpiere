// src/features/master/user/pages/RoleManagement.jsx
import React from "react";
import { PageHeader } from "@/shared/components";
import ConfirmModal from "@/features/master/product/components/ConfirmModal";
import useRoleManagement from "@/features/master/user/hooks/useRoleManagement";
import RoleTable from "@/features/master/user/components/RoleTable";
import RoleFormModal from "@/features/master/user/components/RoleFormModal";
import styles from "@/features/master/user/components/roleStyles";
import {AddIcon} from "@/shared/components/icon"
import "@/App.css";

const NOTICE_COLORS = {
    success: { background: "#e8f5e9", borderColor: "#a5d6a7", icon: "✅" },
    warn:    { background: "#fff8e1", borderColor: "#ffe082", icon: "⚠️" },
    error:   { background: "#ffebee", borderColor: "#ef9a9a", icon: "❌" },
};

const RoleManagement = () => {
    const rm = useRoleManagement();
    const notice = rm.notice && NOTICE_COLORS[rm.notice.type];

    return (
        <div className="card-container">
            {/* Header + menu New */}
            <div style={styles.headerRow}>
                <PageHeader title="Manajemen Role " />
                <button type="button" style={styles.newBtn} onClick={rm.openCreate}><AddIcon /> New </button>
            </div>

            {rm.notice && (
                <div style={{ ...styles.noticeBox, background: notice.background, borderColor: notice.borderColor }}>
                    <span>{notice.icon} {rm.notice.text}</span>
                    <button type="button" style={styles.noticeClose} onClick={rm.dismissNotice} aria-label="Tutup">×</button>
                </div>
            )}

            {/* Daftar role (tampilan awal) */}
            <div className="detail-section">
                <h3>Daftar Role Aktif ({rm.roles.length})</h3>
                <RoleTable
                    roles={rm.roles}
                    loading={rm.rolesLoading}
                    togglingId={rm.togglingId}
                    loadingEditId={rm.loadingEditId}
                    deleting={rm.deleting}
                    onEdit={rm.openEdit}
                    onToggleActive={rm.toggleActive}
                    onDelete={rm.requestDelete}
                />
            </div>

            {/* Modal Buat Baru / Edit */}
            <RoleFormModal
                modal={rm.modal}
                refs={rm.refs}
                loadingRefs={rm.loadingRefs}
                saving={rm.saving}
                error={rm.formError}
                onChangeForm={rm.setModalForm}
                onToggle={rm.toggleAccess}
                onSave={rm.saveModal}
                onClose={rm.closeModal}
            />

            <ConfirmModal
                isOpen={rm.confirm.isOpen}
                title="Hapus Role"
                message={`Yakin ingin MENGHAPUS role "${rm.confirm.role?.name}"?\n\nRecord akses (org/window/form) ikut terhapus. Kalau role masih dipakai user, server akan menolak — gunakan Nonaktifkan sebagai alternatif.`}
                confirmLabel="Hapus Permanen"
                danger={true}
                onConfirm={rm.confirmDelete}
                onCancel={rm.cancelDelete}
            />
        </div>
    );
};

export default RoleManagement;
