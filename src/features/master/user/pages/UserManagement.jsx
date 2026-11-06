// src/features/master/user/pages/UserManagement.jsx
import React from "react";
import { PageHeader } from "@/shared/components";
import ConfirmModal from "@/features/master/product/components/ConfirmModal";
import useUserManagement from "@/features/master/user/hooks/useUserManagement";
import UserTable from "@/features/master/user/components/UserTable";
import UserFormModal from "@/features/master/user/components/UserFormModal";
import styles from "@/features/master/user/components/userStyles";
import {AddIcon} from "@/shared/components/icon"
import "@/App.css";

const NOTICE_COLORS = {
    success: { background: "#e8f5e9", borderColor: "#a5d6a7", icon: "✅" },
    warn:    { background: "#fff8e1", borderColor: "#ffe082", icon: "⚠️" },
    error:   { background: "#ffebee", borderColor: "#ef9a9a", icon: "❌" },
};

const UserManagement = () => {
    const um = useUserManagement();
    const notice = um.notice && NOTICE_COLORS[um.notice.type];

    return (
        <div className="card-container">
            {/* Header + menu New */}
            <div style={styles.headerRow}>
                <PageHeader title="Manajemen User" onSearch={um.setSearch} />
                <button type="button" style={styles.newBtn} onClick={um.openCreate}><AddIcon /> New </button>
            </div>

            {um.notice && (
                <div style={{ ...styles.noticeBox, background: notice.background, borderColor: notice.borderColor }}>
                    <span>{notice.icon} {um.notice.text}</span>
                    <button type="button" style={styles.noticeClose} onClick={um.dismissNotice} aria-label="Tutup">×</button>
                </div>
            )}

            {/* Daftar user (tampilan awal) */}
            <div className="detail-section">
                <h3>Daftar User ({um.search ? `${um.filteredUsers.length} dari ${um.users.length}` : um.users.length})</h3>
                <UserTable
                    users={um.filteredUsers}
                    loading={um.usersLoading}
                    roleNameById={um.roleNameById}
                    togglingId={um.togglingId}
                    loadingEditId={um.loadingEditId}
                    deleting={um.deleting}
                    onEdit={um.openEdit}
                    onToggleActive={um.toggleActive}
                    onDelete={um.requestDelete}
                />
            </div>

            {/* Modal Buat Baru / Edit */}
            <UserFormModal
                modal={um.modal}
                roles={um.roles}
                rolesLoading={um.rolesLoading}
                saving={um.saving}
                error={um.formError}
                onChangeForm={um.setModalForm}
                onToggleRole={um.toggleRole}
                onSave={um.saveModal}
                onClose={um.closeModal}
                pwForm={um.pwForm}
                onChangePwForm={um.setPwForm}
                pwSaving={um.pwSaving}
                pwResult={um.pwResult}
                onSavePassword={um.savePassword}
            />

            <ConfirmModal
                isOpen={um.confirm.isOpen}
                title="Hapus User"
                message={`Yakin ingin MENGHAPUS user "${um.confirm.user?.name}"?\n\nIni tidak bisa dibatalkan. Kalau user sudah punya riwayat transaksi, server akan menolak — gunakan Nonaktifkan sebagai alternatif.`}
                confirmLabel="Hapus Permanen"
                danger={true}
                onConfirm={um.confirmDelete}
                onCancel={um.cancelDelete}
            />
        </div>
    );
};

export default UserManagement;