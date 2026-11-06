import { useState, useCallback } from 'react';
import { idempiereApi, fkId } from '@/api/idempiereApi';
import { cleanIdentifier } from '@/utils/pdf/formatIdentifier';

// ─────────────────────────────────────────────────────────────────────────────
// useApprovedSalesOrders.jsx
// Padanan useApprovedPurchaseOrders.jsx untuk sisi PENJUALAN:
//   - Sumber: C_Order / C_OrderLine dengan IsSOTrx = true (Sales Order)
//   - Hanya SO berstatus Completed (CO). SO Closed (CL) tidak boleh dikirim lagi.
//   - Sisa kirim = QtyOrdered - QtyDelivered - (qty di Shipment Draft/In Progress)
//
// Semua angka di output (QtyOrdered, QtyDelivered, QtyRemaining, ...) dalam
// satuan UOM order line (QtyEntered). QtyReserved tetap dalam satuan stok
// (UOM produk) — sama seperti versi PO — dan dikonversi lewat ConversionRate
// saat ditampilkan.
//
// Keterbatasan: qty "sedang di Shipment lain" dihitung dari M_InOut Draft/IP
// yang header-nya punya C_Order_ID sama. Shipment campuran multi-SO (header
// C_Order_ID kosong) tidak ikut terhitung.
// ─────────────────────────────────────────────────────────────────────────────

const num   = (v) => parseFloat(v ?? 0) || 0;
const round = (v) => Math.round(v * 10000) / 10000;

