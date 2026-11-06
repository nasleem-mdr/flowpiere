import { useState, useCallback } from 'react';
import { idempiereApi, fkId } from '@/api/idempiereApi';
import { getLoginInfo } from '@/shared/hooks/useLoginInfo';
import { todayLocalISO } from '@/utils/dateOnly';

// ─────────────────────────────────────────────────────────────────────────────
// useGoodsReceiptSubmit.jsx (REVISI)
// Perubahan dari versi sebelumnya (yang sumbernya masih Requisition):
//   1. Setiap line yang berasal dari import PO (item.sourceOrderLineId) akan
//      mengisi M_InOutLine.C_OrderLine_ID → ini yang membuat 3-way matching
//      (PO vs Receipt vs Invoice) jalan otomatis di iDempiere, dan yang
//      men-trigger update QtyDelivered di C_OrderLine saat dokumen di-Complete.
//   2. Kalau SELURUH item di cart berasal dari PO yang sama (satu sesi
//      penerimaan = satu PO, kasus paling umum), header M_InOut ikut diisi
//      C_Order_ID. Kalau campuran (beberapa PO / ada item manual), header
//      C_Order_ID dibiarkan kosong — relasi tetap tercatat per-line lewat
//      C_OrderLine_ID, jadi tidak ada data yang hilang.
//
// submitMode ('draft' | 'complete', default 'complete') — SAMA pola dengan
// useRequisitionSubmit.jsx / usePurchaseOrderSubmit.jsx:
//   - 'complete' -> doc-action 'CO' dipanggil setelah lines tersimpan
//                   (workflow jalan, QtyDelivered di C_OrderLine ter-update).
//   - 'draft'    -> TIDAK ada doc-action yang dipanggil -> M_InOut tetap
//                   Drafted. PENTING: karena 3-way matching (update
//                   QtyDelivered) baru terjadi saat dokumen di-Complete,
//                   draft di sini murni "simpan dulu" — belum ada efek apa
//                   pun ke C_OrderLine terkait sampai nanti di-Complete.
// ─────────────────────────────────────────────────────────────────────────────
const fmtQ = (n) => Number(Number(n).toFixed(2)).toLocaleString('id-ID');

const overReceiptMessage = ({ name, lineNo, uomName, ordered, delivered, attempted }) =>
  `Qty penerimaan melebihi sisa Purchase Order.\n\n` +
  `Produk: ${name}${lineNo ? ` (line PO ${lineNo})` : ''}\n` +
  `• Qty di PO: ${fmtQ(ordered)} ${uomName}\n` +
  `• Sudah diterima sebelumnya: ${fmtQ(delivered)} ${uomName}\n` +
  `• Maksimal diterima sekarang: ${fmtQ(ordered - delivered)} ${uomName}\n` +
  `• Qty yang Anda input: ${fmtQ(attempted)} ${uomName}\n\n` +
  `Yang perlu dilakukan: kurangi Qty produk ini menjadi maksimal ${fmtQ(ordered - delivered)} ${uomName}, lalu submit ulang. ` +
  `Kalau barang yang datang memang lebih banyak dari PO, minta bagian Purchasing merevisi PO terlebih dahulu.`;

