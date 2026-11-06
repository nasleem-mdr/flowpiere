/** ─────────────────────────────────────────────────────────────────────────────
* PaymentReceiptSuccessModal.jsx
* Ditampilkan setelah usePayReceipt.submit() berhasil — menggantikan Dialog
* polos sebelumnya. Menunjukkan ringkasan lengkap: nomor dokumen, arah
* transaksi, partner, cara bayar, dan daftar invoice yang dialokasikan
* beserta nominalnya masing-masing, supaya user (dan kasir/finance yang
* membaca layar ini) yakin alokasinya sudah benar tanpa perlu buka window
* iDempiere untuk cek ulang.
* ─────────────────────────────────────────────────────────────────────────────
*/
import React from 'react';
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { formatCurrency } from '@/utils/currency';

const TENDER_TYPE_LABELS = {
    X: 'Cash',
    D: 'Direct Deposit (Transfer Bank)',
    K: 'Credit Card',
    C: 'Check',
    T: 'Direct Debit',
};

const PaymentReceiptSuccessModal = ({ isOpen, data, onClose }) => {
    if (!isOpen || !data) return null;

    const {
        paymentDocumentNo,
        isReceipt,
        partnerName,
        bankAccountName,
        tenderType,
        dateTrx,
        totalAmt,
        invoices = [],
        invoiceCount,
    } = data;

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1500, padding: '16px',
        }}>
            <div style={{
                background: COLOR.surface, borderRadius: RADIUS.xl, padding: '28px 22px',
                maxWidth: '460px', width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
                textAlign: 'center', maxHeight: '90vh', overflowY: 'auto', position: 'relative',
            }}>
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: '12px', right: '12px',
                        background: 'rgba(0,0,0,0.06)', border: 'none', color: COLOR.textMd,
                        borderRadius: '50%', width: '30px', height: '30px', fontSize: '16px',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                    }}
                >✕</button>

                <div style={{
                    width: '64px', height: '64px', borderRadius: '50%',
                    background: isReceipt ? '#dcfce7' : '#e0eaff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px', fontSize: '30px',
                }}>
                    {isReceipt ? '💰' : '💸'}
                </div>

                <div style={{ fontSize: '19px', fontWeight: 700, color: isReceipt ? '#16a34a' : COLOR.primary, marginBottom: '2px' }}>
                    {isReceipt ? 'Pembayaran Diterima' : 'Pembayaran ke Vendor Berhasil'}
                </div>
                <div style={{ fontSize: '13px', color: COLOR.textMd, marginBottom: '18px' }}>
                    Dokumen <strong>{paymentDocumentNo}</strong> — {invoiceCount} invoice sudah dialokasikan otomatis.
                </div>

                {/* Ringkasan header */}
                <div style={{
                    background: '#f9fafb', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md,
                    padding: '14px', marginBottom: '14px', textAlign: 'left',
                }}>
                    <SummaryRow label={isReceipt ? 'Diterima dari' : 'Dibayar ke'} value={partnerName} />
                    <SummaryRow label="Masuk/Keluar via" value={bankAccountName || '-'} />
                    <SummaryRow label="Cara Bayar" value={TENDER_TYPE_LABELS[tenderType] || tenderType} />
                    <SummaryRow label="Tanggal" value={dateTrx} last />
                </div>

                {/* Daftar invoice yang dialokasikan */}
                <div style={{
                    background: isReceipt ? '#f0fdf4' : '#f0f4ff',
                    border: `1px solid ${isReceipt ? '#bbf7d0' : '#c7d7fe'}`,
                    borderRadius: RADIUS.md, padding: '12px 14px', marginBottom: '14px', textAlign: 'left',
                }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: COLOR.textMd, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        Invoice Dialokasikan
                    </div>
                    {invoices.map((inv, i) => (
                        <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', fontSize: '13px',
                            padding: '6px 0', borderTop: i > 0 ? `1px solid ${isReceipt ? '#d1fae5' : '#dbe4fe'}` : 'none',
                        }}>
                            <span style={{ color: COLOR.textDk }}>{inv.documentNo}</span>
                            <span style={{ color: COLOR.textMd, fontWeight: 600 }}>{formatCurrency(inv.allocatedAmt)}</span>
                        </div>
                    ))}
                </div>

                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 14px', background: '#111827', borderRadius: RADIUS.md, marginBottom: '18px',
                }}>
                    <span style={{ fontSize: '13px', color: '#e5e7eb' }}>Total {isReceipt ? 'Diterima' : 'Dibayar'}</span>
                    <span style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>{formatCurrency(totalAmt)}</span>
                </div>

                <div style={{ fontSize: '11px', color: COLOR.textLt, marginBottom: '16px' }}>
                    Allocation (C_AllocationHdr/Line) sudah terbentuk otomatis di iDempiere — tidak perlu langkah tambahan.
                </div>

                <button onClick={onClose} style={{
                    background: isReceipt ? '#16a34a' : COLOR.primary, color: '#fff', border: 'none',
                    borderRadius: RADIUS.md, padding: '14px', fontWeight: 700,
                    fontSize: '15px', cursor: 'pointer', width: '100%',
                }}>
                    Buat Transaksi Baru
                </button>
            </div>
        </div>
    );
};

const SummaryRow = ({ label, value, last }) => (
    <div style={{
        display: 'flex', justifyContent: 'space-between', fontSize: '13px',
        padding: '5px 0', borderBottom: last ? 'none' : `1px dashed ${COLOR.border}`,
    }}>
        <span style={{ color: COLOR.textLt }}>{label}</span>
        <span style={{ color: COLOR.textDk, fontWeight: 600 }}>{value}</span>
    </div>
);

export default PaymentReceiptSuccessModal;
