import { useState, useCallback } from 'react';
import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';

const APPROVED_STATUSES = ['CO', 'CL'];

// DocStatus M_InOut yang dianggap "masih terbuka" (belum Complete, belum
// Void/Reversed) — qty di line-line-nya dianggap "reserved" dan dikurangi
// dari sisa yang ditawarkan untuk import, supaya PO yang sudah diimport
// (tapi Receipt-nya belum Complete) tidak bisa diimport dobel.
// PENTING: kalau workflow approval kamu punya DocStatus tambahan (custom),
// tambahkan kodenya di sini.
const OPEN_INOUT_STATUSES = ['DR', 'IP'];

export function useApprovedPurchaseOrders() {
  const [orders, setOrders]           = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  const [selectedLines, setSelectedLines] = useState([]);
  const [loadingLines, setLoadingLines]   = useState(false);

  // Helper: build filter OData untuk "M_InOut_ID/DocStatus in OPEN_INOUT_STATUSES"
  const openStatusFilter = () =>
    OPEN_INOUT_STATUSES.map(s => `M_InOut_ID/DocStatus eq '${s}'`).join(' or ');

  // Ambil total qty yang "reserved" oleh Receipt lain yang masih terbuka,
  // untuk SATU PO (dipakai di daftar Step 1).
  // Helper: Ambil daftar ID header M_InOut yang berstatus terbuka (DR / IP)
const fetchOpenInOutIds = async () => {
  const statusFilter = OPEN_INOUT_STATUSES.map(s => `DocStatus eq '${s}'`).join(' or ');
  const res = await idempiereApi(
    `/models/m_inout?$select=M_InOut_ID&$filter=${statusFilter}`
  );
  const records = Array.isArray(res.records) ? res.records : [];
  return records.map(r => fkId(r.M_InOut_ID) ?? r.id).filter(Boolean);
};

// Ambil total qty reserved untuk 1 PO
const fetchReservedQtyForOrder = useCallback(async (orderId) => {
  try {
    const openInOutIds = await fetchOpenInOutIds();
    if (openInOutIds.length === 0) return 0;

    const inoutFilter = openInOutIds.map(id => `M_InOut_ID eq ${id}`).join(' or ');
    const res = await idempiereApi(
      `/models/m_inoutline?$select=MovementQty` +
      `&$filter=C_Order_ID eq ${orderId} and (${inoutFilter})`
    );
    const records = Array.isArray(res.records) ? res.records : [];
    return records.reduce((sum, r) => sum + parseFloat(r.MovementQty || 0), 0);
  } catch (err) {
    console.warn(`[useApprovedPurchaseOrders] gagal cek reserved qty PO ${orderId}:`, err);
    return 0;
  }
}, []);

// Ambil total qty reserved PER LINE
const fetchReservedQtyByLine = useCallback(async (orderLineIds) => {
  if (!orderLineIds || orderLineIds.length === 0) return new Map();
  try {
    const openInOutIds = await fetchOpenInOutIds();
    if (openInOutIds.length === 0) return new Map();

    const lineFilter = orderLineIds.map(id => `C_OrderLine_ID eq ${id}`).join(' or ');
    const inoutFilter = openInOutIds.map(id => `M_InOut_ID eq ${id}`).join(' or ');
    
    const res = await idempiereApi(
      `/models/m_inoutline?$select=C_OrderLine_ID,MovementQty` +
      `&$filter=(${lineFilter}) and (${inoutFilter})`
    );
    const records = Array.isArray(res.records) ? res.records : [];
    const map = new Map();
    records.forEach(r => {
      const lineId = fkId(r.C_OrderLine_ID);
      if (!lineId) return;
      map.set(lineId, (map.get(lineId) || 0) + parseFloat(r.MovementQty || 0));
    });
    return map;
  } catch (err) {
    console.warn('[useApprovedPurchaseOrders] gagal cek reserved qty per line:', err);
    return new Map();
  }
}, []);

  const fetchApprovedOrders = useCallback(async ({ warehouseId = null, search = '' } = {}) => {
    setLoadingList(true);
    try {
      const statusFilter = APPROVED_STATUSES.map(s => `DocStatus eq '${s}'`).join(' or ');
      let filter = `IsSOTrx eq false and (${statusFilter})`;

      if (warehouseId) {
        filter += ` and M_Warehouse_ID eq ${warehouseId}`;
      }
      if (search) {
        const safeQ = search.replace(/'/g, "''");
        filter += ` and contains(toupper(DocumentNo),'${safeQ.toUpperCase()}')`;
      }

      const res = await idempiereApi(
        `/models/c_order?$select=C_Order_ID,DocumentNo,DateOrdered,M_Warehouse_ID,DocStatus,C_BPartner_ID,C_BPartner_Location_ID,GrandTotal` +
        `&$filter=${filter}&$orderby=DateOrdered desc&$top=50`
      );
      const records = Array.isArray(res.records) ? res.records : [];

      let list = records.map(o => ({
        C_Order_ID:             fkId(o.C_Order_ID) ?? o.id,
        DocumentNo:             o.DocumentNo,
        DateOrdered:            o.DateOrdered,
        WarehouseName:          fkLabel(o.M_Warehouse_ID),
        DocStatus:              o.DocStatus?.id ?? o.DocStatus,
        C_BPartner_ID:          fkId(o.C_BPartner_ID),
        VendorName:             fkLabel(o.C_BPartner_ID),
        C_BPartner_Location_ID: fkId(o.C_BPartner_Location_ID),
        GrandTotal:             o.GrandTotal ?? 0,
      }));

      // ── Sembunyikan PO yang sisa qty-nya sudah habis ────────────────────
      // Sisa = (QtyOrdered - QtyDelivered) DIKURANGI qty yang sudah
      // "dipegang" oleh Receipt lain yang masih terbuka (belum Complete/
      // Void) — supaya PO yang sudah diimport tapi Receipt-nya masih
      // Draft/In Progress tidak muncul lagi utk diimport dobel.
      if (list.length > 0) {
        const results = await Promise.all(list.map(async (o) => {
          try {
            const [lineRes, reservedQty] = await Promise.all([
              idempiereApi(
                `/models/c_orderline?$filter=C_Order_ID eq ${o.C_Order_ID}&$select=QtyOrdered,QtyDelivered`
              ),
              fetchReservedQtyForOrder(o.C_Order_ID),
            ]);
            const lineRecords = Array.isArray(lineRes.records) ? lineRes.records : [];
            const totalRemaining = lineRecords.reduce((sum, l) => {
              return sum + Math.max(parseFloat(l.QtyOrdered || 0) - parseFloat(l.QtyDelivered || 0), 0);
            }, 0);
            const remaining = Math.max(totalRemaining - reservedQty, 0);
            return { ...o, TotalQtyRemaining: remaining, _queryOk: true };
          } catch (err) {
            console.error(`[useApprovedPurchaseOrders] gagal cek sisa qty PO ${o.DocumentNo}:`, err);
            return { ...o, TotalQtyRemaining: null, _queryOk: false };
          }
        }));

        list = results.filter(o => !o._queryOk || o.TotalQtyRemaining > 0);
      }

      setOrders(list);
      return list;
    } catch (err) {
      console.error('[useApprovedPurchaseOrders] fetchApprovedOrders error:', err);
      setOrders([]);
      return [];
    } finally {
      setLoadingList(false);
    }
  }, [fetchReservedQtyForOrder]);

  const fetchOrderLines = useCallback(async (orderId) => {
    if (!orderId) return [];
    setLoadingLines(true);
    try {
      const res = await idempiereApi(
        `/models/c_orderline?$filter=C_Order_ID eq ${orderId}` +
        `&$select=C_OrderLine_ID,Line,M_Product_ID,C_UOM_ID,QtyEntered,QtyOrdered,QtyDelivered,Description` +
        `&$orderby=Line`
      );
      const records = Array.isArray(res.records) ? res.records : [];

      const rawLineIds = records.map(l => fkId(l.C_OrderLine_ID) ?? l.id).filter(Boolean);
      const reservedMap = await fetchReservedQtyByLine(rawLineIds);

      const allLines = records.map(l => {
        const lineId           = fkId(l.C_OrderLine_ID) ?? l.id;
        const qtyOrderedBase   = parseFloat(l.QtyOrdered   || 0);
        const qtyDeliveredBase = parseFloat(l.QtyDelivered || 0);
        const qtyEntered       = parseFloat(l.QtyEntered   || 0);
        const qtyReservedBase  = reservedMap.get(lineId) || 0;

        const rate = qtyEntered > 0 ? (qtyOrderedBase / qtyEntered) : 1;
        const toEntered = (base) => (rate > 0 ? base / rate : base);

        const qtyRemainingBase = Math.max(qtyOrderedBase - qtyDeliveredBase - qtyReservedBase, 0);
        const qtyRemainingEntered = toEntered(qtyRemainingBase);

        return {
          C_OrderLine_ID: lineId,
          M_Product_ID:   fkId(l.M_Product_ID),
          ProductName:    fkLabel(l.M_Product_ID) || `Produk #${fkId(l.M_Product_ID)}`,
          C_UOM_ID:       fkId(l.C_UOM_ID),
          UomName:        fkLabel(l.C_UOM_ID) || 'EA',
          ConversionRate: rate,
          QtyOrdered:        qtyOrderedBase,
          QtyDelivered:      qtyDeliveredBase,
          QtyReserved:       qtyReservedBase,      // ← baru: sedang "dipegang" Receipt lain yg masih open
          QtyRemaining:      qtyRemainingBase,
          QtyOrderedEntered:   qtyEntered,
          QtyDeliveredEntered: toEntered(qtyDeliveredBase),
          QtyReservedEntered:  toEntered(qtyReservedBase),
          QtyRemainingEntered: qtyRemainingEntered,
          Description:    l.Description || '',
        };
      });

      const receivableLines = allLines.filter(l => l.QtyRemaining > 0);

      setSelectedLines(receivableLines);
      return { allLines, receivableLines };
    } catch (err) {
      console.error('[useApprovedPurchaseOrders] fetchOrderLines error:', err);
      setSelectedLines([]);
      return { allLines: [], receivableLines: [] };
    } finally {
      setLoadingLines(false);
    }
  }, [fetchReservedQtyByLine]);

  const buildChartData = useCallback((lines) => {
    return (lines || []).map(l => ({
      name: l.ProductName.length > 14 ? l.ProductName.slice(0, 14) + '…' : l.ProductName,
      fullName: l.ProductName,
      delivered: l.QtyDeliveredEntered,
      reserved:  l.QtyReservedEntered,
      remaining: l.QtyRemainingEntered,
      uom: l.UomName,
    }));
  }, []);

  const linesToCartItems = useCallback((lines, orderId) => {
    return (lines || []).map(l => ({
      M_Product_ID: l.M_Product_ID,
      Name:         l.ProductName,
      Value:        '',
      C_UOM_ID:     l.C_UOM_ID,
      C_UOM_Name:   l.UomName,
      Qty:          l.QtyRemainingEntered,
      selectedUom:  { C_UOM_ID: l.C_UOM_ID, Name: l.UomName, multiplyRate: l.ConversionRate },
      uomOptions:   [{ C_UOM_ID: l.C_UOM_ID, Name: l.UomName, multiplyRate: l.ConversionRate }],
      sourceOrderLineId: l.C_OrderLine_ID,
      sourceOrderId: orderId,
      sourceMaxQtyBase: l.QtyRemaining,   // sisa PO (satuan dasar) saat di-import
    }));
  }, []);

  return {
    orders, loadingList, fetchApprovedOrders,
    selectedLines, loadingLines, fetchOrderLines,
    buildChartData, linesToCartItems,
  };
}