/** ─────────────────────────────────────────────────────────────────────────────
* usePOReceiptLines.jsx
* Grid PO (Complete) yang barangnya MASIH BELUM DITERIMA penuh — padanan
* usePOInvoiceLines untuk sisi Material Receipt.
*
* STRATEGI (tanpa N+1 request per PO, pola sama dengan usePOInvoiceLines):
*   1. Ambil PO Complete per halaman (IsSOTrx=false, DocStatus='CO',
*      M_Warehouse_ID = gudang sesi bila diberikan).
*   2. Ambil SEMUA C_OrderLine milik PO halaman itu (chunk id + paging $skip).
*   3. Ambil M_InOutLine yang menaut ke order line tsb, lalu DocStatus
*      M_InOut-nya. Receipt yang belum Complete (DR/IP/IN/WC/WP) dihitung
*      sebagai "reserved" — qty-nya dianggap sedang diproses di receipt lain.
*   4. Agregasi di JS:
*        outstanding = QtyOrdered - QtyDelivered - reserved   (min 0)
*      PO tanpa baris, atau yang semua barisnya outstanding = 0, DISEMBUNYIKAN.
*
* Gagal fetch tidak ditelan diam-diam: error dilempar & dicatat di `error`.
* ─────────────────────────────────────────────────────────────────────────────
*/

import { useState, useCallback, useRef } from 'react';

import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';

const ORDER_PAGE_SIZE      = 50;   // jumlah PO per request
const MIN_VISIBLE_PER_LOAD = 20;   // target minimal PO tampil per "muat"
const MAX_SCAN_ROUNDS      = 6;    // batas putaran scan PO per "muat"
const ID_CHUNK             = 25;   // jumlah id per filter "or"
const ROW_PAGE_SIZE        = 200;  // ukuran halaman saat baca detail
const MAX_ROW_PAGES        = 50;   // pengaman loop
const EPS                  = 0.0001;

// Status receipt yang belum final → qty-nya "terpakai" tapi belum masuk QtyDelivered.
const RESERVING_STATUSES = new Set(['DR', 'IP', 'IN', 'WC', 'WP']);

/* ── helpers ─────────────────────────────────────────────────────────────── */

