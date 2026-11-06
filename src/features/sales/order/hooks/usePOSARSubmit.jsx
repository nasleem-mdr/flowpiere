import { useState } from 'react';
import { idempiereApi } from '@/api/idempiereApi';

/**
 * usePOSARSubmit
 * ----------------
 * Alur "Piutang" (penjualan kredit) dari kasir POS:
 * Order (CO) → Shipment (CO) → Invoice (CO) — TANPA Payment/Receipt.
 * Piutang tetap terbuka di C_BPartner sampai dilunasi lewat modul
 * penerimaan piutang terpisah (mis. AR Receipt manual).
 */
export function usePOSARSubmit() {
    const [isProcessingAR, setIsProcessingAR] = useState(false);
    const [lastARStatus, setLastARStatus]     = useState(null); // 'ok' | null

    const fetchInvoiceForOrder = async (orderId) => {
        const res = await idempiereApi(
            `/models/c_invoice?$filter=C_Order_ID eq ${orderId}` +
            `&$select=C_Invoice_ID,DocumentNo,DocStatus,GrandTotal&$top=1`
        );
        return res?.records?.[0] || null;
    };

    const fetchShipmentForOrder = async (orderId) => {
        const res = await idempiereApi(
            `/models/m_inout?$filter=C_Order_ID eq ${orderId}` +
            `&$select=M_InOut_ID,DocumentNo,DocStatus&$top=1`
        );
        return res?.records?.[0] || null;
    };

    const docStatusOf = (rec) => rec?.DocStatus?.id ?? rec?.DocStatus ?? null;

    // Order kena approval workflow → status IP, Shipment/Invoice tidak ter-generate.
    // POS harus bypass workflow, jadi hentikan dengan pesan yang jelas.
    const assertOrderCompleted = (order, orderId) => {
        const st = docStatusOf(order);
        if (!st || st === 'CO' || st === 'CL') return;
        throw new Error(
          `Order POS ${order?.DocumentNo ?? '#' + orderId} masuk approval workflow (status ${st}), sehingga Shipment/Invoice tidak terbentuk. ` +
      `Transaksi POS harus bypass workflow: pasang Transition Condition IsSOTrx = false pada transisi ke node QC Check di workflow Process_Order. ` +
      `Order ini sudah terbentuk dengan status ${st} — selesaikan atau Void manual di iDempiere sebelum mengulang, supaya tidak ada transaksi ganda.`
        );
    };

    const assertDocCompleted = (rec, label) => {
        const st = docStatusOf(rec);
        if (st && st !== 'CO' && st !== 'CL') {
            throw new Error(`${label} ${rec?.DocumentNo ?? ''} belum Complete (status: ${st}). Cek workflow ${label} di iDempiere.`);
        }
    };

    const completeDoc = async (model, id) => {
        return idempiereApi(`/models/${model}/${id}`, {
            method: "PUT",
            body: JSON.stringify({ "doc-action": "CO" }),
        });
    };

    /**
     * completeAsAR — proses Order → Shipment → Invoice, tanpa Payment.
     * @param {object} currentOrderData - hasil dari submitOrder() (usePOSOrderSubmit)
     */
    const completeAsAR = async (currentOrderData) => {
        if (!currentOrderData) throw new Error("Order belum tersedia.");
        const orderId = currentOrderData.id || currentOrderData.C_Order_ID;

        setIsProcessingAR(true);
        try {
            // 1. Tandai order sebagai kredit (On Credit), bukan Cash/Mixed
            await idempiereApi(`/models/c_order/${orderId}`, {
                method: "PUT",
                body: JSON.stringify({ PaymentRule: "P" }), // P = On Credit
            });

            // 2. Complete Order — memicu auto-generate Shipment/Invoice
            //    SESUAI DeliveryRule & InvoiceRule pada C_DocType Order ybs.
            //    (DeliveryRule harus 'Availability'/'Force', InvoiceRule 'Immediate'/'After Delivery')
            const completedOrder = await completeDoc('c_order', orderId);
            assertOrderCompleted(completedOrder, orderId);

            // 3. Pastikan Shipment ter-generate, lalu Complete kalau masih draft
            let shipment = await fetchShipmentForOrder(orderId);
            if (!shipment) {
                throw new Error(
                    "Order Complete tapi Shipment (M_InOut) belum terbentuk otomatis. " +
                    "Cek DeliveryRule pada C_DocType Order yang dipakai POS — harus auto-generate shipment saat Complete."
                );
            }
            if (docStatusOf(shipment) === 'DR' || docStatusOf(shipment) === 'IP') {
                shipment = await completeDoc('m_inout', shipment.id ?? shipment.M_InOut_ID);
                assertDocCompleted(shipment, 'Shipment');
            }

            // 4. Pastikan Invoice ter-generate, lalu Complete kalau masih draft
            let invoice = await fetchInvoiceForOrder(orderId);
            if (!invoice) {
                throw new Error(
                    "Shipment Complete tapi C_Invoice belum terbentuk otomatis. " +
                    "Cek InvoiceRule pada C_DocType Order — harus auto-generate invoice saat Complete/Deliver."
                );
            }
            if (docStatusOf(invoice) === 'DR' || docStatusOf(invoice) === 'IP') {
                invoice = await completeDoc('c_invoice', invoice.id ?? invoice.C_Invoice_ID);
                assertDocCompleted(invoice, 'Invoice');
            }

            setLastARStatus('ok');
            return { completedOrder, shipment, invoice };
        } finally {
            setIsProcessingAR(false);
        }
    };

    return { isProcessingAR, lastARStatus, completeAsAR };
}