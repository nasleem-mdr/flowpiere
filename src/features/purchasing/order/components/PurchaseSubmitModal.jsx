import React from 'react';
import { COLOR, RADIUS } from '@/utils/styleTokens';

// ─────────────────────────────────────────────────────────────────────────────
// PurchaseSubmitModal.jsx
// Sebelumnya 1 modal berisi Draft/Complete + section Cash Purchase yang
// digabung, dengan section Cash Purchase dimatikan lewat flag
// `ENABLE_CASH_PURCHASE = false`. Sekarang dipecah lewat prop `mode`, karena
// cart panel (POCartSidebar/POCartPanel) sudah punya 2 tombol terpisah:
//   - mode="normal" → tombol "Kirim PO" di cart panel → Draft/Complete
//   - mode="cash"   → tombol "Bayar Tunai" di cart panel → pilih bank
//     account lalu trigger PO→Receipt→Invoice→Payment otomatis
// Modal & handler (onDraft/onComplete/onCashPurchase) dari PurchasingContainer
// TIDAK berubah — cuma dipecah tampilannya.
// ─────────────────────────────────────────────────────────────────────────────
const PurchaseSubmitModal = ({
    isOpen, onClose, mode = 'normal',
    onDraft, onComplete, onCashPurchase,
    bankAccounts = [],
    selectedBankAccountId, onBankAccountChange,
    isSubmitting,
    totalAmount,
}) => {
    if (!isOpen) return null;

    const bankRequired  = !selectedBankAccountId;
    const cashPurchaseDisabled = isSubmitting || bankRequired || bankAccounts.length === 0;

    return (
        <div
            onClick={e => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}
            style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
            <div style={{ position: 'relative', background: COLOR.surface, borderRadius: RADIUS.lg, padding: '22px', width: '380px', maxWidth: '90vw' }}>

                {/* ── Tombol Close (X) — pojok kanan atas ── */}
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

                {mode === 'normal' ? (
                    <>
                        <h3 style={{ margin: '0 28px 4px 0', fontSize: '16px', color: COLOR.textDk }}>Pilih Metode Pengiriman</h3>
                        <p style={{ margin: '0 0 18px', fontSize: '12px', color: COLOR.textLt }}>
                            Total: <strong style={{ color: COLOR.textDk }}>Rp {totalAmount?.toLocaleString('id-ID')}</strong>
                        </p>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={onDraft}
                                disabled={isSubmitting}
                                style={{
                                    flex: 1, background: '#fff', color: COLOR.primary,
                                    border: `1.5px solid ${COLOR.primary}`, borderRadius: RADIUS.md,
                                    padding: '12px', fontWeight: 700, fontSize: '13px',
                                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                }}
                            >DRAFT</button>
                            <button
                                onClick={onComplete}
                                disabled={isSubmitting}
                                style={{
                                    flex: 1, background: COLOR.primary, color: '#fff',
                                    border: 'none', borderRadius: RADIUS.md,
                                    padding: '12px', fontWeight: 700, fontSize: '13px',
                                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                }}
                            >COMPLETE</button>
                        </div>
                    </>
                ) : (
                    <>
                        <h3 style={{ margin: '0 28px 4px 0', fontSize: '16px', color: COLOR.textDk }}>💵 Bayar Tunai Sekarang</h3>
                        <p style={{ margin: '0 0 4px', fontSize: '12px', color: COLOR.textLt }}>
                            Total: <strong style={{ color: COLOR.textDk }}>Rp {totalAmount?.toLocaleString('id-ID')}</strong>
                        </p>
                        <p style={{ margin: '0 0 16px', fontSize: '12px', color: COLOR.textMd }}>
                            PO → Receipt → Invoice → Payment akan dibuat &amp; di-Complete otomatis secara berurutan.
                        </p>

                        <label style={{ fontSize: '11px', color: COLOR.textLt, display: 'block', marginBottom: '4px' }}>
                            Sumber Dana (Cash/Bank) <span style={{ color: COLOR.danger }}>*</span>
                        </label>
                        <select
                            value={selectedBankAccountId || ''}
                            onChange={e => onBankAccountChange(parseInt(e.target.value, 10) || null)}
                            disabled={isSubmitting}
                            style={{
                                width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                                border: `1.5px solid ${bankRequired ? COLOR.danger : COLOR.border}`,
                                borderRadius: RADIUS.sm, fontSize: '13px', marginBottom: '6px',
                                background: '#fff', color: COLOR.textDk,
                            }}
                        >
                            <option value="">-- Pilih Cash/Bank Account --</option>
                            {bankAccounts.map(ba => (
                                <option key={ba.id} value={ba.id}>{ba.name}</option>
                            ))}
                        </select>
                        {bankAccounts.length === 0 && (
                            <p style={{ margin: '0 0 8px', fontSize: '11px', color: COLOR.danger }}>
                                Tidak ada Cash/Bank Account aktif ditemukan.
                            </p>
                        )}

                        <button
                            onClick={onCashPurchase}
                            disabled={cashPurchaseDisabled}
                            style={{
                                marginTop: '10px', width: '100%',
                                background: cashPurchaseDisabled ? '#9ca3af' : '#16a34a',
                                color: '#fff', border: 'none', borderRadius: RADIUS.md,
                                padding: '13px', fontWeight: 700, fontSize: '13px',
                                cursor: cashPurchaseDisabled ? 'not-allowed' : 'pointer',
                            }}
                        >{isSubmitting ? '⏳ Memproses...' : '💵 BAYAR TUNAI SEKARANG'}</button>
                    </>
                )}
            </div>
        </div>
    );
};

export default PurchaseSubmitModal;