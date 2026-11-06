import React from 'react';
import { COLOR, RADIUS } from '@/utils/styleTokens';

// ─────────────────────────────────────────────────────────────────────────────
// SalesInvoiceSubmitModal.jsx
// Padanan PurchaseSubmitModal.jsx untuk sisi SALES — lebih simpel karena
// alurnya cuma C_Invoice + C_InvoiceLine (lihat useSalesInvoiceSubmit.jsx),
// TIDAK ada opsi bank/cash account seperti Cash Purchase (tidak ada Payment).
//
//   DRAFT    → buat invoice, TIDAK di-Complete (bisa dilengkapi/diperiksa dulu)
//   COMPLETE → buat invoice lalu langsung Complete (submitMode di hook)
//
// customerName ditampilkan read-only di sini — pemilihan customer dilakukan
// di cart (badge 👤, mirip badge 🚚 di POCartItem) lewat CustomerPickerModal.
// ─────────────────────────────────────────────────────────────────────────────
const SalesInvoiceSubmitModal = ({
    isOpen, onClose,
    onDraft, onComplete,
    customerName,
    isSubmitting,
    totalAmount,
}) => {
    if (!isOpen) return null;

    const noCustomer = !customerName;

    return (
        <div
            onClick={e => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}
            style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
            <div style={{ position: 'relative', background: COLOR.surface, borderRadius: RADIUS.lg, padding: '22px', width: '380px', maxWidth: '90vw' }}>

                {!isSubmitting && (
                    <button
                        onClick={onClose}
                        aria-label="Tutup"
                        style={{
                            position: 'absolute', top: '12px', right: '12px',
                            width: '28px', height: '28px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'transparent', border: 'none', borderRadius: RADIUS.sm,
                            color: COLOR.textLt, fontSize: '18px', lineHeight: 1,
                            cursor: 'pointer',
                        }}
                    >✕</button>
                )}

                <h3 style={{ margin: '0 28px 4px 0', fontSize: '16px', color: COLOR.textDk }}>Submit Sales Invoice</h3>

                <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0 10px',
                    fontSize: '12px', color: noCustomer ? COLOR.danger : COLOR.textMd,
                }}>
                    👤 {noCustomer ? 'Customer belum dipilih' : customerName}
                </div>

                <p style={{ margin: '0 0 18px', fontSize: '12px', color: COLOR.textLt }}>
                    Total: <strong style={{ color: COLOR.textDk }}>Rp {totalAmount?.toLocaleString('id-ID')}</strong>
                </p>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={onDraft}
                        disabled={isSubmitting || noCustomer}
                        style={{
                            flex: 1, background: '#fff', color: COLOR.primary,
                            border: `1.5px solid ${COLOR.primary}`, borderRadius: RADIUS.md,
                            padding: '12px', fontWeight: 700, fontSize: '13px',
                            cursor: (isSubmitting || noCustomer) ? 'not-allowed' : 'pointer',
                            opacity: noCustomer ? 0.6 : 1,
                        }}
                    >DRAFT</button>
                    <button
                        onClick={onComplete}
                        disabled={isSubmitting || noCustomer}
                        style={{
                            flex: 1, background: COLOR.primary, color: '#fff',
                            border: 'none', borderRadius: RADIUS.md,
                            padding: '12px', fontWeight: 700, fontSize: '13px',
                            cursor: (isSubmitting || noCustomer) ? 'not-allowed' : 'pointer',
                            opacity: noCustomer ? 0.6 : 1,
                        }}
                    >COMPLETE</button>
                </div>

                {isSubmitting && (
                    <p style={{ margin: '14px 0 0', fontSize: '11px', color: COLOR.textLt, textAlign: 'center' }}>
                        ⏳ Memproses invoice...
                    </p>
                )}
            </div>
        </div>
    );
};

export default SalesInvoiceSubmitModal;