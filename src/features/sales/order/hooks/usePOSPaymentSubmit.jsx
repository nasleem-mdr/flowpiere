import { useState } from 'react';
import { idempiereApi } from '@/api/idempiereApi';
import { resolveDocTypeId, DOC_BASE_TYPE, IS_SO_TRX } from '@/utils/docTypeResolver';

const docStatusOf = (rec) => rec?.DocStatus?.id ?? rec?.DocStatus ?? null;

// doc-action CO pada order yang kena approval workflow TIDAK langsung CO — statusnya IP
// (menunggu approver). Untuk POS itu tidak boleh terjadi (kasir tidak bisa menunggu
// approval), jadi hentikan dengan pesan yang jelas, bukan error "Invoice belum terbentuk".
// Kalau status tidak terbaca (null), dibiarkan lanjut — pengecekan Invoice di bawah jadi pengamannya.
function assertOrderCompleted(order, orderId) {
    const st = docStatusOf(order);
    if (!st || st === 'CO' || st === 'CL') return;
    throw new Error(
      `Order POS ${order?.DocumentNo ?? '#' + orderId} masuk approval workflow (status ${st}), sehingga Shipment/Invoice tidak terbentuk. ` +
      `Transaksi POS harus bypass workflow: pasang Transition Condition IsSOTrx = false pada transisi ke node QC Check di workflow Process_Order. ` +
      `Order ini sudah terbentuk dengan status ${st} — selesaikan atau Void manual di iDempiere sebelum mengulang, supaya tidak ada transaksi ganda.`
    );
}

// Mapping TenderType (C_POSTenderType / C_POSPayment) -> PaymentRule (C_Order).
const TENDER_TO_PAYMENTRULE = {
    X: "B", // Cash
    K: "K", // Credit Card
    D: "D", // Direct Deposit ("Bank")
    T: "T", // Direct Debit
    C: "S", // Check
};

