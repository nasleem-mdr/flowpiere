// hooks/useWorkflowDecision.js
// Eksekusi keputusan approval lewat REST workflow:
//   PUT /workflow/approve/{id}      body { "message": "..." }
//   PUT /workflow/reject/{id}       body { "message": "..." }
//   PUT /workflow/acknowledge/{id}  body { "message": "..." }
//   PUT /workflow/forward/{id}      body { "userTo": "<id/uuid>", "message": "..." }
//   PUT /workflow/setuserchoice/{id} body { "value": "Y", "message": "..." }
//
// Pilihan aksi dipetakan dari tipe node:
//   node-approval === true     → approve / reject / forward
//   node-confirmation === true → acknowledge / forward
//   selain itu (user choice)   → setuserchoice "Y" / "N" / forward
import { useState, useCallback } from 'react';
import { idempiereApi } from '@/api/idempiereApi';

const ACTION_URL = {
  approve:     (id) => `/workflow/approve/${id}`,
  reject:      (id) => `/workflow/reject/${id}`,
  acknowledge: (id) => `/workflow/acknowledge/${id}`,
  forward:     (id) => `/workflow/forward/${id}`,
  choice:      (id) => `/workflow/setuserchoice/${id}`,
};

// Deretan aksi yang tersedia untuk satu node — dipakai komponen untuk
// me-render tombol yang relevan saja.
export function getAvailableActions(activity) {
  if (activity?.['node-approval'])     return ['approve', 'reject', 'forward'];
  if (activity?.['node-confirmation']) return ['acknowledge', 'forward'];
  return ['approve', 'reject', 'forward']; // user choice → "Y"/"N"
}

export function useWorkflowDecision() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);

  const clearError = useCallback(() => setError(null), []);

  const decide = useCallback(async (activity, action, { message = '', userTo = null, value = null } = {}) => {
    if (!activity?.id) return { ok: false, error: 'Activity tidak valid.' };
    const buildUrl = ACTION_URL[action];
    if (!buildUrl) return { ok: false, error: `Aksi "${action}" tidak dikenal.` };

    setSubmitting(true);
    setError(null);
    try {
      const body = {};
      if (action === 'forward') {
        if (!userTo) throw new Error('Pilih user tujuan forward terlebih dahulu.');
        body.userTo = String(userTo);
      }
      if (action === 'choice' && value !== null) body.value = value;
      if (message && message.trim()) body.message = message.trim();

      const res = await idempiereApi(buildUrl(activity.id), {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      return { ok: true, response: res };
    } catch (err) {
      const msg = err.message || 'Gagal memproses keputusan.';
      setError(msg);
      return { ok: false, error: msg };
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { decide, submitting, error, clearError };
}