const idOf = (v) => {
  if (v == null) return null;
  const x = fkId(v);
  if (x != null) return String(x);
  if (typeof v === 'object') return v.id != null ? String(v.id) : null;
  return String(v);
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const orFilter = (field, ids) => ids.map(id => `${field} eq ${id}`).join(' or ');

async function fetchAllRows(path) {
  const rows = [];
  let skip = 0;
  for (let page = 0; page < MAX_ROW_PAGES; page++) {
    const res = await idempiereApi(`${path}&$top=${ROW_PAGE_SIZE}&$skip=${skip}`);
    const recs = Array.isArray(res?.records) ? res.records : [];
    if (recs.length === 0) break;
    rows.push(...recs);
    skip += recs.length;
    const total = res?.['row-count'];
    if (typeof total === 'number' && skip >= total) break;
  }
  return rows;
}

/* ── bangun PO + hitung sisa qty untuk satu halaman order ────────────────── */

async function buildPOs(orders) {
  const stats = { orders: orders.length, lines: 0, receiptLines: 0, receipts: 0, reservingReceipts: 0 };
  if (orders.length === 0) return { merged: [], stats };

  const orderIds = orders.map(o => idOf(o.id ?? o.C_Order_ID)).filter(Boolean);

  // 2. Order line
  const lineChunks = await Promise.all(
    chunk(orderIds, ID_CHUNK).map(ids => fetchAllRows(
      `/models/c_orderline?$filter=${orFilter('C_Order_ID', ids)}` +
      `&$select=C_OrderLine_ID,C_Order_ID,M_Product_ID,QtyOrdered,QtyDelivered` +
      `&$orderby=C_OrderLine_ID`
    ))
  );
  const lines = lineChunks.flat();
  stats.lines = lines.length;

  // 3a. Receipt line yang menaut ke order line tsb
  const lineIds = [...new Set(lines.map(l => idOf(l.id ?? l.C_OrderLine_ID)).filter(Boolean))];
  const rcptLineChunks = await Promise.all(
    chunk(lineIds, ID_CHUNK).map(ids => fetchAllRows(
      `/models/m_inoutline?$filter=${orFilter('C_OrderLine_ID', ids)}` +
      `&$select=M_InOutLine_ID,C_OrderLine_ID,MovementQty,M_InOut_ID` +
      `&$orderby=M_InOutLine_ID`
    ))
  );
  const rawReceiptLines = rcptLineChunks.flat();
  stats.receiptLines = rawReceiptLines.length;

  // 3b. DocStatus receipt → hanya yang belum final yang dihitung "reserved"
  const receiptIds = [...new Set(rawReceiptLines.map(rl => idOf(rl.M_InOut_ID)).filter(Boolean))];
  stats.receipts = receiptIds.length;

  const reservingReceiptIds = new Set();
  if (receiptIds.length > 0) {
    const rcptChunks = await Promise.all(
      chunk(receiptIds, ID_CHUNK).map(ids => fetchAllRows(
        `/models/m_inout?$filter=${orFilter('M_InOut_ID', ids)}` +
        `&$select=M_InOut_ID,DocStatus&$orderby=M_InOut_ID`
      ))
    );
    rcptChunks.flat().forEach(r => {
      const status = r.DocStatus?.id ?? r.DocStatus;
      if (RESERVING_STATUSES.has(status)) reservingReceiptIds.add(idOf(r.id ?? r.M_InOut_ID));
    });
  }
  stats.reservingReceipts = reservingReceiptIds.size;

  // 4. Agregasi qty reserved per order line
  const reservedByLine = new Map();
  rawReceiptLines.forEach(rl => {
    if (!reservingReceiptIds.has(idOf(rl.M_InOut_ID))) return;
    const olId = idOf(rl.C_OrderLine_ID);
    if (olId == null) return;
    reservedByLine.set(olId, (reservedByLine.get(olId) || 0) + parseFloat(rl.MovementQty || 0));
  });

  const linesByOrder = new Map();
  lines.forEach(l => {
    if (idOf(l.M_Product_ID) == null) return;   // baris non-produk (charge dsb) tidak diterima
    const oKey        = idOf(l.C_Order_ID);
    const lineId      = l.id ?? l.C_OrderLine_ID;
    const qtyOrdered  = parseFloat(l.QtyOrdered ?? 0);
    const qtyDelivered = parseFloat(l.QtyDelivered ?? 0);
    const qtyReserved = reservedByLine.get(idOf(lineId)) || 0;
    const qtyOutstanding = Math.max(qtyOrdered - qtyDelivered - qtyReserved, 0);
    if (!linesByOrder.has(oKey)) linesByOrder.set(oKey, []);
    linesByOrder.get(oKey).push({
      C_OrderLine_ID: lineId,
      qtyOrdered, qtyDelivered, qtyReserved, qtyOutstanding,
    });
  });

  const merged = orders.map(o => {
    const oId = o.id ?? o.C_Order_ID;
    const orderLines = linesByOrder.get(idOf(oId)) || [];
    const outstandingLines = orderLines.filter(l => l.qtyOutstanding > EPS).length;
    return {
      C_Order_ID: oId,
      DocumentNo: o.DocumentNo,
      C_BPartner_ID: fkId(o.C_BPartner_ID) ?? o.C_BPartner_ID?.id,
      VendorName: fkLabel(o.C_BPartner_ID) || '',
      C_BPartner_Location_ID: fkId(o.C_BPartner_Location_ID) ?? o.C_BPartner_Location_ID?.id,
      DateOrdered: o.DateOrdered,
      lines: orderLines,
      totalLines: orderLines.length,
      outstandingLines,
      hasDelivered: orderLines.some(l => l.qtyDelivered > EPS),   // sudah pernah diterima sebagian
      hasReserved:  orderLines.some(l => l.qtyReserved  > EPS),   // ada receipt lain yang belum Complete
      isFullyReceived: orderLines.length > 0 && outstandingLines === 0,
    };
  });

  return { merged, stats };
}

/* ── hook ────────────────────────────────────────────────────────────────── */

export function usePOReceiptLines() {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [searchValue, setSearchValue] = useState('');

  const skipRef      = useRef(0);
  const termRef      = useRef('');
  const warehouseRef = useRef(null);
  const seqRef       = useRef(0);
  const busyMoreRef  = useRef(false);
  const hasMoreRef   = useRef(false);

  const loadBatch = useCallback(async (term, startSkip) => {
    const t = term.trim().replace(/'/g, "''");
    const searchFilter = t
      ? ` and (contains(upper(DocumentNo), upper('${t}')) or contains(upper(C_BPartner_ID.Name), upper('${t}')))`
      : '';
    const wh = Number(warehouseRef.current);
    const warehouseFilter = Number.isFinite(wh) && wh > 0 ? ` and M_Warehouse_ID eq ${wh}` : '';

    let skip = startSkip;
    let exhausted = false;
    const items = [];
    const totals = { scanned: 0, noLines: 0, fullyReceived: 0 };

    for (let round = 0; round < MAX_SCAN_ROUNDS; round++) {
      const poRes = await idempiereApi(
        `/models/c_order?$filter=IsSOTrx eq false and DocStatus eq 'CO'${warehouseFilter}${searchFilter}` +
        `&$select=C_Order_ID,DocumentNo,C_BPartner_ID,C_BPartner_Location_ID,DateOrdered` +
        `&$orderby=C_Order_ID desc&$top=${ORDER_PAGE_SIZE}&$skip=${skip}`
      );
      const orders = Array.isArray(poRes?.records) ? poRes.records : [];
      skip += orders.length;
      const rowCount = poRes?.['row-count'];
      exhausted = orders.length === 0 || (typeof rowCount === 'number' && skip >= rowCount);
      totals.scanned += orders.length;

      if (orders.length > 0) {
        const { merged, stats } = await buildPOs(orders);
        merged.forEach(po => {
          if (po.totalLines === 0) { totals.noLines++; return; }
          if (po.isFullyReceived)  { totals.fullyReceived++; return; }
          items.push(po);
        });
        console.debug('[usePOReceiptLines] halaman', { skip, ...stats });
      }

      if (exhausted || items.length >= MIN_VISIBLE_PER_LOAD) break;
    }

    console.debug('[usePOReceiptLines] ringkasan', { tampil: items.length, ...totals, exhausted });
    return { items, nextSkip: skip, exhausted };
  }, []);

  // warehouseId opsional: bila diberikan, disimpan & dipakai untuk semua muat berikutnya.
  const fetchPOs = useCallback(async (term = '', warehouseId) => {
    if (warehouseId !== undefined) warehouseRef.current = warehouseId;
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    try {
      const { items, nextSkip, exhausted } = await loadBatch(term, 0);
      if (seq !== seqRef.current) return;
      termRef.current = term;
      skipRef.current = nextSkip;
      hasMoreRef.current = !exhausted;
      setHasMore(!exhausted);
      setPos(items);
    } catch (err) {
      if (seq !== seqRef.current) return;
      console.error('[usePOReceiptLines] gagal fetch PO:', err);
      setError(err?.message || 'Gagal memuat PO');
      hasMoreRef.current = false;
      setHasMore(false);
      setPos([]);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [loadBatch]);

  const fetchNextPage = useCallback(async () => {
    if (busyMoreRef.current || !hasMoreRef.current) return;
    busyMoreRef.current = true;
    const seq = seqRef.current;
    setLoadingMore(true);
    try {
      const { items, nextSkip, exhausted } = await loadBatch(termRef.current, skipRef.current);
      if (seq !== seqRef.current) return;
      skipRef.current = nextSkip;
      hasMoreRef.current = !exhausted;
      setHasMore(!exhausted);
      setPos(prev => {
        const seen = new Set(prev.map(p => String(p.C_Order_ID)));
        return [...prev, ...items.filter(p => !seen.has(String(p.C_Order_ID)))];
      });
    } catch (err) {
      console.error('[usePOReceiptLines] gagal muat halaman berikutnya:', err);
      setError(err?.message || 'Gagal memuat PO berikutnya');
      hasMoreRef.current = false;
      setHasMore(false);
    } finally {
      busyMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [loadBatch]);

  const search = useCallback((value) => setSearchValue(value), []);

  return {
    pos, loading, loadingMore, hasMore, error,
    fetchPOs, fetchNextPage,
    search, searchValue, setSearchValue,
  };
}