export function usePOSPaymentSubmit() {
    const [isSettlingPayment, setIsSettlingPayment] = useState(false);
    const [lastPaymentStatus, setLastPaymentStatus] = useState(null); // 'auto' | 'manual' | null
   
    // ── Cari Bank Account default untuk kombinasi Org + Currency ────────────
    const fetchDefaultBankAccount = async (orgId, currencyId) => {
        const tryFetch = async (filter) => {
            const res = await idempiereApi(
                `/models/c_bankaccount?$filter=${filter}&$select=C_BankAccount_ID&$top=1`
            );
            const rec = res?.records?.[0];
            return rec?.id ?? rec?.C_BankAccount_ID ?? null;
        };

        let id = await tryFetch(
            `AD_Org_ID eq ${orgId} and C_Currency_ID eq ${currencyId} and IsActive eq true`
        );
        if (!id) {
            id = await tryFetch(
                `AD_Org_ID eq 0 and C_Currency_ID eq ${currencyId} and IsActive eq true`
            );
        }
        if (!id) {
            throw new Error(
                `Tidak ada C_BankAccount aktif untuk Org ${orgId} / Currency ${currencyId}. ` +
                `Setup Bank Account di window "Bank Account" dulu.`
            );
        }
        return id;
    };
    const fetchInvoiceForOrder = async (orderId) => {
        const res = await idempiereApi(
            `/models/c_invoice?$filter=C_Order_ID eq ${orderId}` +
            `&$select=C_Invoice_ID,AD_Client_ID,AD_Org_ID,C_BPartner_ID,C_Currency_ID,GrandTotal,IsPaid&$top=1`
        );
        return res?.records?.[0] || null;
    };
    // ── Cek apakah Order/Invoice sudah lunas ──
    const isSettled = (invoice) => {
        if (!invoice) return false;
        return invoice.IsPaid === true || invoice.IsPaid === 'Y';
    };

    // ── Fallback: buat C_Payment manual + complete → auto-allocate ──────────
    const handleSubmitPayment = async (invoice, rawPayAmt, tenderType = "X", customBankAccountId = null) => {
        const clientId   = invoice.AD_Client_ID?.id ?? invoice.AD_Client_ID;
        const orgId      = invoice.AD_Org_ID?.id    ?? invoice.AD_Org_ID;
        const currencyId = invoice.C_Currency_ID?.id ?? invoice.C_Currency_ID;
        const invoiceId  = invoice.id ?? invoice.C_Invoice_ID;

        const arDocTypeId = await resolveDocTypeId(DOC_BASE_TYPE.AR_RECEIPT, {
            orgId,
            isSOTrx: IS_SO_TRX.SALES, // AR Receipt = penerimaan uang dari Sales
        });
        
        // Gunakan Bank Account yang dipilih user dari modal jika ada, jika tidak cari default
        const bankAccountId = customBankAccountId || await fetchDefaultBankAccount(orgId, currencyId);

        const todayISO = new Date().toISOString().split('T')[0];

        // ── KUNCI FIX PAYAMT ──────────────────────────────────────────────
        // Pembayaran tidak boleh melebihi GrandTotal Invoice agar tidak menjadi overpayment/utang mengambang
        const invoiceTotal = parseFloat(invoice.GrandTotal || 0);
        const tenderedAmt  = parseFloat(rawPayAmt || 0);
        const actualPayAmt = Math.min(tenderedAmt, invoiceTotal);

        const paymentPayload = {
            AD_Client_ID:     { id: parseInt(clientId) },
            AD_Org_ID:        { id: parseInt(orgId) },
            C_DocType_ID:     { id: parseInt(arDocTypeId) },
            C_BankAccount_ID: { id: parseInt(bankAccountId) },
            C_BPartner_ID:    typeof invoice.C_BPartner_ID === 'object' ? invoice.C_BPartner_ID : { id: parseInt(invoice.C_BPartner_ID) },
            C_Invoice_ID:     { id: parseInt(invoiceId) }, // Trigger auto-allocation saat CO
            C_Currency_ID:    typeof invoice.C_Currency_ID === 'object' ? invoice.C_Currency_ID : { id: parseInt(currencyId) },
            PayAmt:           actualPayAmt, // Nominal pas pelunasan (misal 3000)
            TenderType:       tenderType,
            DateTrx:          todayISO,
            DateAcct:         todayISO,
            IsReceipt:        true,
        };

        const createdPayment = await idempiereApi("/models/c_payment", {
            method: "POST",
            body: JSON.stringify(paymentPayload),
        });
        const paymentId = createdPayment.id || createdPayment.C_Payment_ID;
        if (!paymentId) throw new Error("Gagal membuat C_Payment fallback.");

        const completedPayment = await idempiereApi(`/models/c_payment/${paymentId}`, {
            method: "PUT",
            body: JSON.stringify({ "doc-action": "CO" }),
        });

        const payStatus = docStatusOf(completedPayment);
        if (payStatus && payStatus !== 'CO') {
            throw new Error(`Payment (AR Receipt) belum Complete (status: ${payStatus}). Cek workflow Payment di iDempiere.`);
        }

        return completedPayment;
    };

    /**
     * completeAndSettle
     * Params:
     * - currentOrderData: Data order aktif
     * - cleanPaymentsArray: Array tender/pembayaran dari modal
     * - targetBankAccountId (opsional): ID Bank Account/Kas pilihan kasir dari modal
     */
    const completeAndSettle = async (currentOrderData, cleanPaymentsArray, targetBankAccountId = null) => {
        if (!currentOrderData) throw new Error("Order belum tersedia.");
    
        const orderId    = currentOrderData.id || currentOrderData.C_Order_ID;
        const adClientId = currentOrderData.AD_Client_ID?.id ?? currentOrderData.AD_Client_ID;
        const adOrgId    = currentOrderData.AD_Org_ID?.id    ?? currentOrderData.AD_Org_ID;
    
        setIsSettlingPayment(true);
        try {
            for (const payment of cleanPaymentsArray) {
                const rawTenderId = payment.C_POSTenderType_ID;
                if (!rawTenderId || isNaN(parseInt(rawTenderId))) continue;
                await idempiereApi("/models/c_pospayment", {
                    method: "POST",
                    body: JSON.stringify({
                        AD_Client_ID:       { id: parseInt(adClientId) },
                        AD_Org_ID:          { id: parseInt(adOrgId) },
                        C_Order_ID:         { id: parseInt(orderId) },
                        PayAmt:             parseFloat(payment.PayAmt || 0),
                        TenderType:         String(payment.TenderType || "X"),
                        C_POSTenderType_ID: { id: parseInt(rawTenderId) },
                    }),
                });
            }
            
            let finalPaymentRule = "M";
            if (cleanPaymentsArray?.length === 1) {
                const singleTender = cleanPaymentsArray[0]?.TenderType;
                finalPaymentRule = TENDER_TO_PAYMENTRULE[singleTender] || "M";
            }
            await idempiereApi(`/models/c_order/${orderId}`, {
                method: "PUT",
                body: JSON.stringify({ PaymentRule: finalPaymentRule }),
            });
        
            const completedOrder = await idempiereApi(`/models/c_order/${orderId}`, {
                method: "PUT",
                body: JSON.stringify({ "doc-action": "CO" }),
            });
            
            assertOrderCompleted(completedOrder, orderId);

            let invoice = await fetchInvoiceForOrder(orderId);
            
            if (isSettled(invoice)) {
                setLastPaymentStatus('auto');
                return { completedOrder, invoice, settledVia: 'auto' };
            }
    
            if (!invoice) {
                throw new Error(
                    "Order berhasil Complete tapi C_Invoice belum terbentuk. " +
                    "Cek Document Type POS: Invoice Rule harus 'Immediate'."
                );
            }
            
            const totalPayAmt  = cleanPaymentsArray.reduce((s, p) => s + parseFloat(p.PayAmt || 0), 0);
            const singleTender = cleanPaymentsArray?.length === 1 ? cleanPaymentsArray[0]?.TenderType : "X";
            await handleSubmitPayment(invoice, totalPayAmt, singleTender, targetBankAccountId);
    
            invoice = await fetchInvoiceForOrder(orderId);
            setLastPaymentStatus('manual');
            return { completedOrder, invoice, settledVia: 'manual' };
        } finally {
            setIsSettlingPayment(false);
        }
    };

    return {
        isSettlingPayment,
        lastPaymentStatus,
        completeAndSettle,
        handleSubmitPayment,
        fetchInvoiceForOrder,
    };
}