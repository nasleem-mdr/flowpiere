/**
* ⚠️ Kalau PurchaseSubmitModal.jsx yang sudah ada propnya cukup generik
* (onDraft/onComplete/onCashPurchase/bankAccounts), Anda bisa REUSE komponen
* itu langsung (map onBayar → prop onCashPurchase-nya) tanpa file baru ini.
*/

import React from 'react';

import { 
  COLOR, 
  RADIUS, 
} from '@/utils/styleTokens';

const InvoiceSubmitModal = ({
  isOpen, onClose, onDraft, onComplete, onBayar,
  bankAccounts = [], selectedBankAccountId, onBankAccountChange,
  isSubmitting, totalAmount,
}) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: COLOR.surface, borderRadius: RADIUS.lg, padding: '20px', width: '90%', maxWidth: '380px' }}>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>Submit Purchase Invoice</div>
        <div style={{ fontSize: '13px', color: COLOR.textLt, marginBottom: '14px' }}>
          Total: {totalAmount?.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })}
        </div>
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', color: COLOR.textLt, display: 'block', marginBottom: '4px' }}>Rekening Bank (wajib utk Bayar Langsung)</label>
          <select value={selectedBankAccountId || ''} onChange={e => onBankAccountChange(e.target.value || null)}
            style={{ width: '100%', padding: '8px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm }}>
            <option value="">-- Pilih Bank --</option>
            {bankAccounts.map(b => <option key={b.C_BankAccount_ID || b.id} value={b.C_BankAccount_ID || b.id}>{b.Name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button disabled={isSubmitting} onClick={onDraft} style={{ padding: '10px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md, background: 'none', fontWeight: 600 }}>Simpan Draft</button>
          <button disabled={isSubmitting} onClick={onComplete} style={{ padding: '10px', border: 'none', borderRadius: RADIUS.md, background: COLOR.primary, color: '#fff', fontWeight: 700 }}>Complete</button>
          <button disabled={isSubmitting || !selectedBankAccountId} onClick={onBayar} style={{ padding: '10px', border: 'none', borderRadius: RADIUS.md, background: COLOR.success, color: '#fff', fontWeight: 700, opacity: !selectedBankAccountId ? 0.6 : 1 }}>💰 Bayar Langsung</button>
          <button disabled={isSubmitting} onClick={onClose} style={{ padding: '8px', border: 'none', background: 'none', color: COLOR.textLt, fontSize: '12px' }}>Batal</button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceSubmitModal;
