import React from 'react';
import '@/css/ConfirmModal.css';

/**
 * SuccessModal
 * ─────────────────────────────────────────────────────────────────────────
 * Modal notifikasi sukses — dipakai setelah operasi simpan/tambah/hapus di
 * halaman Product Detail (dan bisa dipakai ulang di halaman lain) berhasil.
 * Sengaja dibuat terpisah dari ConfirmModal.jsx karena ikonnya beda (✅
 * bukan ⚠️) dan cuma butuh 1 tombol OK — tapi tetap pakai class CSS yang
 * sama (`modal-backdrop`, `modal-card`, dst.) biar tampilannya konsisten
 * tanpa nambah file CSS baru.
 */
const SuccessModal = ({
    isOpen,
    title = 'Berhasil',
    message = 'Data berhasil disimpan.',
    onClose,
    confirmLabel = 'OK',
}) => {
    if (!isOpen) return null;

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-accent-bar" />

                <div className="modal-body">
                    <div className="modal-icon">✅</div>
                    <div className="modal-title">{title}</div>
                    <div className="modal-message">{message}</div>
                </div>

                <div className="modal-divider" />

                <div className="modal-footer">
                    <button className="modal-btn-confirm" onClick={onClose}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SuccessModal;