// Terjemahkan error "Failed to update match po" dari server (angkanya satuan dasar).
function explainOverReceiptError(message, cart) {
  const m = String(message).match(
    /MatchedDeliveredQty=([\d.]+),\s*OrderedQty=([\d.]+).*?MOrderLine\[(\d+),\s*Line=(\d+),\s*Ordered=([\d.]+),\s*Delivered=([\d.]+)/s
  );
  if (!m) return null;
  const [, matched, , lineId, lineNo, ordered, delivered] = m;
  const item = cart.find((i) => String(i.sourceOrderLineId) === lineId);
  const rate = item?.selectedUom?.multiplyRate || 1;
  const toEntered = (base) => parseFloat(base) / rate;
  return overReceiptMessage({
    name: item?.Name || `line PO #${lineId}`,
    lineNo,
    uomName: item?.selectedUom?.Name || item?.C_UOM_Name || '',
    ordered: toEntered(ordered),
    delivered: toEntered(delivered),
    attempted: toEntered(parseFloat(matched) - parseFloat(delivered)),
  });
}

export function useGoodsReceiptSubmit({ docTypeId, description, onError }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(async (cart, {
      warehouseId,
      locatorId,
      vendorId,
      vendorLocationId,
      vendorName,
      movementDate,
      submitMode = 'complete',
    } = {}) => {
    if (cart.length === 0) {
      onError?.('Daftar penerimaan masih kosong!');
      return null;
    }

    const { orgId, clientId } = getLoginInfo();
    
    if (!vendorId || !vendorLocationId) {
      onError?.('Vendor pengirim barang belum ditentukan.\nImport dari Purchase Order dulu, atau pilih vendor manual.', 'Data Belum Lengkap');
      return null;
    }
    if (!warehouseId || !locatorId) {
      onError?.('Gudang/lokasi tujuan penerimaan belum ditentukan.', 'Data Belum Lengkap');
      return null;
    }
    if (!orgId || !clientId) {
      onError?.('Data sesi tidak lengkap.\nSilakan login kembali.', 'Error');
      return null;
    }
    for (const item of cart) {
      if (item.sourceMaxQtyBase == null) continue;
      const rate = item.selectedUom?.multiplyRate || 1;
      const qtyBase = parseFloat(item.Qty) * rate;
      if (qtyBase > item.sourceMaxQtyBase + 1e-4) {
        onError?.(
          overReceiptMessage({
            name: item.Name,
            uomName: item.selectedUom?.Name || item.C_UOM_Name || '',
            ordered: item.sourceMaxQtyBase / rate,
            delivered: 0,
            attempted: parseFloat(item.Qty),
          }),
          'Qty Melebihi PO'
        );
        return null;
      }
    }
    
    setIsSubmitting(true);
    try {
      const effectiveDate = movementDate || todayLocalISO();

      // Kalau semua item cart berasal dari satu C_Order yang sama, ikutkan
      // di header — kalau tidak seragam (campuran PO / ada item manual),
      // biarkan null (relasi tetap ada per-line via C_OrderLine_ID).
      const orderIds = [...new Set(cart.map(i => i.sourceOrderId).filter(Boolean))];
      const singleOrderId = orderIds.length === 1 ? orderIds[0] : null;

      // ── 1. Buat header M_InOut (status awal Draft) ──────────────────────
      const headerRes = await idempiereApi('/models/m_inout', {
        method: 'POST',
        body: JSON.stringify({
          AD_Client_ID:            { id: clientId },
          AD_Org_ID:               { id: orgId },
          C_DocType_ID:            { id: docTypeId },
          C_BPartner_ID:           { id: parseInt(vendorId) },
          C_BPartner_Location_ID:  { id: parseInt(vendorLocationId) },
          M_Warehouse_ID:          { id: parseInt(warehouseId) },
          MovementDate:            effectiveDate,
          DateAcct:                effectiveDate,
          IsSOTrx:                 false, // sisi pembelian: barang MASUK ke gudang kita
          Description:             description,
          IsActive:                true,
          ...(singleOrderId ? { C_Order_ID: { id: singleOrderId } } : {}),
        }),
      });

      const inOutId = headerRes.id ?? headerRes.M_InOut_ID;
      if (!inOutId) throw new Error('Gagal mendapatkan M_InOut_ID dari server.');

      // ── 2. Insert lines ───────────────────────────────────────────────────
      for (const item of cart) {
        const uom          = item.selectedUom || { C_UOM_ID: item.C_UOM_ID, multiplyRate: 1 };
        const qtyEntered   = parseFloat(item.Qty);
        const movementQty  = qtyEntered * (uom.multiplyRate || 1);

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
            // ← kunci 3-way matching: kalau line ini asalnya dari PO,
            // link ke C_OrderLine_ID supaya QtyDelivered ter-update dan
            // proses match invoice nanti bisa jalan otomatis.
            ...(item.sourceOrderLineId
              ? { C_OrderLine_ID: { id: item.sourceOrderLineId } }
              : {}),
          }),
        });
      }

      // ── 3. Complete / biarkan Draft ─────────────────────────────────────
      let docNo;
      let statusLabel;

      if (submitMode === 'complete') {
        const completedRes = await idempiereApi(`/models/m_inout/${inOutId}`, {
          method: 'PUT',
          body: JSON.stringify({ 'doc-action': 'CO' }),
        });
        docNo = completedRes.DocumentNo || `RCPT-${inOutId}`;
        statusLabel = 'Completed';
      } else {
        // submitMode === 'draft' — TIDAK memanggil doc-action apa pun.
        // Header + lines sudah tersimpan di atas; dokumen tetap Drafted,
        // QtyDelivered di C_OrderLine terkait BELUM ter-update sampai
        // dokumen ini di-Complete nanti.
        const draftRes = await idempiereApi(`/models/m_inout/${inOutId}?$select=DocumentNo,DocStatus`);
        docNo = draftRes.DocumentNo || `RCPT-${inOutId}`;
        statusLabel = 'Draft';
      }

      return {
        documentNo:  docNo,
        status:      statusLabel, // 'Draft' | 'Completed'
        date:        new Date().toLocaleString('id-ID'),
        vendorName:  vendorName || `#${vendorId}`,
        items:       [...cart],
      };
    } catch (err) {
      const friendly = explainOverReceiptError(err.message, cart);
      if (friendly) {
        onError?.(
          friendly + (inOutId ? `\n\nCatatan: draft penerimaan (ID ${inOutId}) sudah tersimpan dengan qty yang salah. Hapus di iDempiere sebelum submit ulang.` : ''),
          'Qty Melebihi PO'
        );
        return null;
      }
      const action = submitMode === 'complete' ? 'membuat' : 'menyimpan draft';
      onError?.(`Gagal ${action} Penerimaan Barang:\n\n` + err.message, 'Error');
      if (inOutId && submitMode === 'complete') {
        try { await idempiereApi(`/models/m_inout/${inOutId}`, { method: 'DELETE' }); inOutId = null; } catch {}
      }
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [docTypeId, description, onError]);

  return { submit, isSubmitting };
}