export function useApprovedSalesOrders() {
  const [orders, setOrders]             = useState([]);
  const [loadingList, setLoadingList]   = useState(false);
  const [selectedLines, setSelectedLines] = useState([]);
  const [loadingLines, setLoadingLines] = useState(false);
  
  // ── Step 1: daftar Sales Order Completed yang BELUM punya Shipment ──────
    const fetchApprovedOrders = useCallback(async ({ warehouseId, customerId, search = '' } = {}) => {
    
    setLoadingList(true);
    try {
      const conditions = [`IsSOTrx eq true`, `DocStatus eq 'CO'`];
      if (warehouseId) conditions.push(`M_Warehouse_ID eq ${parseInt(warehouseId)}`);
      if (customerId)  conditions.push(`C_BPartner_ID eq ${parseInt(customerId)}`);   // ← baru
      if (search.trim()) {
        conditions.push(`contains(tolower(DocumentNo),'${search.trim().toLowerCase().replace(/'/g, "''")}')`);
      }

      // Ambil kandidat lebih banyak dari 50, karena sebagian akan terbuang
      // setelah dicek ke Shipment
      const res = await idempiereApi(
        `/models/c_order` +
        `?$filter=${conditions.join(' and ')}` +
        `&$select=C_Order_ID,DocumentNo,DateOrdered,DocStatus,C_BPartner_ID,C_BPartner_Location_ID` +
        `&$orderby=DocumentNo desc` +
        `&$top=200`
      );
      const records = Array.isArray(res.records) ? res.records : [];
      const candidateIds = records.map(r => r.id ?? fkId(r.C_Order_ID)).filter(Boolean);

      // Cari SO yang sudah punya Shipment (DR/IP/CO/CL). Shipment yang
      // sudah Reversed (RE) atau Voided (VO) dianggap tidak ada.

      // SO tampil selama masih ada baris produk/jasa yang QtyOrdered > QtyDelivered
      const openIds = new Set();
      const CHUNK = 40;
      const chunks = [];
      for (let i = 0; i < candidateIds.length; i += CHUNK) {
        chunks.push(candidateIds.slice(i, i + CHUNK));
      }
      await Promise.all(chunks.map(async (ids) => {
        const orFilter = ids.map(id => `C_Order_ID eq ${id}`).join(' or ');
        const lnRes = await idempiereApi(
          `/models/c_orderline?$filter=${orFilter}` +
          `&$select=C_Order_ID,M_Product_ID,QtyOrdered,QtyDelivered&$top=2000`
        );
        (Array.isArray(lnRes.records) ? lnRes.records : []).forEach(l => {
          if (fkId(l.M_Product_ID) && num(l.QtyOrdered) > num(l.QtyDelivered)) {
            openIds.add(Number(fkId(l.C_Order_ID)));
          }
        });
      }));

      const unshipped = records.filter(r => openIds.has(Number(r.id ?? fkId(r.C_Order_ID))));

      setOrders(unshipped.slice(0, 50).map(r => ({
        C_Order_ID:             r.id ?? fkId(r.C_Order_ID),
        DocumentNo:             r.DocumentNo,
        DateOrdered:            r.DateOrdered,
        DocStatus:              r.DocStatus?.id ?? r.DocStatus,
        C_BPartner_ID:          fkId(r.C_BPartner_ID),
        C_BPartner_Location_ID: fkId(r.C_BPartner_Location_ID),
        CustomerName:           r.C_BPartner_ID?.identifier || null,
      })));
    } catch (err) {
      console.error('Gagal fetch Sales Order:', err.message);
      setOrders([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  // ── Step 2: lines SO + hitung sisa yang belum dikirim ───────────────────
  const fetchOrderLines = useCallback(async (orderId) => {
    setLoadingLines(true);
    try {
      const linesRes = await idempiereApi(
        `/models/c_orderline` +
        `?$filter=C_Order_ID eq ${orderId}` +
        `&$select=C_OrderLine_ID,Line,M_Product_ID,QtyOrdered,QtyEntered,QtyDelivered,C_UOM_ID` +
        `&$orderby=Line`
      );
      const rawLines = (Array.isArray(linesRes.records) ? linesRes.records : [])
        .filter(l => fkId(l.M_Product_ID)); // abaikan line Charge (tanpa produk)

      // Qty yang sudah masuk Shipment lain tapi belum Complete
      const reservedByLine = {};
      const draftRes = await idempiereApi(
        `/models/m_inout` +
        `?$filter=C_Order_ID eq ${orderId} and IsSOTrx eq true and (DocStatus eq 'DR' or DocStatus eq 'IP')` +
        `&$select=M_InOut_ID`
      );
      const draftIds = (Array.isArray(draftRes.records) ? draftRes.records : [])
        .map(h => h.id ?? fkId(h.M_InOut_ID)).filter(Boolean);

      if (draftIds.length > 0) {
        const inoutFilter = draftIds.map(id => `M_InOut_ID eq ${id}`).join(' or ');
        const dlRes = await idempiereApi(
          `/models/m_inoutline?$filter=${inoutFilter}&$select=C_OrderLine_ID,MovementQty`
        );
        (Array.isArray(dlRes.records) ? dlRes.records : []).forEach(dl => {
          const olId = fkId(dl.C_OrderLine_ID);
          if (olId) reservedByLine[olId] = (reservedByLine[olId] || 0) + num(dl.MovementQty);
        });
      }

      const allLines = rawLines.map(l => {
        const olId        = l.id ?? fkId(l.C_OrderLine_ID);
        const ordStock    = num(l.QtyOrdered);   // satuan stok
        const entered     = num(l.QtyEntered);   // satuan UOM order
        const rate        = entered > 0 ? ordStock / entered : 1;
        const delStock    = num(l.QtyDelivered);
        const resStock    = reservedByLine[olId] || 0;
        const remStock    = Math.max(ordStock - delStock - resStock, 0);

        return {
          C_OrderLine_ID: olId,
          M_Product_ID:   fkId(l.M_Product_ID),
          ProductName:    cleanIdentifier(l.M_Product_ID?.identifier) || `#${fkId(l.M_Product_ID)}`,
          C_UOM_ID:       fkId(l.C_UOM_ID),
          UomName:        l.C_UOM_ID?.identifier || 'EA',
          ConversionRate: rate,
          QtyOrdered:     round(entered),
          QtyDelivered:   round(delStock / rate),
          QtyReserved:    round(resStock),               // satuan stok (lihat header)
          QtyRemaining:   round(remStock / rate),
        };
      });

      const shippableLines = allLines.filter(l => l.QtyRemaining > 0);
      setSelectedLines(shippableLines);
      return { allLines, shippableLines };
    } catch (err) {
      console.error('Gagal fetch lines Sales Order:', err.message);
      setSelectedLines([]);
      return { allLines: [], shippableLines: [] };
    } finally {
      setLoadingLines(false);
    }
  }, []);

  // ── Data untuk stacked chart ────────────────────────────────────────────
  const buildChartData = useCallback((lines) => lines.map(l => ({
    name:      l.ProductName.length > 14 ? l.ProductName.slice(0, 13) + '…' : l.ProductName,
    delivered: l.QtyDelivered,
    reserved:  round(l.ConversionRate > 0 ? l.QtyReserved / l.ConversionRate : l.QtyReserved),
    remaining: l.QtyRemaining,
    uom:       l.UomName,
  })), []);

  // ── Konversi lines → item cart (Qty = sisa yang belum dikirim) ──────────
  const linesToCartItems = useCallback((lines, orderId) => lines.map(l => ({
    M_Product_ID:      l.M_Product_ID,
    Name:              l.ProductName,
    Qty:               l.QtyRemaining,
    C_UOM_ID:          l.C_UOM_ID,
    C_UOM_Name:        l.UomName,
    selectedUom:       { C_UOM_ID: l.C_UOM_ID, Name: l.UomName, multiplyRate: l.ConversionRate },
    sourceOrderId:     orderId,
    sourceOrderLineId: l.C_OrderLine_ID,
  })), []);

  return {
    orders, loadingList, fetchApprovedOrders,
    selectedLines, loadingLines, fetchOrderLines,
    buildChartData, linesToCartItems,
  };
}
