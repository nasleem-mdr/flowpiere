import { useState } from 'react';
import { idempiereApi } from '@/api/idempiereApi';
import { resolveDocTypeId, DOC_BASE_TYPE, IS_SO_TRX } from '@/utils/docTypeResolver';
import { fetchDefaultBankAccount } from '@/utils/bankAccountResolver';
import { todayLocalISO, isDateOnly } from '@/utils/dateOnly';

// ─────────────────────────────────────────────────────────────────────────────
// useAPPaymentSubmit.jsx
// Pasangan AP (Purchase) dari usePOSPaymentSubmit.jsx (AR/Sales) — pola SAMA:
//   - Resolve DocType via DocBaseType (bukan hardcode ID)   → docTypeResolver
//   - C_BankAccount_ID: prioritas pilihan user, fallback ke fetchDefaultBankAccount
//   - Set C_Invoice_ID di header C_Payment → Complete (CO) → iDempiere
//     otomatis membuat Allocation
//
// BEDA dari POS: di Purchasing TIDAK ADA proses backend yang auto-generate
// apa pun. PO/Receipt/Invoice/Payment semuanya dibuat eksplisit dari React
// (lihat useCashPurchaseSubmit.jsx). Jadi tidak ada tahap "verifikasi dulu,
// baru fallback" seperti di POS — hook ini SELALU dipanggil langsung sebagai
// tahap terakhir alur, bukan sebagai fallback dari sesuatu yang gagal.
//
// BEDA payload penting dari AR:
//   - C_DocType_ID  → DOC_BASE_TYPE.AP_PAYMENT ('APP'), bukan AR_RECEIPT
//   - IsReceipt: false → uang KELUAR (bayar vendor), bukan masuk
// ─────────────────────────────────────────────────────────────────────────────
export function useAPPaymentSubmit() {
    const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

    const isSettled = (invoice) => invoice?.IsPaid === true || invoice?.IsPaid === 'Y';

    // ── Verifikasi NYATA apakah Allocation benar-benar kebentuk ─────────────
    // Payment.Complete() dengan C_Invoice_ID terisi SEHARUSNYA auto-allocate,
    // tapi "seharusnya" persis alasan kenapa POS Anda dulu macet di Invoice —
    // jangan diasumsikan, dicek langsung ke C_AllocationLine.
    const verifyAllocation = async (paymentId) => {
        const res = await idempiereApi(
            `/models/c_allocationline?$filter=C_Payment_ID eq ${paymentId}&$select=C_AllocationLine_ID&$top=1`
        );
        return (res?.records?.length ?? 0) > 0;
    };

    /**
     * submitAPPayment — buat 1 C_Payment (AP Payment) untuk 1 invoice, lalu Complete.
     *
     * @param {object} invoice - record C_Invoice (butuh AD_Client_ID, AD_Org_ID,
     *   C_BPartner_ID, C_Currency_ID, GrandTotal, dan id/C_Invoice_ID).
     * @param {number} payAmt - nominal dibayar; dibatasi maksimal GrandTotal invoice
     *   supaya tidak overpayment/utang mengambang (pola sama seperti versi AR Anda).
     * @param {string} tenderType - default 'K' (Cash).
     * @param {number|null} bankAccountId - override dari pilihan user; kalau null,
     *   di-resolve otomatis via fetchDefaultBankAccount(orgId, currencyId).
     * @param {string|null} dateTrx - 'YYYY-MM-DD' untuk DateTrx & DateAcct payment;
     *   kalau null → hari ini (lokal). Dari Cash Purchase = tanggal pemesanan pilihan user.
     */
    const submitAPPayment = async (invoice, payAmt, tenderType = 'K', bankAccountId = null, dateTrx = null) => {
        const clientId   = invoice.AD_Client_ID?.id ?? invoice.AD_Client_ID;
        const orgId      = invoice.AD_Org_ID?.id    ?? invoice.AD_Org_ID;
        const currencyId = invoice.C_Currency_ID?.id ?? invoice.C_Currency_ID;
        const invoiceId  = invoice.id ?? invoice.C_Invoice_ID;

        const apDocTypeId = await resolveDocTypeId(DOC_BASE_TYPE.AP_PAYMENT, {
            orgId,
            isSOTrx: IS_SO_TRX.PURCHASE,
        });

        const resolvedBankAccountId = bankAccountId || await fetchDefaultBankAccount(orgId, currencyId);

        const trxDateISO = dateTrx || todayLocalISO();
        if (!isDateOnly(trxDateISO)) throw new Error(`Tanggal payment tidak valid: "${trxDateISO}".`);

        const invoiceTotal = parseFloat(invoice.GrandTotal || 0);
        const tenderedAmt  = parseFloat(payAmt || 0);
        const actualPayAmt = Math.min(tenderedAmt, invoiceTotal);

        const paymentPayload = {
            AD_Client_ID:     { id: parseInt(clientId) },
            AD_Org_ID:        { id: parseInt(orgId) },
            C_DocType_ID:     { id: parseInt(apDocTypeId) },
            C_BankAccount_ID: { id: parseInt(resolvedBankAccountId) },
            C_BPartner_ID:    typeof invoice.C_BPartner_ID === 'object'
                                   ? invoice.C_BPartner_ID
                                   : { id: parseInt(invoice.C_BPartner_ID) },
            C_Invoice_ID:     { id: parseInt(invoiceId) }, // ← kunci: trigger auto-allocation saat CO
            C_Currency_ID:    typeof invoice.C_Currency_ID === 'object'
                                   ? invoice.C_Currency_ID
                                   : { id: parseInt(currencyId) },
            PayAmt:           actualPayAmt,
            TenderType:       tenderType,
            DateTrx:          trxDateISO,
            DateAcct:         trxDateISO,
            IsReceipt:        false, // uang keluar (bayar vendor)
        };

        const createdPayment = await idempiereApi('/models/c_payment', {
            method: 'POST',
            body: JSON.stringify(paymentPayload),
        });
        const paymentId = createdPayment.id || createdPayment.C_Payment_ID;
        if (!paymentId) throw new Error('Gagal membuat C_Payment (AP).');

        const completedPayment = await idempiereApi(`/models/c_payment/${paymentId}`, {
            method: 'PUT',
            body: JSON.stringify({ 'doc-action': 'CO' }),
        });

        return completedPayment;
    };

    /**
     * submitPaymentAllocation — dipanggil dari useCashPurchaseSubmit sebagai
     * TAHAP 4. Menerima ARRAY invoice untuk kompatibilitas ke depan (misal 1 PO
     * pecah jadi beberapa invoice), tapi tiap invoice tetap dapat 1 C_Payment
     * terpisah — karena C_Payment.C_Invoice_ID hanya bisa merujuk 1 invoice
     * untuk auto-allocation. (Kalau butuh 1 Payment gabungan untuk banyak
     * invoice sekaligus, itu perlu C_AllocationHdr manual — di luar cakupan
     * skenario cash-purchase yang selalu 1 PO → 1 Invoice.)
     *
     * Item array boleh berupa record C_Invoice lengkap, ATAU bentuk ringkas
     * { invoiceId, grandTotal } seperti yang dikirim useCashPurchaseSubmit saat
     * ini — kalau ringkas, di-fetch dulu record lengkapnya.
     */
    const submitPaymentAllocation = async (
        invoices,
        { vendorId, bankAccountId, paymentTenderType = 'K', dateTrx = null } = {}
    ) => {
        setIsSubmittingPayment(true);
        try {
            const results = [];
            for (const inv of invoices) {
                const invoiceRecord = inv.AD_Client_ID
                    ? inv
                    : await idempiereApi(
                        `/models/c_invoice/${inv.invoiceId}` +
                        `?$select=C_Invoice_ID,AD_Client_ID,AD_Org_ID,C_BPartner_ID,C_Currency_ID,GrandTotal,IsPaid`
                      );

                if (isSettled(invoiceRecord)) {
                    results.push({ paymentId: null, documentNo: null, skipped: true });
                    continue;
                }

                const payAmt = inv.grandTotal ?? invoiceRecord.GrandTotal;
                const completedPayment = await submitAPPayment(
                    invoiceRecord, payAmt, paymentTenderType, bankAccountId, dateTrx
                );
                const paymentId = completedPayment.id || completedPayment.C_Payment_ID;
                const allocated = await verifyAllocation(paymentId);

                results.push({
                    paymentId,
                    documentNo: completedPayment.DocumentNo,
                    allocated, // false → Payment CO sukses tapi Allocation tidak terverifikasi, perlu cek manual
                });
            }
            // Skenario cash-purchase saat ini selalu 1 invoice per panggilan.
            return results[0] || null;
        } finally {
            setIsSubmittingPayment(false);
        }
    };

    return { submitAPPayment, submitPaymentAllocation, isSubmittingPayment };
}