/**  ─────────────────────────────────────────────────────────────────────────────
* usePayReceipt.js
* Beda dari usePOSPaymentSubmit / useAPPaymentSubmit (yang SELALU 1 Payment
* untuk 1 Invoice, auto-allocate via C_Invoice_ID di header): hook ini untuk
* skenario "Bayar Piutang/Utang" — 1 Payment bisa melunasi/mencicil BANYAK
* invoice sekaligus.
*
* Alur (CONFIRMED WORKING — lihat catatan di idempiere-integration-patterns):
*   1. Buat C_Payment (Draft, TANPA C_Invoice_ID di header)
*   2. Insert C_PaymentAllocate — 1 baris per invoice, SELAGI Payment masih
*      Draft (child tab "Allocate" di window Payment, wajib diisi sebelum
*      Complete). Field wajib: C_Payment_ID, C_Invoice_ID, Amount, DAN
*      InvoiceAmt (harus sama dengan Amount — server menolak dengan
*      "Invoice Amt(0.0) <> Totals(X)" kalau InvoiceAmt tidak diisi).
*   3. Complete Payment (doc-action: CO) — iDempiere baca C_PaymentAllocate
*      dan OTOMATIS generate C_AllocationHdr + C_AllocationLine sendiri
*      (tab "Allocations" di window Payment, read-only — jangan diisi manual).
* ─────────────────────────────────────────────────────────────────────────────
*/

import { useState } from 'react';
import { idempiereApi } from '@/api/idempiereApi';
import { 
    resolveDocTypeId, 
    DOC_BASE_TYPE, 
    IS_SO_TRX, 
} from '@/utils/docTypeResolver';

export function usePayReceipt() {
    const [isSubmitting, setIsSubmitting] = useState(false);

    /**
     * @param {object} params
     * @param {boolean} params.isReceipt - true = AR Receipt (dari Customer), false = AP Payment (ke Vendor)
     * @param {{ id: number, name: string }} params.partner
     * @param {number} params.bankAccountId
     * @param {string} [params.bankAccountName]
     * @param {number} params.currencyId - HARUS sama untuk semua invoice yang dipilih
     * @param {number} params.orgId
     * @param {number} params.clientId
     * @param {Array<{ C_Invoice_ID: number, DocumentNo?: string, allocatedAmt: number }>} params.invoices
     * @param {string} [params.tenderType] - default 'X' (Cash)
     * @param {string} [params.description]
     */
    const submit = async ({
        isReceipt,
        partner,
        bankAccountId,
        bankAccountName,
        currencyId,
        orgId,
        clientId,
        invoices,
        tenderType = 'X',
        description = '',
    }) => {
        const validInvoices = (invoices || []).filter(inv => parseFloat(inv.allocatedAmt || 0) > 0);
        if (validInvoices.length === 0) {
            throw new Error('Pilih minimal 1 invoice dengan nominal bayar lebih dari 0.');
        }
        if (!partner?.id) throw new Error('Partner belum dipilih.');
        if (!bankAccountId) throw new Error('Bank/Cash Account belum dipilih.');
        if (!currencyId) throw new Error('Currency tidak terdeteksi dari invoice yang dipilih.');

        const totalAmt = validInvoices.reduce((s, i) => s + parseFloat(i.allocatedAmt || 0), 0);

        setIsSubmitting(true);
        try {
            const docTypeId = await resolveDocTypeId(
                isReceipt ? DOC_BASE_TYPE.AR_RECEIPT : DOC_BASE_TYPE.AP_PAYMENT,
                { orgId, isSOTrx: isReceipt ? IS_SO_TRX.SALES : IS_SO_TRX.PURCHASE }
            );

            const todayISO = new Date().toISOString().split('T')[0];

            // ── 1) C_Payment header (Draft) — SENGAJA tanpa C_Invoice_ID ────
            const paymentPayload = {
                AD_Client_ID:     { id: clientId },
                AD_Org_ID:        { id: orgId },
                C_DocType_ID:     { id: docTypeId },
                C_BankAccount_ID: { id: bankAccountId },
                C_BPartner_ID:    { id: partner.id },
                C_Currency_ID:    { id: currencyId },
                PayAmt:           totalAmt,
                TenderType:       tenderType,
                DateTrx:          todayISO,
                DateAcct:         todayISO,
                IsReceipt:        isReceipt,
                Description:      description || `Alokasi ${validInvoices.length} invoice — ${partner.name || ''}`,
            };

            const paymentRes = await idempiereApi('/models/c_payment', {
                method: 'POST',
                body: JSON.stringify(paymentPayload),
            });
            const paymentId = paymentRes.id || paymentRes.C_Payment_ID;
            if (!paymentId) throw new Error('Gagal membuat C_Payment.');

            // ── 2) C_PaymentAllocate — 1 baris per invoice, SELAGI Payment
            // masih Draft. JANGAN bikin C_AllocationHdr/Line manual — itu
            // di-generate iDempiere sendiri saat Complete di bawah.
            for (const inv of validInvoices) {
                const amount = parseFloat(inv.allocatedAmt || 0);
                await idempiereApi('/models/c_paymentallocate', {
                    method: 'POST',
                    body: JSON.stringify({
                        AD_Client_ID: { id: clientId },
                        AD_Org_ID:    { id: orgId },
                        C_Payment_ID: { id: paymentId },
                        C_Invoice_ID: { id: inv.C_Invoice_ID },
                        Amount:       amount,
                        InvoiceAmt:   amount, // wajib sama dengan Amount, lihat catatan di atas
                    }),
                });
            }

            // ── 3) Complete Payment — iDempiere baca C_PaymentAllocate &
            // auto-generate C_AllocationHdr + C_AllocationLine sendiri.
            const completedPayment = await idempiereApi(`/models/c_payment/${paymentId}`, {
                method: 'PUT',
                body: JSON.stringify({ 'doc-action': 'CO' }),
            });

            return {
                paymentId,
                paymentDocumentNo: completedPayment.DocumentNo,
                isReceipt,
                partnerName: partner.name,
                bankAccountName,
                tenderType,
                dateTrx: todayISO,
                totalAmt,
                invoices: validInvoices.map(inv => ({
                    documentNo: inv.DocumentNo,
                    allocatedAmt: parseFloat(inv.allocatedAmt || 0),
                })),
                invoiceCount: validInvoices.length,
            };
        } finally {
            setIsSubmitting(false);
        }
    };

    return { submit, isSubmitting };
}