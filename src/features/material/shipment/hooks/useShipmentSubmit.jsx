import { useState, useCallback } from 'react';
import { idempiereApi } from '@/api/idempiereApi';
import { getLoginInfo } from '@/shared/hooks/useLoginInfo';
import { todayLocalISO } from '@/utils/dateOnly';

// ─────────────────────────────────────────────────────────────────────────────
// useShipmentSubmit.jsx
// Padanan useGoodsReceiptSubmit.jsx untuk sisi PENJUALAN (Material Shipment
// ke Customer, DocBaseType MMS, IsSOTrx = true).
//
// Perbedaan dari Goods Receipt:
//   1. IsSOTrx = true, C_BPartner_ID = Customer, location = alamat kirim.
//   2. Saat 'CO', iDempiere MENGURANGI stok di locator → bisa GAGAL kalau
//      stok tidak cukup (kecuali client mengizinkan negative inventory).
//      Karena header + lines sudah tersimpan sebelum CO dipanggil, kegagalan
//      CO TIDAK dianggap gagal total: dokumen dikembalikan berstatus 'Draft'
//      dengan `completeError` supaya user tahu dokumennya sudah ada dan bisa
//      di-Complete lagi dari halaman list (bukan submit ulang → duplikat).
//   3. Link ke C_OrderLine_ID tetap kunci: saat Complete, QtyDelivered di
//      C_OrderLine SO ter-update, dan invoice customer bisa di-match.
//
// submitMode ('draft' | 'complete', default 'complete') — pola sama dengan
// useGoodsReceiptSubmit.
// ─────────────────────────────────────────────────────────────────────────────
export function useShipmentSubmit({ docTypeId, description, onError }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(async (cart, {
      warehouseId,
      locatorId,
      customerId,
      customerLocationId,
      customerName,
      movementDate,
      submitMode = 'complete',
    } = {}) => {
    if (cart.length === 0) {
      onError?.('Daftar pengiriman masih kosong!');
      return null;
    }
    if (cart.some(i => !(parseFloat(i.Qty) > 0))) {
      onError?.('Ada item dengan Qty 0 / tidak valid.\nPerbaiki atau hapus item tersebut.', 'Data Belum Lengkap');
      return null;
    }
    if (cart.some(i => !i.sourceOrderLineId)) {
      onError?.('Ada item yang tidak terhubung ke baris Sales Order.\nTambahkan barang dari daftar Sales Order.', 'Data Belum Lengkap');
      return null;
    }
    const overQty = cart.filter(i => i.maxQty != null && parseFloat(i.Qty) > i.maxQty + 1e-9);
    if (overQty.length) {
      onError?.('Qty melebihi sisa kirim SO:\n' + overQty.map(i => `• ${i.Name}: ${i.Qty} (maks ${i.maxQty})`).join('\n'), 'Qty Melebihi Sisa');
      return null;
    }
    const { orgId, clientId } = getLoginInfo();

    if (!customerId || !customerLocationId) {
      onError?.('Customer penerima barang belum ditentukan.\nImport dari Sales Order dulu, atau pilih customer manual.', 'Data Belum Lengkap');
      return null;
    }
    if (!warehouseId || !locatorId) {
      onError?.('Gudang/lokasi asal pengiriman belum ditentukan.', 'Data Belum Lengkap');
      return null;
    }
    if (!orgId || !clientId) {
      onError?.('Data sesi tidak lengkap.\nSilakan login kembali.', 'Error');
      return null;
    }

    setIsSubmitting(true);
    try {
      const effectiveDate = movementDate || todayLocalISO();

      // Semua item dari satu SO yang sama → ikutkan di header.
      const orderIds = [...new Set(cart.map(i => i.sourceOrderId).filter(Boolean))];
      const singleOrderId = orderIds.length === 1 ? orderIds[0] : null;

      // ── 1. Header M_InOut (Draft) ───────────────────────────────────────
      const headerRes = await idempiereApi('/models/m_inout', {
        method: 'POST',
        body: JSON.stringify({
          AD_Client_ID:            { id: clientId },
          AD_Org_ID:               { id: orgId },
          C_DocType_ID:            { id: docTypeId },
          C_BPartner_ID:           { id: parseInt(customerId) },
          C_BPartner_Location_ID:  { id: parseInt(customerLocationId) },
          M_Warehouse_ID:          { id: parseInt(warehouseId) },
          MovementDate:            effectiveDate,
          DateAcct:                effectiveDate,
          IsSOTrx:                 true, // sisi penjualan: barang KELUAR ke customer
          Description:             description,
          IsActive:                true,
          ...(singleOrderId ? { C_Order_ID: { id: singleOrderId } } : {}),
        }),
      });

      const inOutId = headerRes.id ?? headerRes.M_InOut_ID;
      if (!inOutId) throw new Error('Gagal mendapatkan M_InOut_ID dari server.');

      // ── 2. Lines ────────────────────────────────────────────────────────
      for (const item of cart) {
        const uom         = item.selectedUom || { C_UOM_ID: item.C_UOM_ID, multiplyRate: 1 };
        const qtyEntered  = parseFloat(item.Qty);
        const movementQty = qtyEntered * (uom.multiplyRate || 1);

        await idempiereApi('/models/m_inoutline', {
          method: 'POST',
          body: JSON.stringify({
            AD_Org_ID:      { id: orgId },
            M_InOut_ID:     { id: inOutId },
            M_Product_ID:   { id: parseInt(item.M_Product_ID) },
            M_Locator_ID:   { id: parseInt(locatorId) },
            C_UOM_ID:       { id: parseInt(uom.C_UOM_ID) },
            QtyEntered:     qtyEntered,
            MovementQty:    movementQty,
            ...(item.sourceOrderLineId
              ? { C_OrderLine_ID: { id: item.sourceOrderLineId } }
              : {}),
          }),
        });
      }

      // ── 3. Complete / biarkan Draft ─────────────────────────────────────
      let docNo;
      let statusLabel;
      let completeError = null;

      if (submitMode === 'complete') {
        try {
          const completedRes = await idempiereApi(`/models/m_inout/${inOutId}`, {
            method: 'PUT',
            body: JSON.stringify({ 'doc-action': 'CO' }),
          });
          docNo = completedRes.DocumentNo || `SHP-${inOutId}`;
          statusLabel = 'Completed';
        } catch (coErr) {
          // Paling umum: stok tidak cukup di locator. Dokumen sudah ada (Draft).
          completeError = coErr.message;
          statusLabel = 'Draft';
        }
      } else {
        statusLabel = 'Draft';
      }

      if (!docNo) {
        const draftRes = await idempiereApi(`/models/m_inout/${inOutId}?$select=DocumentNo,DocStatus`);
        docNo = draftRes.DocumentNo || `SHP-${inOutId}`;
      }

      return {
        documentNo:    docNo,
        status:        statusLabel, // 'Draft' | 'Completed'
        completeError,              // terisi kalau CO gagal → dokumen tetap Draft
        date:          new Date().toLocaleString('id-ID'),
        customerName:  customerName || `#${customerId}`,
        items:         [...cart],
      };
    } catch (err) {
      const action = submitMode === 'complete' ? 'membuat' : 'menyimpan draft';
      onError?.(`Gagal ${action} Pengiriman Barang:\n\n` + err.message, 'Error');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [docTypeId, description, onError]);

  return { submit, isSubmitting };
}
