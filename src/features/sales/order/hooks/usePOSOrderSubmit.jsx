import { useState } from 'react';
import { idempiereApi } from '@/api/idempiereApi';

/**
 * usePOSOrderSubmit
 * ------------------
 * Tanggung jawab: HANYA membuat/mengupdate C_Order + C_OrderLine (draft/edit mode),
 * TIDAK menangani payment. Menggantikan logic handleCheckout yang sebelumnya
 * inline di POSContainer.jsx.
 *
 * Payload builder (preparePayloadForIdempiere) dipindah utuh dari POSContainer,
 * tidak ada perubahan logic di sini — hanya lokasi.
 */
export function usePOSOrderSubmit({ posConfig, cart, selectedBPartner, selectedPriceList }) {
    const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
    const [currentOrderData, setCurrentOrderData] = useState(null);

    const preparePayloadForIdempiere = () => {
        if (!posConfig) throw new Error("Konfigurasi C_POS belum dimuat.");

        const extractId = (field) => {
            const extracted = field?.id?.id ?? field?.id ?? (typeof field === 'number' ? field : undefined);
            const parsed = parseInt(extracted);
            return isNaN(parsed) ? null : parsed;
        };

        const toIdMurni = (field, name) => {
            const result = extractId(field);
            if (result === null) {
                console.warn(`Peringatan: Field ${name} tidak memiliki ID numerik valid.`, field);
            }
            return result;
        };

        const adClientId  = toIdMurni(posConfig.AD_Client_ID, "AD_Client_ID");
        const adOrgId     = toIdMurni(posConfig.AD_Org_ID, "AD_Org_ID");
        const bPartnerId  = selectedBPartner?.id ?? toIdMurni(posConfig.C_BPartner_ID, "C_BPartner_ID");
        const warehouseId = toIdMurni(posConfig.M_Warehouse_ID, "M_Warehouse_ID");
        const docTypeId   = toIdMurni(posConfig.C_DocType_ID, "C_DocType_ID");
        const priceListId = selectedPriceList?.id ?? toIdMurni(posConfig.M_PriceList_ID, "M_PriceList_ID");
        const salesRepId  = toIdMurni(posConfig.SalesRep_ID, "SalesRep_ID");

        const posId = extractId(posConfig.id)
                   ?? extractId(posConfig.C_POS_ID)
                   ?? extractId(posConfig);

        if (!bPartnerId)  throw new Error("C_BPartner_ID tidak valid. Isi field Business Partner pada setup POS.");
        if (!docTypeId)   throw new Error("C_DocType_ID tidak valid di konfigurasi POS.");
        if (!warehouseId) throw new Error("M_Warehouse_ID tidak valid di konfigurasi POS.");
        if (!posId)       throw new Error("C_POS_ID tidak valid. Pastikan variabel state posConfig memuat ID Terminal POS.");

        const formattedLines = cart.map((item) => {
            const multiplyRate = item.selectedUOM?.multiplyRate || 1;
            const qtyEntered   = parseFloat(item.Qty ?? item.QtyEntered ?? 1);
            const priceEntered = parseFloat(item.PriceEntered || 0);
            const qtyOrdered   = multiplyRate ? qtyEntered / multiplyRate : qtyEntered;
            const priceOrdered = priceEntered * multiplyRate;
        
            const line = {
                AD_Org_ID:    { id: adOrgId },
                M_Product_ID: { id: parseInt(item.M_Product_ID?.id ?? item.M_Product_ID) },
                QtyEntered:   qtyEntered,
                QtyOrdered:   qtyOrdered,
                PriceEntered: priceEntered,
                PriceActual:  priceOrdered,
            };
        
            const uomId = toIdMurni(item.selectedUOM, "C_UOM_ID");
            if (uomId) line.C_UOM_ID = { id: uomId };
        
            return line;
        });

        const todayISO = new Date().toISOString().split('T')[0];

        const payload = {
            AD_Client_ID:       { id: adClientId },
            AD_Org_ID:          { id: adOrgId },
            C_DocTypeTarget_ID: { id: docTypeId },
            C_DocType_ID:       { id: docTypeId },
            C_BPartner_ID:      { id: bPartnerId },
            M_Warehouse_ID:     { id: warehouseId },
            M_PriceList_ID:     { id: priceListId },
            DateOrdered:        todayISO,
            DatePromised:       todayISO,
            PaymentRule:        "M",
            c_orderline:        formattedLines,
            IsSOTrx:            "Y",
            Description:        "POS Transaction",
            C_POS_ID:           { id: posId },
        };

        if (salesRepId) payload.SalesRep_ID = { id: salesRepId };

        return payload;
    };

    /**
     * submitOrder — buat order baru ATAU update order draft yang sedang diedit.
     * Return: createdOrder (record C_Order lengkap dari API).
     */
    const submitOrder = async ({ isEditMode, editOrderId }) => {
        if (cart.length === 0) throw new Error("Keranjang masih kosong!");

        setIsProcessingCheckout(true);
        try {
            let orderId;
            let createdOrder;

            if (isEditMode && editOrderId) {
                await idempiereApi(`/models/c_order/${editOrderId}`, {
                    method: "PUT",
                    body: JSON.stringify({
                        C_BPartner_ID:  { id: selectedBPartner?.id },
                        M_PriceList_ID: { id: selectedPriceList?.id },
                    }),
                });

                const oldLinesRes = await idempiereApi(
                    `/models/c_orderline?$filter=C_Order_ID eq ${editOrderId}&$select=C_OrderLine_ID`
                );
                const oldLines = Array.isArray(oldLinesRes.records) ? oldLinesRes.records : [];
                for (const line of oldLines) {
                    const lineId = line.id ?? line.C_OrderLine_ID;
                    await idempiereApi(`/models/c_orderline/${lineId}`, { method: "DELETE" });
                }

                const adOrgId = posConfig?.AD_Org_ID?.id ?? posConfig?.AD_Org_ID;
                for (const item of cart) {
                    const multiplyRate = item.selectedUOM?.multiplyRate || 1;
                    const qtyEntered   = parseFloat(item.Qty ?? item.QtyEntered ?? 1);
                    const priceEntered = parseFloat(item.PriceEntered || 0);
                    const qtyOrdered   = multiplyRate ? qtyEntered / multiplyRate : qtyEntered;
                    const priceOrdered = priceEntered * multiplyRate;


                    await idempiereApi("/models/c_orderline", {
                        method: "POST",
                        body: JSON.stringify({
                            C_Order_ID:   { id: editOrderId },
                            AD_Org_ID:    { id: adOrgId },
                            M_Product_ID: { id: parseInt(item.M_Product_ID) },
                            QtyEntered:   qtyEntered,
                            QtyOrdered:   qtyOrdered,
                            PriceEntered: priceEntered,
                            PriceActual:  priceOrdered,
                            C_UOM_ID:     { id: item.selectedUOM?.id },
                        }),
                    });
                }
                orderId      = editOrderId;
                createdOrder = await idempiereApi(`/models/c_order/${editOrderId}`);

            } else {
                const orderPayload = preparePayloadForIdempiere();
                createdOrder       = await idempiereApi("/models/c_order", {
                    method: "POST",
                    body: JSON.stringify(orderPayload),
                });
                orderId = createdOrder.id || createdOrder.C_Order_ID;
            }

            if (!orderId) throw new Error("Gagal mengambil C_Order_ID dari server.");

            setCurrentOrderData(createdOrder);
            return createdOrder;
        } finally {
            setIsProcessingCheckout(false);
        }
    };

    return {
        isProcessingCheckout,
        currentOrderData,
        setCurrentOrderData,
        submitOrder,
    };
}