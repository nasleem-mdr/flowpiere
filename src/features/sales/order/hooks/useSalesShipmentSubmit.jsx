import { useState, useCallback, useRef } from 'react';
import { idempiereApi, fkId } from '@/api/idempiereApi';
import { getLoginInfo } from '@/shared/hooks/useLoginInfo';
import { waitForDocStatus } from '@/utils/docStatusWaiter';
import { resolveDocTypeId, DOC_BASE_TYPE } from '@/utils/docTypeResolver';

/** ─────────────────────────────────────────────────────────────────────────────
* useSalesShipmentSubmit.jsx
* Generate M_InOut (Customer Shipment) dari C_Order yang SUDAH Complete —
* dipanggil terpisah dari useSalesOrderSubmit supaya kalau shipment gagal
* (mis. stok kurang), Order tetap Complete dan bisa di-retry shipment-nya
* saja tanpa mengulang Order. Invoice TIDAK dibuat di sini — ditagih via
* proses batch akhir bulan di luar aplikasi ini.
* ─────────────────────────────────────────────────────────────────────────────
*/

const codeOf = (v) => (v && typeof v === 'object' ? v.id : v);

export function useSalesShipmentSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlightRef = useRef(new Set());   // anti dobel-klik per Order

  const createShipmentFromOrder = useCallback(async (orderId, { locatorId } = {}) => {
    if (!orderId) throw new Error('Order ID tidak valid.');
    if (!locatorId) throw new Error('Locator tujuan pengiriman belum ditentukan.');

    if (inFlightRef.current.has(orderId)) {
      throw new Error('Pembuatan Shipment untuk Order ini sedang berjalan.');
    }
    inFlightRef.current.add(orderId);
    setIsSubmitting(true);
    try {
      const { orgId, clientId } = getLoginInfo();
      const todayISO = new Date().toISOString().split('T')[0];

      // ── Ambil header order (untuk BPartner/Warehouse) + lines ──────────
      const order = await idempiereApi(`/models/c_order/${orderId}`);
      const customerId = fkId(order.C_BPartner_ID) ?? order.C_BPartner_ID?.id;
      const customerLocId = fkId(order.C_BPartner_Location_ID) ?? order.C_BPartner_Location_ID?.id;
      const warehouseId = fkId(order.M_Warehouse_ID) ?? order.M_Warehouse_ID?.id;

      const linesRes = await idempiereApi(
        `/models/c_orderline?$filter=C_Order_ID eq ${orderId}` +
        `&$select=C_OrderLine_ID,M_Product_ID,C_UOM_ID,QtyEntered,QtyOrdered`
      );
      const orderLines = Array.isArray(linesRes.records) ? linesRes.records : [];
      if (orderLines.length === 0) throw new Error('Order tidak memiliki baris item untuk dikirim.');

      // ── Idempotensi: jangan buat Shipment ganda untuk Order yang sama ───
      const existingRes = await idempiereApi(
        `/models/m_inout?$filter=C_Order_ID eq ${orderId}&$select=M_InOut_ID,DocumentNo,DocStatus`
      );
      const alive = (Array.isArray(existingRes.records) ? existingRes.records : [])
        .filter(s => !['VO', 'RE'].includes(codeOf(s.DocStatus)));
      const idOf = (s) => s.id ?? s.M_InOut_ID;

      const completed = alive.find(s => codeOf(s.DocStatus) === 'CO');
      if (completed) return { shipmentId: idOf(completed), documentNo: completed.DocumentNo, reused: true };

      const busy = alive.find(s => !['DR', 'IN'].includes(codeOf(s.DocStatus)));
      if (busy) {
        throw new Error(`Shipment ${busy.DocumentNo} untuk Order ini berstatus ${codeOf(busy.DocStatus)} (sedang diproses/menunggu approval). Jangan dibuat ulang — cek di window Shipment (Customer).`);
      }

      let shipmentId = null;
      const draft = alive.find(s => ['DR', 'IN'].includes(codeOf(s.DocStatus)));
      if (draft) {
        // Draft sisa percobaan sebelumnya: pakai ulang bila barisnya lengkap
        const draftLines = await idempiereApi(`/models/m_inoutline?$filter=M_InOut_ID eq ${idOf(draft)}&$select=M_InOutLine_ID`);
        const n = Array.isArray(draftLines.records) ? draftLines.records.length : 0;
        if (n !== orderLines.length) {
          throw new Error(`Shipment Draft ${draft.DocumentNo} sudah ada tapi barisnya tidak lengkap (${n}/${orderLines.length}). Void/hapus dulu Shipment itu, lalu ulangi.`);
        }
        shipmentId = idOf(draft);
      }

      const shipDocTypeId = shipmentId ? null : await resolveDocTypeId(DOC_BASE_TYPE.MATERIAL_SHIPMENT ?? DOC_BASE_TYPE.MATERIAL_DELIVERY, { orgId });

      // ── Header Shipment ────────────────────────────────────────────────
      if (!shipmentId) {
      const shipmentRes = await idempiereApi('/models/m_inout', {
        method: 'POST',
        body: JSON.stringify({
          AD_Client_ID: { id: clientId },
          AD_Org_ID:    { id: orgId },
          C_DocType_ID: { id: shipDocTypeId },
          C_Order_ID:   { id: parseInt(orderId) },
          C_BPartner_ID: { id: parseInt(customerId) },
          ...(customerLocId ? { C_BPartner_Location_ID: { id: parseInt(customerLocId) } } : {}),
          M_Warehouse_ID: { id: parseInt(warehouseId) },
          MovementDate: todayISO,
          MovementType: 'C-', // Customer Shipment
          IsSOTrx:      true,
          Description:  'Auto-shipment dari Sales Order (batch invoice)',
        }),
      });
      shipmentId = fkId(shipmentRes.id) ?? shipmentRes.id ?? shipmentRes.M_InOut_ID;
      if (!shipmentId) throw new Error('Gagal mendapatkan M_InOut_ID (Shipment).');

      // ── Lines — link ke C_OrderLine_ID per baris (3-way matching) ──────
      for (const line of orderLines) {
        const lineId    = line.id ?? line.C_OrderLine_ID;
        const productId = fkId(line.M_Product_ID) ?? line.M_Product_ID?.id;
        const uomId      = fkId(line.C_UOM_ID) ?? line.C_UOM_ID?.id;
        const qtyEntered = parseFloat(line.QtyEntered ?? 0);
        const movementQty = parseFloat(line.QtyOrdered ?? qtyEntered);

        await idempiereApi('/models/m_inoutline', {
          method: 'POST',
          body: JSON.stringify({
            AD_Org_ID:      { id: orgId },
            M_InOut_ID:     { id: shipmentId },
            M_Product_ID:   { id: parseInt(productId) },
            M_Locator_ID:   { id: parseInt(locatorId) },
            C_UOM_ID:       { id: parseInt(uomId) },
            QtyEntered:     qtyEntered,
            MovementQty:    movementQty,
            C_OrderLine_ID: { id: parseInt(lineId) },
          }),
        });
      }

      } // end if (!shipmentId)

      // ── Complete ────────────────────────────────────────────────────────
      await idempiereApi(`/models/m_inout/${shipmentId}`, {
        method: 'PUT',
        body: JSON.stringify({ 'doc-action': 'CO' }),
      });
      const status = await waitForDocStatus('m_inout', shipmentId);
      if (!status.success) throw new Error(`Shipment gagal Complete (status: ${status.status})`);

      return { shipmentId, documentNo: status.documentNo };
    } finally {
      inFlightRef.current.delete(orderId);
      setIsSubmitting(false);
    }
  }, []);

  return { createShipmentFromOrder, isSubmitting };
}