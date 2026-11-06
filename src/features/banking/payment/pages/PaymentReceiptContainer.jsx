/**  ─────────────────────────────────────────────────────────────────────────────
* PaymentReceiptContainer.jsx
* Pencarian partner dibuat inline di sini (bukan pakai VendorPickerModal dari
* Purchasing) karena filternya beda tiap mode: IsCustomer=true untuk AR
* Receipt, IsVendor=true untuk AP Payment — kalau Anda sudah punya komponen
* picker BPartner generik di tempat lain, tinggal ganti bagian search di
* bawah dengan itu.
* ─────────────────────────────────────────────────────────────────────────────
*/

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog } from '@/shared/components';
import { useBankAccounts, getLoginInfo } from '@/shared/hooks';
import { idempiereApi, fkId } from '@/api/idempiereApi';
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { formatCurrency } from '@/utils/currency';
import InvoiceListModal from '@/features/banking/payment/components/InvoiceListModal';
import PayReceiptModal from '@/features/banking/payment/components/PayReceiptModal';
import PaymentReceiptSuccessModal from '@/features/banking/payment/components/PaymentReceiptSuccessModal';
import { usePayReceipt } from '@/features/banking/payment/hooks/usePayReceipt';

const PaymentReceiptContainer = () => {
    const [isReceipt, setIsReceipt] = useState(true); // true = AR Receipt (dari Customer), false = AP Payment (ke Vendor)

    const [partnerQuery, setPartnerQuery] = useState('');
    const [partnerResults, setPartnerResults] = useState([]);
    const [partnerSearching, setPartnerSearching] = useState(false);
    const [selectedPartner, setSelectedPartner] = useState(null); // { id, name }

    const [selectedInvoices, setSelectedInvoices] = useState([]);
    const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
    const [payModalOpen, setPayModalOpen] = useState(false);
    const [successData, setSuccessData] = useState(null);
    const [successOpen, setSuccessOpen] = useState(false);

    const [selectedBankAccountId, setSelectedBankAccountId] = useState(null);
    const [tenderType, setTenderType] = useState('X');
    const [description, setDescription] = useState('');

    const [dialog, setDialog] = useState({ isOpen: false, title: '', message: '' });
    const alert = (message, title = 'Perhatian') => setDialog({ isOpen: true, title, message });

    const { bankAccounts } = useBankAccounts();
    const { submit, isSubmitting } = usePayReceipt();

    // Reset semua pilihan saat ganti mode AR/AP — invoice & partner AR tidak
    // relevan untuk AP dan sebaliknya.
    const handleModeChange = (nextIsReceipt) => {
        setIsReceipt(nextIsReceipt);
        setSelectedPartner(null);
        setPartnerQuery('');
        setPartnerResults([]);
        setSelectedInvoices([]);
        setSelectedBankAccountId(null);
    };

    // ── Cari partner (debounce sederhana) ───────────────────────────────
    useEffect(() => {
        if (!partnerQuery.trim()) { setPartnerResults([]); return; }
        const timer = setTimeout(async () => {
            setPartnerSearching(true);
            try {
                const flagFilter = isReceipt ? 'IsCustomer eq true' : 'IsVendor eq true';
                // contains() di REST API iDempiere case-sensitive — dibungkus
                // toupper() di kedua sisi supaya "budi" tetap ketemu "Budi Santoso".
                const searchTerm = partnerQuery.trim().replace(/'/g, "''"); // escape single quote jaga-jaga
                const filterStr = `${flagFilter} and IsActive eq true and contains(toupper(Name),toupper('${searchTerm}'))`;
                const path = `/models/c_bpartner?$filter=${filterStr}&$select=C_BPartner_ID,Name&$top=15&$orderby=Name`;
                const res = await idempiereApi(path);
                setPartnerResults(Array.isArray(res.records) ? res.records : []);
            } catch (err) {
                console.error('Gagal cari partner:', err?.message || err);
                setPartnerResults([]);
            } finally {
                setPartnerSearching(false);
            }
        }, 350);
        return () => clearTimeout(timer);
    }, [partnerQuery, isReceipt]);

    const handleSelectPartner = (p) => {
        setSelectedPartner({ id: fkId(p.id) ?? p.id ?? p.C_BPartner_ID, name: p.Name });
        setPartnerQuery('');
        setPartnerResults([]);
        setSelectedInvoices([]);
    };

    const handleInvoicesConfirmed = (invoices) => {
        setSelectedInvoices(invoices);
    };

    const totalSelected = selectedInvoices.reduce((s, i) => s + parseFloat(i.allocatedAmt || 0), 0);

    const selectedBankAccountName = bankAccounts.find(ba => ba.id === selectedBankAccountId)?.name;

    const handleFinalSubmit = useCallback(async () => {
        try {
            const { orgId, clientId } = getLoginInfo();
            const firstInvoice = selectedInvoices[0];
            const currencyId = firstInvoice?.C_Currency_ID;
            // Org/Client diambil dari invoice-nya sendiri kalau ada (lebih akurat
            // untuk multi-org), fallback ke sesi login.
            const effectiveOrgId    = firstInvoice?.AD_Org_ID    ?? orgId;
            const effectiveClientId = firstInvoice?.AD_Client_ID ?? clientId;

            const result = await submit({
                isReceipt,
                partner: selectedPartner,
                bankAccountId: selectedBankAccountId,
                bankAccountName: selectedBankAccountName,
                currencyId,
                orgId: effectiveOrgId,
                clientId: effectiveClientId,
                invoices: selectedInvoices,
                tenderType,
                description,
            });

            setPayModalOpen(false);
            setSuccessData(result);
            setSuccessOpen(true);

            // Reset untuk transaksi berikutnya
            setSelectedPartner(null);
            setSelectedInvoices([]);
            setSelectedBankAccountId(null);
            setDescription('');
        } catch (err) {
            alert(err.message, 'Gagal Memproses');
        }
    }, [isReceipt, selectedPartner, selectedBankAccountId, selectedBankAccountName, selectedInvoices, tenderType, description, submit]);

    return (
        <div style={{
            flex: 1, minHeight: 0, background: COLOR.bg,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
            <Dialog isOpen={dialog.isOpen} title={dialog.title} message={dialog.message} onClose={() => setDialog({ isOpen: false, title: '', message: '' })} />

            <PaymentReceiptSuccessModal
                isOpen={successOpen}
                data={successData}
                onClose={() => { setSuccessOpen(false); setSuccessData(null); }}
            />

            <InvoiceListModal
                isOpen={invoiceModalOpen}
                onClose={() => setInvoiceModalOpen(false)}
                partnerId={selectedPartner?.id}
                partnerName={selectedPartner?.name}
                isSOTrx={isReceipt}
                onConfirm={handleInvoicesConfirmed}
            />

            <PayReceiptModal
                isOpen={payModalOpen}
                onClose={() => setPayModalOpen(false)}
                isReceipt={isReceipt}
                partner={selectedPartner}
                invoices={selectedInvoices}
                bankAccounts={bankAccounts}
                selectedBankAccountId={selectedBankAccountId}
                onBankAccountChange={setSelectedBankAccountId}
                tenderType={tenderType}
                onTenderTypeChange={setTenderType}
                description={description}
                onDescriptionChange={setDescription}
                isSubmitting={isSubmitting}
                onConfirm={handleFinalSubmit}
            />

            {/* Header */}
            <div style={{ padding: '16px 18px', background: COLOR.surface, borderBottom: `1px solid ${COLOR.border}` }}>
                <h2 style={{ margin: '0 0 12px', fontSize: '16px', color: COLOR.textDk }}>💳 Payment & Receipt</h2>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => handleModeChange(true)}
                        style={{
                            flex: 1, padding: '10px', borderRadius: RADIUS.md, fontWeight: 700, fontSize: '13px',
                            border: `1.5px solid ${isReceipt ? '#16a34a' : COLOR.border}`,
                            background: isReceipt ? '#16a34a' : '#fff',
                            color: isReceipt ? '#fff' : COLOR.textMd, cursor: 'pointer',
                        }}
                    >💰 Terima dari Customer</button>
                    <button
                        onClick={() => handleModeChange(false)}
                        style={{
                            flex: 1, padding: '10px', borderRadius: RADIUS.md, fontWeight: 700, fontSize: '13px',
                            border: `1.5px solid ${!isReceipt ? COLOR.primary : COLOR.border}`,
                            background: !isReceipt ? COLOR.primary : '#fff',
                            color: !isReceipt ? '#fff' : COLOR.textMd, cursor: 'pointer',
                        }}
                    >💸 Bayar ke Vendor</button>
                </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
                {!selectedPartner ? (
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: COLOR.textMd, display: 'block', marginBottom: '6px' }}>
                            Cari {isReceipt ? 'Customer' : 'Vendor'}
                        </label>
                        <input
                            type="text"
                            value={partnerQuery}
                            onChange={e => setPartnerQuery(e.target.value)}
                            placeholder={`Ketik nama ${isReceipt ? 'customer' : 'vendor'}...`}
                            style={{
                                width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                                border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.md,
                                fontSize: '14px', color: COLOR.textDk, outline: 'none',
                            }}
                        />
                        {partnerSearching && <div style={{ padding: '10px 0', fontSize: '12px', color: COLOR.textLt }}>⏳ Mencari...</div>}
                        {partnerResults.map(p => (
                            <div
                                key={p.id ?? p.C_BPartner_ID}
                                onClick={() => handleSelectPartner(p)}
                                style={{
                                    padding: '10px 12px', borderBottom: `1px solid ${COLOR.border}`,
                                    cursor: 'pointer', fontSize: '13px', color: COLOR.textDk,
                                }}
                            >{p.Name}</div>
                        ))}
                    </div>
                ) : (
                    <div>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: COLOR.surface, border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md,
                            padding: '12px 14px', marginBottom: '14px',
                        }}>
                            <div>
                                <div style={{ fontSize: '11px', color: COLOR.textLt }}>{isReceipt ? 'Customer' : 'Vendor'}</div>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: COLOR.textDk }}>{selectedPartner.name}</div>
                            </div>
                            <button
                                onClick={() => { setSelectedPartner(null); setSelectedInvoices([]); }}
                                style={{ background: 'transparent', border: 'none', color: COLOR.primary, fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
                            >Ganti</button>
                        </div>

                        <button
                            onClick={() => setInvoiceModalOpen(true)}
                            style={{
                                width: '100%', padding: '12px', borderRadius: RADIUS.md,
                                border: `1.5px dashed ${COLOR.primary}`, background: '#fff',
                                color: COLOR.primary, fontWeight: 700, fontSize: '13px', cursor: 'pointer', marginBottom: '14px',
                            }}
                        >{selectedInvoices.length > 0 ? '✏️ Ubah Pilihan Invoice' : '➕ Pilih Invoice Outstanding'}</button>

                        {selectedInvoices.length > 0 && (
                            <>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: COLOR.textMd, marginBottom: '6px' }}>
                                    {selectedInvoices.length} invoice dipilih
                                </div>
                                {selectedInvoices.map(inv => (
                                    <div key={inv.C_Invoice_ID} style={{
                                        display: 'flex', justifyContent: 'space-between', fontSize: '13px',
                                        padding: '8px 0', borderBottom: `1px solid ${COLOR.border}`,
                                    }}>
                                        <span style={{ color: COLOR.textDk }}>{inv.DocumentNo}</span>
                                        <span style={{ color: COLOR.textMd }}>{formatCurrency(inv.allocatedAmt)}</span>
                                    </div>
                                ))}

                                <div style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    background: '#f0f4ff', borderRadius: RADIUS.md, padding: '10px 14px', margin: '14px 0',
                                }}>
                                    <span style={{ fontSize: '13px', color: COLOR.textMd }}>Total</span>
                                    <span style={{ fontSize: '15px', fontWeight: 700, color: COLOR.textDk }}>{formatCurrency(totalSelected)}</span>
                                </div>

                                <button
                                    onClick={() => setPayModalOpen(true)}
                                    style={{
                                        width: '100%', padding: '14px', borderRadius: RADIUS.md, border: 'none',
                                        background: isReceipt ? '#16a34a' : COLOR.primary, color: '#fff',
                                        fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                                    }}
                                >Lanjutkan ke Pembayaran</button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PaymentReceiptContainer;