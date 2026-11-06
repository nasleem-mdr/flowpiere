import React from 'react';
import '@/css/ConfirmModal.css';

const ConfirmModal = ({
  isOpen,
  title = 'Konfirmasi',
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'OK', // 1. Ubah default label menjadi 'OK' agar lebih universal
  cancelLabel = 'Batal',
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>

        {/* Accent bar */}
        <div className="modal-accent-bar" />

        {/* Body */}
        <div className="modal-body">
          <div className="modal-icon">⚠️</div>
          <div className="modal-title">{title}</div>
          <div className="modal-message">{message}</div>
        </div>

        {/* Divider */}
        <div className="modal-divider" />

        {/* Footer */}
        <div className="modal-footer">
          {/* 2. Sembunyikan tombol Batal secara otomatis jika props cancelLabel dikosongkan */}
          {cancelLabel && (
            <button className="modal-btn-cancel" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button className="modal-btn-confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>

      </div>
    </div>
  );
};

export default ConfirmModal;
