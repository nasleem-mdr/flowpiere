// components/DecisionModal.jsx
// Modal konfirmasi keputusan: Approve / Reject / Acknowledge / User Choice.
// Menerima catatan (textMsg) opsional yang diteruskan ke workflow engine.
import React, { useState, useEffect } from 'react';

const META = {
  approve: {
    title: 'Setujui Dokumen',
    confirmLabel: 'Ya, Setujui',
    tone: 'success',
    hint: 'Dokumen akan dilanjutkan ke node workflow berikutnya.',
  },
  reject: {
    title: 'Tolak Dokumen',
    confirmLabel: 'Ya, Tolak',
    tone: 'danger',
    hint: 'Alasan penolakan sangat disarankan diisi — akan tercatat di riwayat workflow.',
  },
  acknowledge: {
    title: 'Konfirmasi (Acknowledge)',
    confirmLabel: 'Konfirmasi',
    tone: 'neutral',
    hint: 'Tandai bahwa Anda telah menerima notifikasi node ini.',
  },
};

export default function DecisionModal({ open, action, activity, submitting, onClose, onSubmit }) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (open) setMessage('');
  }, [open, action]);

  if (!open || !activity) return null;
  const meta = META[action] || META.approve;

  return (
    <div className="wf-modal__backdrop" onClick={submitting ? undefined : onClose}>
      <div className="wf-modal" onClick={(e) => e.stopPropagation()}>
        <div className={`wf-modal__accent wf-modal__accent--${meta.tone}`} />

        <h3 className="wf-modal__title">{meta.title}</h3>
        <p className="wf-modal__subtitle">
          {activity.summary || activity['node-name']}
        </p>

        <label className="wf-modal__label" htmlFor="wf-decision-msg">
          Catatan / Alasan <span className="wf-muted">(opsional)</span>
        </label>
        <textarea
          id="wf-decision-msg"
          className="wf-modal__textarea"
          rows={3}
          placeholder={action === 'reject' ? 'Contoh: anggaran tidak mencukupi…' : 'Tambahkan catatan bila perlu…'}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={submitting}
        />
        <p className="wf-modal__hint">{meta.hint}</p>

        <div className="wf-modal__actions">
          <button
            type="button"
            className="wf-btn wf-btn--ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Batal
          </button>
          <button
            type="button"
            className={`wf-btn wf-btn--${meta.tone}`}
            onClick={() => onSubmit(message)}
            disabled={submitting}
          >
            {submitting ? 'Memproses…' : meta.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
