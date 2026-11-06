// src/features/master/product/components/ConfirmModal.jsx
import React, { useEffect } from 'react';

/**
 * ConfirmModal
 * ─────────────────────────────────────────────────────────────────────────
 * Modal konfirmasi OK/Cancel generik — pengganti `window.confirm()` bawaan
 * browser (yang tidak bisa di-styling dan blocking terhadap seluruh tab).
 * Ditaruh di folder yang sama dengan SuccessModal supaya bisa dipakai ulang
 * di halaman master data lain (bukan cuma BusinessPartnerDetail).
 *
 * Props:
 *   isOpen       - boolean, tampil/tidaknya modal
 *   title        - judul modal (opsional, default "Konfirmasi")
 *   message      - isi pesan konfirmasi (string atau node)
 *   confirmLabel - label tombol OK (default "OK")
 *   cancelLabel  - label tombol Cancel (default "Batal")
 *   danger       - boolean, kalau true tombol OK dikasih warna merah
 *                  (dipakai untuk aksi destruktif seperti delete)
 *   onConfirm    - callback saat tombol OK diklik
 *   onCancel     - callback saat tombol Cancel / klik backdrop / tombol X diklik
 */
export default function ConfirmModal({
    isOpen,
    title = 'Konfirmasi',
    message,
    confirmLabel = 'OK',
    cancelLabel = 'Batal',
    danger = false,
    onConfirm,
    onCancel,
}) {
    // ESC untuk cancel — kebiasaan standar dialog konfirmasi
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onCancel?.();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onCancel]);

    if (!isOpen) return null;

    return (
        <div style={styles.backdrop} onClick={onCancel}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div style={styles.header}>
                    <h3 style={styles.title}>{title}</h3>
                    <button type="button" onClick={onCancel} style={styles.closeBtn} aria-label="Tutup">
                        ✕
                    </button>
                </div>

                <div style={styles.body}>
                    {typeof message === 'string' ? <p style={styles.message}>{message}</p> : message}
                </div>

                <div style={styles.footer}>
                    <button type="button" onClick={onCancel} style={styles.cancelBtn}>
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        style={danger ? styles.confirmBtnDanger : styles.confirmBtn}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

const styles = {
    backdrop: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 24, 40, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
    },
    modal: {
        background: '#ffffff',
        borderRadius: '10px',
        width: '100%',
        maxWidth: '380px',
        boxShadow: '0 12px 32px rgba(20, 24, 40, 0.25)',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px 0',
    },
    title: {
        margin: 0,
        fontSize: '16px',
        fontWeight: 700,
        color: '#1c2130',
    },
    closeBtn: {
        background: 'transparent',
        border: 'none',
        fontSize: '15px',
        color: '#6b7280',
        cursor: 'pointer',
        lineHeight: 1,
        padding: '4px',
    },
    body: {
        padding: '12px 20px 4px',
    },
    message: {
        margin: 0,
        fontSize: '13.5px',
        color: '#3b4152',
        lineHeight: 1.5,
    },
    footer: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px',
        padding: '16px 20px 20px',
    },
    cancelBtn: {
        padding: '9px 16px',
        borderRadius: '6px',
        border: '1px solid #cbd0da',
        background: '#ffffff',
        color: '#1c2130',
        fontWeight: 600,
        fontSize: '13.5px',
        cursor: 'pointer',
    },
    confirmBtn: {
        padding: '9px 16px',
        borderRadius: '6px',
        border: '1px solid #1a265b',
        background: '#1a265b',
        color: '#ffffff',
        fontWeight: 600,
        fontSize: '13.5px',
        cursor: 'pointer',
    },
    confirmBtnDanger: {
        padding: '9px 16px',
        borderRadius: '6px',
        border: '1px solid #c0392b',
        background: '#c0392b',
        color: '#ffffff',
        fontWeight: 600,
        fontSize: '13.5px',
        cursor: 'pointer',
    },
};
