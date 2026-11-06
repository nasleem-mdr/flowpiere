import { useState, useCallback } from 'react';
import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';
import { cleanIdentifier } from '@/utils/pdf/formatIdentifier';
// ─────────────────────────────────────────────────────────────────────────────
// useShipmentInvoiceLines.js
// PERUBAHAN PENTING: TIDAK lagi mengandalkan M_InOutLine.IsInvoiced.
// iDempiere menolak update kolom itu setelah M_InOut Processed=true (proteksi
// core PO.java, bukan sekadar dictionary flag — override "Always Updateable"
// di Application Dictionary maupun Window tidak menembus proteksi ini).
//
// Sumber kebenaran baru: KEBERADAAN C_InvoiceLine yang mereferensikan
// M_InOutLine_ID, dari invoice yang statusnya BUKAN Voided ('VO'). Ini malah
// lebih akurat — langsung merujuk bukti transaksi, bukan flag turunan yang
// bisa telat sinkron atau (seperti kasus ini) gagal ditulis sama sekali.
//
// excludeInvoiceId: dipakai saat mode EDIT invoice — supaya baris yang
// sedang dipakai invoice yang SEDANG diedit tidak dianggap "sudah diklaim
// pihak lain" dan hilang dari daftar available.
// ─────────────────────────────────────────────────────────────────────────────
export function useShipmentInvoiceLines() {
  const [shipments, setShipments] = useState([]); // flat: 1 row = 1 M_InOutLine
  const [loading, setLoading] = useState(false);

  const fetchLines = useCallback(async ({ term = '', customerId = null, excludeInvoiceId = null } = {}) => {
    setLoading(true);
    try {
      // ── 1. Shipment header yang lolos DocStatus/IsSOTrx/search/customer ──
      let headerFilter = `IsSOTrx eq true and DocStatus eq 'CO'`;
      if (customerId) headerFilter += ` and C_BPartner_ID eq ${customerId}`;
      if (term.trim()) {
        headerFilter += ` and (contains(upper(DocumentNo), upper('${term.trim()}')) or contains(upper(C_BPartner_ID.Name), upper('${term.trim()}')))`;
      }

      const shipRes = await idempiereApi(
        `/models/m_inout?$filter=${headerFilter}` +
        `&$select=M_InOut_ID,DocumentNo,MovementDate,C_BPartner_ID` +
        `&$orderby=MovementDate desc&$top=100`
      );
      const shipHeaders = Array.isArray(shipRes.records) ? shipRes.records : [];
      if (shipHeaders.length === 0) { setShipments([]); return; }

      const shipIds = shipHeaders.map(s => s.id ?? s.M_InOut_ID);
      const shipFilterStr = shipIds.map(id => `M_InOut_ID eq ${id}`).join(' or ');

      // ── 2. SEMUA baris shipment — TIDAK ADA lagi filter IsInvoiced di sini ──
      const lineRes = await idempiereApi(
        `/models/m_inoutline?$filter=(${shipFilterStr})` +
        `&$select=M_InOutLine_ID,M_InOut_ID,M_Product_ID,QtyEntered,MovementQty,C_UOM_ID,C_OrderLine_ID` +
        `&$top=1000`
      );
      const allLines = Array.isArray(lineRes.records) ? lineRes.records : [];
      if (allLines.length === 0) { setShipments([]); return; }

      const allLineIds = allLines.map(l => l.id ?? l.M_InOutLine_ID);

      // ── 3. Cari C_InvoiceLine mana saja yang SUDAH mereferensikan baris ini ──
      const lineIdFilterStr = allLineIds.map(id => `M_InOutLine_ID eq ${id}`).join(' or ');
      const invoiceLineRes = await idempiereApi(
        `/models/c_invoiceline?$filter=(${lineIdFilterStr})` +
        `&$select=M_InOutLine_ID,C_Invoice_ID&$top=1000`
      );
      const invoiceLineRecords = Array.isArray(invoiceLineRes.records) ? invoiceLineRes.records : [];

      // ── 4. Cek status invoice-invoice yang terlibat — kecualikan Voided ──
      const involvedInvoiceIds = [...new Set(
        invoiceLineRecords.map(il => fkId(il.C_Invoice_ID) ?? il.C_Invoice_ID?.id).filter(Boolean)
      )];

      let invoiceStatusById = new Map();
      if (involvedInvoiceIds.length > 0) {
        const invFilterStr = involvedInvoiceIds.map(id => `C_Invoice_ID eq ${id}`).join(' or ');
        const invRes = await idempiereApi(
          `/models/c_invoice?$filter=(${invFilterStr})&$select=C_Invoice_ID,DocStatus&$top=1000`
        );
        (Array.isArray(invRes.records) ? invRes.records : []).forEach(inv => {
          const invId = inv.id ?? inv.C_Invoice_ID;
          invoiceStatusById.set(String(invId), inv.DocStatus?.id ?? inv.DocStatus);
        });
      }

      // ── 5. Bangun Set M_InOutLine_ID yang "sudah diklaim" (invoice bukan Voided) ──
      const claimedLineIds = new Set();
      invoiceLineRecords.forEach(il => {
        const invId = fkId(il.C_Invoice_ID) ?? il.C_Invoice_ID?.id;
        const inOutLineId = fkId(il.M_InOutLine_ID) ?? il.M_InOutLine_ID?.id;
        if (!invId || !inOutLineId) return;

        // Kecualikan invoice yang SEDANG diedit — baris ini boleh tetap
        // muncul available supaya user bisa lihat/edit qty-nya lagi.
        if (excludeInvoiceId && String(invId) === String(excludeInvoiceId)) return;

        const status = invoiceStatusById.get(String(invId));
        if (status !== 'VO') { // Voided = tidak dianggap klaim valid
          claimedLineIds.add(String(inOutLineId));
        }
      });

      // ── 6. Filter baris yang BELUM diklaim ──────────────────────────────
      const availableLines = allLines.filter(l => {
        const lineId = l.id ?? l.M_InOutLine_ID;
        return !claimedLineIds.has(String(lineId));
      });
      if (availableLines.length === 0) { setShipments([]); return; }

      // ── Harga dari C_OrderLine yang ter-link (sama seperti sebelumnya) ──
      const orderLineIds = availableLines.map(l => fkId(l.C_OrderLine_ID) ?? l.C_OrderLine_ID?.id).filter(Boolean);
      let priceByOrderLine = new Map();
      if (orderLineIds.length > 0) {
        const olFilterStr = orderLineIds.map(id => `C_OrderLine_ID eq ${id}`).join(' or ');
        const olRes = await idempiereApi(
          `/models/c_orderline?$filter=${olFilterStr}&$select=C_OrderLine_ID,PriceEntered,PriceActual&$top=1000`
        );
        (Array.isArray(olRes.records) ? olRes.records : []).forEach(ol => {
          const olId = ol.id ?? ol.C_OrderLine_ID;
          priceByOrderLine.set(String(olId), parseFloat(ol.PriceEntered ?? ol.PriceActual ?? 0));
        });
      }

      const shipHeaderById = new Map();
      shipHeaders.forEach(s => shipHeaderById.set(String(s.id ?? s.M_InOut_ID), s));

      const mapped = availableLines.map(l => {
        const inOutLineId = l.id ?? l.M_InOutLine_ID;
        const shipId = fkId(l.M_InOut_ID) ?? l.M_InOut_ID?.id;
        const header = shipHeaderById.get(String(shipId));
        const orderLineId = fkId(l.C_OrderLine_ID) ?? l.C_OrderLine_ID?.id ?? null;
        const movementQty = parseFloat(l.MovementQty ?? l.QtyEntered ?? 0);
        const price = orderLineId ? (priceByOrderLine.get(String(orderLineId)) ?? 0) : 0;

        return {
          M_InOutLine_ID: inOutLineId,
          M_InOut_ID: shipId,
          ShipmentDocumentNo: header?.DocumentNo || `#${shipId}`,
          MovementDate: header?.MovementDate,
          C_BPartner_ID: fkId(header?.C_BPartner_ID) ?? header?.C_BPartner_ID?.id ?? null,
          CustomerName: fkLabel(header?.C_BPartner_ID) || '',
          M_Product_ID: fkId(l.M_Product_ID) ?? l.M_Product_ID?.id,
          ProductName: cleanIdentifier(fkLabel(l.M_Product_ID)) || `Produk #${fkId(l.M_Product_ID)}`,
          C_UOM_ID: fkId(l.C_UOM_ID) ?? l.C_UOM_ID?.id,
          UomName: fkLabel(l.C_UOM_ID) || '',
          C_OrderLine_ID: orderLineId,
          Price: price,
          priceMissing: !orderLineId,
          qtyOutstanding: movementQty,
        };
      });

      setShipments(mapped);
    } catch (err) {
      console.error('[useShipmentInvoiceLines] gagal fetch:', err);
      setShipments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { shipments, loading, fetchLines };
}