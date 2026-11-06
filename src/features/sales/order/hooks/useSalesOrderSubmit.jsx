import { useState, useCallback } from 'react';
import { idempiereApi, fkId } from '@/api/idempiereApi';
import { getLoginInfo } from '@/shared/hooks/useLoginInfo';
import { waitForDocStatus } from '@/utils/docStatusWaiter';

// ─────────────────────────────────────────────────────────────────────────────
// useSalesOrderSubmit.jsx
// Sales Order "Standard Order" biasa (bukan POS) — customer datang ambil
// barang, invoice-nya TIDAK dibuat di sini (ditagih batch akhir bulan lewat
// proses terpisah). Tanggung jawab hook ini CUMA C_Order + C_OrderLine:
// buat draft, atau buat lalu langsung Complete. Shipment dibuat oleh hook
// terpisah (useSalesShipmentSubmit) SETELAH Order berstatus Complete —
// supaya kalau shipment gagal, Order yang sudah Complete tidak perlu
// diulang dari nol.
//
// Pola sama dengan usePurchaseOrderSubmit, dibalik sisi SOTrx:
//   - IsSOTrx: true  (boolean, sesuai konvensi project — bukan 'Y')
//   - C_DocTypeTarget_ID / C_DocType_ID: DocType "Standard Order" yang
//     dipilih user dari dropdown di container (BUKAN hardcode).
//   - PaymentRule: 'P' (On Credit) — karena penagihan batch, bukan cash.
// ─────────────────────────────────────────────────────────────────────────────
export function useSalesOrderSubmit({ docTypeId, description, onError }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitOrder = useCallback(async (cart, {
    customerId,
    customerLocationId,
    warehouseId,
    priceListId,
    isEditMode = false,
    editOrderId = null,
  } = {}) => {
    if (cart.length === 0) {
      onError?.('Keranjang masih kosong!');
      return null;
    }
    if (!docTypeId) {
      onError?.('Document Type Sales Order belum dipilih.', 'Data Belum Lengkap');
      return null;
    }
    if (!customerId) {
      onError?.('Customer belum ditentukan.', 'Data Belum Lengkap');
      return null;
    }
    if (!warehouseId) {
      onError?.('Gudang belum ditentukan.', 'Data Belum Lengkap');
      return null;
    }

    const { orgId, clientId } = getLoginInfo();
    const todayISO = new Date().toISOString().split('T')[0];

    setIsSubmitting(true);
    try {
      let orderId;
      let orderRes;

      if (isEditMode && editOrderId) {
        // ── Edit draft: update header, lalu delete+recreate lines. ──────
        // (Kalau instance kamu sudah pakai diff-based strategy seperti
        // usePurchaseOrderSubmit terbaru — kirim file itu, saya samakan.
        // Untuk sekarang dipakai pola delete-all-reinsert seperti
        // usePOSOrderSubmit, karena Standard Order belum MRP-dependent.)
        await idempiereApi(`/models/c_order/${editOrderId}`, {
          method: 'PUT',
          body: JSON.stringify({
            C_BPartner_ID: { id: parseInt(customerId) },
            ...(customerLocationId ? { C_BPartner_Location_ID: { id: parseInt(customerLocationId) } } : {}),
            M_Warehouse_ID: { id: parseInt(warehouseId) },
            ...(priceListId ? { M_PriceList_ID: { id: parseInt(priceListId) } } : {}),
            Description: description,
          }),
        });

        const oldLinesRes = await idempiereApi(
          `/models/c_orderline?$filter=C_Order_ID eq ${editOrderId}&$select=C_OrderLine_ID`
        );
        const oldLines = Array.isArray(oldLinesRes.records) ? oldLinesRes.records : [];
        for (const line of oldLines) {
          await idempiereApi(`/models/c_orderline/${line.id ?? line.C_OrderLine_ID}`, { method: 'DELETE' });
        }

        orderId  = editOrderId;
        orderRes = await idempiereApi(`/models/c_order/${editOrderId}`);
      } else {
        orderRes = await idempiereApi('/models/c_order', {
          method: 'POST',
          body: JSON.stringify({
            AD_Client_ID: { id: clientId },
            AD_Org_ID:    { id: orgId },
            C_DocType_ID: { id: docTypeId },
            C_DocTypeTarget_ID: { id: docTypeId },
            C_BPartner_ID: { id: parseInt(customerId) },
            ...(customerLocationId ? { C_BPartner_Location_ID: { id: parseInt(customerLocationId) } } : {}),
            M_Warehouse_ID: { id: parseInt(warehouseId) },
            ...(priceListId ? { M_PriceList_ID: { id: parseInt(priceListId) } } : {}),
            DateOrdered:  todayISO,
            DatePromised: todayISO,
            IsSOTrx:      true,
            PaymentRule:  'P', // On Credit — ditagih batch akhir bulan
            Description:  description || 'Sales Order (Batch Invoice)',
          }),
        });
        orderId = fkId(orderRes.id) ?? orderRes.id ?? orderRes.C_Order_ID;
      }

      if (!orderId) throw new Error('Gagal mendapatkan C_Order_ID.');

      for (const item of cart) {
        const uomId         = item.selectedUOM?.id ?? item.C_UOM_ID ?? null;
        const multiplyRate  = item.selectedUOM?.multiplyRate || 1;
        const qtyEntered    = parseFloat(item.Qty ?? item.QtyEntered ?? 1);
        const priceEntered  = parseFloat(item.PriceEntered ?? item.Price ?? 0);
        const qtyOrdered    = multiplyRate ? qtyEntered / multiplyRate : qtyEntered;
        const priceOrdered  = priceEntered * multiplyRate;

        if (!uomId) {
        throw new Error(`Produk "${item.Name || item.M_Product_ID}" tidak punya UOM valid — tidak bisa disubmit.`);
        }
        await idempiereApi('/models/c_orderline', {
            method: 'POST',
            body: JSON.stringify({
              AD_Org_ID:    { id: orgId },
              C_Order_ID:   { id: orderId },
              M_Product_ID: { id: parseInt(item.M_Product_ID) },
              C_UOM_ID:     { id: parseInt(uomId) },
              QtyEntered:   qtyEntered,
              QtyOrdered:   qtyOrdered,
              PriceEntered: priceEntered,
              PriceActual:  priceOrdered,
            }),
          });
      }

      return { orderId, orderRes };
    } catch (err) {
      onError?.(err.message, 'Gagal Submit Sales Order');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [docTypeId, description, onError]);

  const completeOrder = useCallback(async (orderId) => {
    if (!orderId) throw new Error('Order ID tidak valid.');
    await idempiereApi(`/models/c_order/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify({ 'doc-action': 'CO' }),
    });
    const status = await waitForDocStatus('c_order', orderId);
    if (!status.success) throw new Error(`Sales Order gagal Complete (status: ${status.status})`);
    return status; // { success, status, documentNo }
  }, []);

  return { submitOrder, completeOrder, isSubmitting };
}