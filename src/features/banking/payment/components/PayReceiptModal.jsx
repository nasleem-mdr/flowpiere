/** ─────────────────────────────────────────────────────────────────────────────
* PayReceiptModal.jsx
* Layar review terakhir sebelum submit — TIDAK fetch apa-apa sendiri, murni
* menampilkan apa yang sudah dipilih di container + InvoiceListModal, dan
* mengumpulkan bankAccountId/tenderType/description terakhir sebelum
* meneruskan ke usePayReceipt.submit() di container.
* ─────────────────────────────────────────────────────────────────────────────
*/
import React from 'react';
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { formatCurrency } from '@/utils/currency';

const TENDER_TYPE_OPTIONS = [
    { value: 'X', label: 'Cash' },
    { value: 'D', label: 'Direct Deposit (Transfer Bank)' },
    { value: 'K', label: 'Credit Card' },
    { value: 'C', label: 'Check' },
    { value: 'T', label: 'Direct Debit' },
];

const PayReceiptModal = ({
    isOpen, onClose,
    isReceipt, partner, invoices = [],
    bankAccounts = [], selectedBankAccountId, onBankAccountChange,
    tenderType, onTenderTypeChange,
    description, onDescriptionChange,
    isSubmitting,
    onConfirm,
}) => {
    if (!isOpen) return null;

    const totalAmt = invoices.reduce((s, i) => s + parseFloat(i.allocatedAmt || 0), 0);
    const canSubmit = !isSubmitting && !!selectedBankAccountId && totalAmt > 0 && invoices.length > 0;

    return (
        <div
            onClick={e => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}
            style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
            <div style={{ background: COLOR.surface, borderRadius: RADIUS.lg, width: '440px', maxWidth: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '16px 18px', borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0 }}>
                    <h3 style={{ margin: 0, fontSize: '16px', color: COLOR.textDk }}>
                        {isReceipt ? '💰 Terima Pembayaran' : '💸 Bayar ke Vendor'}
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: COLOR.textLt }}>{partner?.name}</p>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: COLOR.textMd, marginBottom: '6px' }}>
                        Invoice yang dialokasikan ({invoices.length})
                    </div>
                    {invoices.map(inv => (
                        <div key={inv.C_Invoice_ID} style={{
                            display: 'flex', justifyContent: 'space-between', fontSize: '13px',
                            padding: '6px 0', borderBottom: '1px solid #f1f5f9',
                        }}>
                            <span style={{ color: COLOR.textDk }}>{inv.DocumentNo}</span>
                            <span style={{ color: COLOR.textMd }}>{formatCurrency(inv.allocatedAmt)}</span>
                        </div>
                    ))}

                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: '#f0f4ff', borderRadius: RADIUS.md, padding: '10px 14px',
                        margin: '12px 0 16px',
                    }}>
                        <span style={{ fontSize: '13px', color: COLOR.textMd }}>Total</span>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: COLOR.textDk }}>{formatCurrency(totalAmt)}</span>
                    </div>

                    <label style={{ fontSize: '11px', color: COLOR.textLt, display: 'block', marginBottom: '4px' }}>
                        {isReceipt ? 'Masuk ke Cash/Bank Account' : 'Sumber Dana (Cash/Bank)'} <span style={{ color: COLOR.danger }}>*</span>
                    </label>
                    <select
                        value={selectedBankAccountId || ''}
                        onChange={e => onBankAccountChange(parseInt(e.target.value, 10) || null)}
                        disabled={isSubmitting}
                        style={{
                            width: '100%', boxSizing: 'border-box', padding: '9px 10px', marginBottom: '12px',
                            border: `1.5px solid ${!selectedBankAccountId ? COLOR.danger : COLOR.border}`,
                            borderRadius: RADIUS.sm, fontSize: '13px', background: '#fff', color: COLOR.textDk,
                        }}
                    >
                        <option value="">-- Pilih Cash/Bank Account --</option>
                        {bankAccounts.map(ba => (
                            <option key={ba.id} value={ba.id}>{ba.name}</option>
                        ))}
                    </select>

                    <label style={{ fontSize: '11px', color: COLOR.textLt, display: 'block', marginBottom: '4px' }}>
                        Cara Bayar
                    </label>
                    <select
                        value={tenderType}
                        onChange={e => onTenderTypeChange(e.target.value)}
                        disabled={isSubmitting}
                        style={{
                            width: '100%', boxSizing: 'border-box', padding: '9px 10px', marginBottom: '12px',
                            border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.sm,
                            fontSize: '13px', background: '#fff', color: COLOR.textDk,
                        }}
                    >
                        {TENDER_TYPE_OPTIONS.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>

                    <label style={{ fontSize: '11px', color: COLOR.textLt, display: 'block', marginBottom: '4px' }}>
                        Keterangan (opsional)
                    </label>
                    <input
                        type="text"
                        value={description}
                        onChange={e => onDescriptionChange(e.target.value)}
                        disabled={isSubmitting}
                        placeholder="Keterangan pembayaran..."
                        style={{
                            width: '100%', boxSizing: 'border-box', padding: '9px 10px',
                            border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.sm,
                            fontSize: '13px', color: COLOR.textDk,
                        }}
                    />
                </div>

                <div style={{ padding: '14px 18px', borderTop: `1px solid ${COLOR.border}`, display: 'flex', gap: '10px', flexShrink: 0 }}>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        style={{
                            flex: 1, padding: '12px', border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.md,
                            background: '#fff', color: COLOR.textMd, fontWeight: 600, fontSize: '13px',
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        }}
                    >Batal</button>
                    <button
                        onClick={onConfirm}
                        disabled={!canSubmit}
                        style={{
                            flex: 2, padding: '12px', border: 'none', borderRadius: RADIUS.md,
                            background: canSubmit ? (isReceipt ? '#16a34a' : COLOR.primary) : '#9ca3af',
                            color: '#fff', fontWeight: 700, fontSize: '14px',
                            cursor: canSubmit ? 'pointer' : 'not-allowed',
                        }}
                    >{isSubmitting ? '⏳ Memproses...' : (isReceipt ? 'Terima Pembayaran' : 'Bayar Sekarang')}</button>
                </div>
            </div>
        </div>
    );
};

export default PayReceiptModal;
