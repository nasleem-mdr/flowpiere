/**  ─────────────────────────────────────────────────────────────────────────────
* InvoiceListModal.jsx
* Fetch invoice OUTSTANDING (OpenAmt > 0, sudah Complete) milik 1 partner,
* untuk transaksi Sales (AR, isSOTrx=true) ATAU Purchase (AP, isSOTrx=false)
* sesuai mode yang dipilih di PaymentReceiptContainer.
*
* Tiap baris: checkbox + input nominal ("Bayar") yang default-nya = OpenAmt
* penuh, tapi bisa dikurangi untuk bayar sebagian (partial). Kalau invoice
* yang dicentang beda C_Currency_ID dari yang pertama dicentang, baris lain
* dengan currency beda otomatis di-disable — 1 C_Payment cuma bisa 1 currency.
* ─────────────────────────────────────────────────────────────────────────────
*/

import React, { useState, useEffect, useMemo } from 'react';
import { idempiereApi } from '@/api/idempiereApi';
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { formatCurrency } from '@/utils/currency';


const InvoiceListModal = ({ isOpen, onClose, partnerId, partnerName, isSOTrx, onConfirm }) => {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading]   = useState(false);
    const [checked, setChecked]   = useState({}); // { [C_Invoice_ID]: allocatedAmt }

    useEffect(() => {
        if (!isOpen || !partnerId) return;

        const fetchInvoices = async () => {
            setLoading(true);
            setChecked({});
            try {
                // OpenAmt bukan kolom fisik di C_Invoice — filter pakai IsPaid
                // (kolom asli), lalu OpenAmt dihitung manual di bawah:
                // GrandTotal - total yang sudah dialokasikan (C_AllocationLine).
                const filterStr = `C_BPartner_ID eq ${partnerId} and IsSOTrx eq ${isSOTrx} and DocStatus eq 'CO' and IsPaid eq false`;
                const path =
                    `/models/c_invoice?$filter=${filterStr}` +
                    `&$select=C_Invoice_ID,DocumentNo,POReference,DateInvoiced,GrandTotal,C_Currency_ID,AD_Org_ID,AD_Client_ID` +
                    `&$orderby=DateInvoiced`;
                const res = await idempiereApi(path);
                const candidates = Array.isArray(res.records) ? res.records : [];

                // Hitung OpenAmt manual per invoice: GrandTotal - SUM(C_AllocationLine.Amount)
                const withOpenAmt = await Promise.all(candidates.map(async (inv) => {
                    const invId = inv.id ?? inv.C_Invoice_ID;
                    let allocatedSum = 0;
                    try {
                        const allocRes = await idempiereApi(
                            `/models/c_allocationline?$filter=C_Invoice_ID eq ${invId}&$select=Amount`
                        );
                        const allocLines = Array.isArray(allocRes.records) ? allocRes.records : [];
                        allocatedSum = allocLines.reduce((s, l) => s + parseFloat(l.Amount || 0), 0);
                    } catch {
                        // Kalau gagal hitung alokasi 1 invoice, jangan gagalkan
                        // seluruh list — tampilkan invoice itu dengan OpenAmt
                        // penuh (GrandTotal) sebagai fallback aman.
                    }
                    const grandTotal = parseFloat(inv.GrandTotal || 0);
                    const openAmt = Math.max(grandTotal - allocatedSum, 0);
                    return { ...inv, OpenAmt: openAmt };
                }));

                // IsPaid di DB kadang belum ke-refresh walau openAmt hasil hitungan
                // sudah 0 (race condition/lag) — saring sekali lagi di sini.
                setInvoices(withOpenAmt.filter(inv => inv.OpenAmt > 0));
            } catch (err) {
                console.error('Gagal fetch invoice outstanding:', err?.message || err);
                setInvoices([]);
            } finally {
                setLoading(false);
            }
        };
        fetchInvoices();
    }, [isOpen, partnerId, isSOTrx]);

    // Currency dari baris pertama yang dicentang — mengunci baris lain yang beda currency.
    const lockedCurrencyId = useMemo(() => {
        const firstCheckedId = Object.keys(checked)[0];
        if (!firstCheckedId) return null;
        const inv = invoices.find(i => String(i.id ?? i.C_Invoice_ID) === firstCheckedId);
        return inv ? (inv.C_Currency_ID?.id ?? inv.C_Currency_ID) : null;
    }, [checked, invoices]);

    if (!isOpen) return null;

    const getInvId = (inv) => inv.id ?? inv.C_Invoice_ID;
    const getCurrencyId = (inv) => inv.C_Currency_ID?.id ?? inv.C_Currency_ID;

    const handleToggle = (inv) => {
        const id = String(getInvId(inv));
        setChecked(prev => {
            const next = { ...prev };
            if (next[id] !== undefined) {
                delete next[id];
            } else {
                next[id] = parseFloat(inv.OpenAmt || 0); // default: bayar penuh
            }
            return next;
        });
    };

    const handleAmountChange = (inv, value) => {
        const id = String(getInvId(inv));
        const openAmt = parseFloat(inv.OpenAmt || 0);
        let amt = parseFloat(value);
        if (isNaN(amt) || amt < 0) amt = 0;
        if (amt > openAmt) amt = openAmt;
        setChecked(prev => ({ ...prev, [id]: amt }));
    };

    const totalSelected = Object.values(checked).reduce((s, v) => s + (v || 0), 0);
    const selectedCount = Object.keys(checked).length;

    const handleConfirm = () => {
        const selected = invoices
            .filter(inv => checked[String(getInvId(inv))] !== undefined)
            .map(inv => ({
                C_Invoice_ID: getInvId(inv),
                DocumentNo:   inv.DocumentNo,
                POReference: inv.POReference,
                OpenAmt:      parseFloat(inv.OpenAmt || 0),
                C_Currency_ID: getCurrencyId(inv),
                AD_Org_ID:    inv.AD_Org_ID?.id ?? inv.AD_Org_ID,
                AD_Client_ID: inv.AD_Client_ID?.id ?? inv.AD_Client_ID,
                allocatedAmt: checked[String(getInvId(inv))],
            }));
        onConfirm(selected);
        onClose();
    };

    return (
        <div
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
            style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
            <div style={{ background: COLOR.surface, borderRadius: RADIUS.lg, width: '520px', maxWidth: '92vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '16px 18px', borderBottom: `1px solid ${COLOR.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '15px', color: COLOR.textDk }}>Pilih Invoice Outstanding</h3>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: COLOR.textLt }}>{partnerName}</p>
                    </div>
                    <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>⏳ Memuat invoice...</div>
                    ) : invoices.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>
                            Tidak ada invoice outstanding untuk partner ini.
                        </div>
                    ) : (
                        invoices.map(inv => {
                            const id = String(getInvId(inv));
                            const isChecked = checked[id] !== undefined;
                            const currencyId = getCurrencyId(inv);
                            const currencyLocked = lockedCurrencyId !== null && currencyId !== lockedCurrencyId && !isChecked;

                            return (
                                <div key={id} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0',
                                    borderBottom: `1px solid #f1f5f9`, opacity: currencyLocked ? 0.4 : 1,
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={currencyLocked}
                                        onChange={() => handleToggle(inv)}
                                        title={currencyLocked ? 'Mata uang beda, tidak bisa digabung dalam 1 Payment' : undefined}
                                        style={{ width: '16px', height: '16px', cursor: currencyLocked ? 'not-allowed' : 'pointer' }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: COLOR.textDk }}>{inv.DocumentNo} - {inv.POReference}</div>
                                        <div style={{ fontSize: '11px', color: COLOR.textLt }}>
                                            {inv.DateInvoiced} · Total {formatCurrency(inv.GrandTotal)} · Sisa {formatCurrency(inv.OpenAmt)}
                                        </div>
                                    </div>
                                    <input
                                        type="number"
                                        min="0"
                                        max={inv.OpenAmt}
                                        disabled={!isChecked}
                                        value={isChecked ? checked[id] : ''}
                                        onChange={e => handleAmountChange(inv, e.target.value)}
                                        placeholder="0"
                                        style={{
                                            width: '110px', padding: '6px 8px', textAlign: 'right',
                                            border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.sm,
                                            fontSize: '13px', color: COLOR.textDk,
                                            background: isChecked ? '#fff' : '#f3f4f6',
                                        }}
                                    />
                                </div>
                            );
                        })
                    )}
                </div>

                <div style={{ padding: '14px 18px', borderTop: `1px solid ${COLOR.border}`, flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                        <span style={{ color: COLOR.textMd }}>{selectedCount} invoice dipilih</span>
                        <strong style={{ color: COLOR.textDk }}>{formatCurrency(totalSelected)}</strong>
                    </div>
                    <button
                        onClick={handleConfirm}
                        disabled={selectedCount === 0 || totalSelected <= 0}
                        style={{
                            width: '100%', padding: '12px', border: 'none', borderRadius: RADIUS.md,
                            background: (selectedCount === 0 || totalSelected <= 0) ? '#9ca3af' : COLOR.primary,
                            color: '#fff', fontWeight: 700, fontSize: '14px',
                            cursor: (selectedCount === 0 || totalSelected <= 0) ? 'not-allowed' : 'pointer',
                        }}
                    >Lanjutkan</button>
                </div>
            </div>
        </div>
    );
};

export default InvoiceListModal;