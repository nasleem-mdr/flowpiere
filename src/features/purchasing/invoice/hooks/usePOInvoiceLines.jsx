/** ─────────────────────────────────────────────────────────────────────────────
* usePOInvoiceLines.jsx
* Grid PO (Complete) yang masih bisa ditagihkan untuk Purchase Invoice.
*
* STRATEGI (tetap tanpa N+1 request per PO):
*   1. Ambil PO Complete per halaman (IsSOTrx=false, DocStatus='CO').
*   2. Ambil SEMUA C_OrderLine milik PO halaman itu — dipecah per CHUNK id
*      dan dibaca sampai habis ($skip), bukan $top tunggal yang bisa terpotong.
*   3. Ambil SEMUA C_InvoiceLine untuk order line tsb (juga chunk + paging),
*      lalu ambil DocStatus invoice-nya dan buang yang VO/RE di JS.
*   4. Agregasi di JS: qtyInvoiced per C_OrderLine_ID → qtyOutstanding.
*
* PERBAIKAN dari versi sebelumnya:
*   - Order line / invoice line dulu diambil dengan $top tunggal (1000/2000)
*     tanpa $skip. Kalau datanya lebih banyak, baris terpotong → PO yang
*     barisnya tidak ikut terambil punya lines=[] → isFullyInvoiced=true →
*     card ter-disable. Sekarang dibaca sampai habis.
*   - Key Map dinormalisasi ke String di kedua sisi (order, order line,
*     invoice), jadi tidak ada mismatch number vs string / object FK.
*   - PO tanpa baris TIDAK lagi dianggap "sudah lunas" (isFullyInvoiced hanya
*     true bila ada baris dan semua sisa qty = 0). PO tanpa baris disembunyikan.
*   - Gagal fetch invoice line tidak lagi ditelan diam-diam (dulu → dianggap
*     belum ada invoice sama sekali, berisiko double-invoice). Sekarang error
*     dilempar dan dicatat di state `error`.
*   - Hook sekarang menyediakan hasMore / loadingMore / fetchNextPage yang
*     sudah dipakai VendorInvoiceContainer (sebelumnya undefined).
*   - Kutip tunggal pada kata kunci pencarian di-escape.
* ─────────────────────────────────────────────────────────────────────────────
*/

import {
  useState,
  useCallback,
  useRef,
} from 'react';

import {
  idempiereApi,
  fkId,
  fkLabel,
} from '@/api/idempiereApi';

const ORDER_PAGE_SIZE      = 50;   // jumlah PO per request
const MIN_VISIBLE_PER_LOAD = 20;   // target minimal PO tampil per "muat"
const MAX_SCAN_ROUNDS      = 6;    // batas putaran scan PO per "muat"
const ID_CHUNK             = 25;   // jumlah id per filter "or" (hindari URL kepanjangan)
const ROW_PAGE_SIZE        = 200;  // ukuran halaman saat baca detail
const MAX_ROW_PAGES        = 50;   // pengaman loop

// true  → PO yang sudah punya invoice (partial/full) disembunyikan (perilaku sebelumnya).
// false → PO yang masih punya sisa qty tetap tampil (partial), fully-invoiced di-gray-out
//         dan bisa ditampilkan lewat checkbox "Tampilkan semua" di container.
const HIDE_PARTIALLY_INVOICED = true;

/* ── helpers ─────────────────────────────────────────────────────────────── */

// Normalisasi apa pun (angka, string, objek FK) menjadi String id — dipakai untuk key Map/Set.
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

// Baca SEMUA halaman sebuah query (path sudah berisi $filter/$select/$orderby).
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
  const stats = { orders: orders.length, lines: 0, invoiceLines: 0, invoices: 0, voidedOrReversed: 0 };
  if (orders.length === 0) return { merged: [], stats };

  const orderIds = orders.map(o => idOf(o.id ?? o.C_Order_ID)).filter(Boolean);

  // 2. Order line (chunk per PO + paging)
  const lineChunks = await Promise.all(
    chunk(orderIds, ID_CHUNK).map(ids => fetchAllRows(
      `/models/c_orderline?$filter=${orFilter('C_Order_ID', ids)}` +
      `&$select=C_OrderLine_ID,C_Order_ID,M_Product_ID,C_UOM_ID,QtyOrdered,QtyEntered,PriceEntered,PriceActual` +
      `&$orderby=C_OrderLine_ID`
    ))
  );
  const lines = lineChunks.flat();
  stats.lines = lines.length;

  // 3a. Invoice line untuk order line tsb (chunk + paging). Filter nested
  //     c_invoice_id.DocStatus tidak didukung → status dicek terpisah di 3b.
  const lineIds = [...new Set(lines.map(l => idOf(l.id ?? l.C_OrderLine_ID)).filter(Boolean))];
  const invLineChunks = await Promise.all(
    chunk(lineIds, ID_CHUNK).map(ids => fetchAllRows(
      `/models/c_invoiceline?$filter=${orFilter('C_OrderLine_ID', ids)}` +
      `&$select=C_InvoiceLine_ID,C_OrderLine_ID,QtyInvoiced,C_Invoice_ID` +
      `&$orderby=C_InvoiceLine_ID`
    ))
  );
  const rawInvoiceLines = invLineChunks.flat();
  stats.invoiceLines = rawInvoiceLines.length;

  // 3b. DocStatus invoice-invoice tsb → buang yang Voided / Reversed.
  const invoiceIds = [...new Set(rawInvoiceLines.map(il => idOf(il.C_Invoice_ID)).filter(Boolean))];
  stats.invoices = invoiceIds.length;

  const excludedInvoiceIds = new Set();
  if (invoiceIds.length > 0) {
    const invChunks = await Promise.all(
      chunk(invoiceIds, ID_CHUNK).map(ids => fetchAllRows(
        `/models/c_invoice?$filter=${orFilter('C_Invoice_ID', ids)}` +
        `&$select=C_Invoice_ID,DocStatus&$orderby=C_Invoice_ID`
      ))
    );
    invChunks.flat().forEach(inv => {
      const status = inv.DocStatus?.id ?? inv.DocStatus;
      if (status === 'VO' || status === 'RE') excludedInvoiceIds.add(idOf(inv.id ?? inv.C_Invoice_ID));
    });
  }
  stats.voidedOrReversed = excludedInvoiceIds.size;

  // 4. Agregasi qty tertagih per order line
  const invoicedByLine = new Map();
  rawInvoiceLines.forEach(il => {
    if (excludedInvoiceIds.has(idOf(il.C_Invoice_ID))) return;
    const olId = idOf(il.C_OrderLine_ID);
    if (olId == null) return;
    invoicedByLine.set(olId, (invoicedByLine.get(olId) || 0) + parseFloat(il.QtyInvoiced || 0));
  });

  const linesByOrder = new Map();
  lines.forEach(l => {
    const oKey   = idOf(l.C_Order_ID);
    const lineId = l.id ?? l.C_OrderLine_ID;
    const qtyOrdered     = parseFloat(l.QtyOrdered ?? l.QtyEntered ?? 0);
    const qtyInvoiced    = invoicedByLine.get(idOf(lineId)) || 0;
    const qtyOutstanding = Math.max(qtyOrdered - qtyInvoiced, 0);
    // Rasio konversi UOM (QtyOrdered base vs QtyEntered UOM pilihan user) —
    // dipakai POLineDetailSheet supaya "Sisa X Kotak" & QtyEntered konsisten.
    const qtyEnteredOriginal = parseFloat(l.QtyEntered ?? qtyOrdered ?? 0);
    const multiplyRate = qtyEnteredOriginal > 0 ? (qtyOrdered / qtyEnteredOriginal) : 1;
    if (!linesByOrder.has(oKey)) linesByOrder.set(oKey, []);
    linesByOrder.get(oKey).push({
      C_OrderLine_ID: lineId,
      M_Product_ID: fkId(l.M_Product_ID) ?? l.M_Product_ID?.id,
      ProductName:  fkLabel(l.M_Product_ID) || `Produk #${fkId(l.M_Product_ID)}`,
      C_UOM_ID:     fkId(l.C_UOM_ID) ?? l.C_UOM_ID?.id,
      UomName:      fkLabel(l.C_UOM_ID) || '',
      PriceEntered: parseFloat(l.PriceEntered ?? l.PriceActual ?? 0),
      multiplyRate,
      qtyOrdered, qtyInvoiced, qtyOutstanding,
    });
  });

  const merged = orders.map(o => {
    const oId = o.id ?? o.C_Order_ID;
    const orderLines = linesByOrder.get(idOf(oId)) || [];
    const totalOutstanding = orderLines.reduce((s, l) => s + l.qtyOutstanding, 0);
    const totalInvoiced    = orderLines.reduce((s, l) => s + l.qtyInvoiced, 0);
    return {
      C_Order_ID: oId,
      DocumentNo: o.DocumentNo,
      C_BPartner_ID: fkId(o.C_BPartner_ID) ?? o.C_BPartner_ID?.id,
      VendorName: fkLabel(o.C_BPartner_ID) || '',
      C_BPartner_Location_ID: fkId(o.C_BPartner_Location_ID) ?? o.C_BPartner_Location_ID?.id,
      DateOrdered: o.DateOrdered,
      GrandTotal: parseFloat(o.GrandTotal ?? 0),
      lines: orderLines,
      // PO tanpa baris BUKAN "lunas" — jangan ikut ter-disable karena data kosong.
      isFullyInvoiced: orderLines.length > 0 && totalOutstanding < 0.01,
      hasAnyInvoice: totalInvoiced > 0.01,   // sudah exclude invoice VO/RE
    };
  });

  return { merged, stats };
}

/* ── hook ────────────────────────────────────────────────────────────────── */

export function usePOInvoiceLines() {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [searchValue, setSearchValue] = useState('');

  const skipRef        = useRef(0);      // offset PO mentah yang sudah discan
  const termRef        = useRef('');
  const seqRef         = useRef(0);      // anti race antar request
  const busyMoreRef    = useRef(false);
  const hasMoreRef     = useRef(false);

  // Scan PO mentah per halaman sampai terkumpul cukup PO yang layak tampil.
  const loadBatch = useCallback(async (term, startSkip) => {
    const t = term.trim().replace(/'/g, "''");
    const searchFilter = t
      ? ` and (contains(upper(DocumentNo), upper('${t}')) or contains(upper(C_BPartner_ID.Name), upper('${t}')))`
      : '';

    let skip = startSkip;
    let exhausted = false;
    const items = [];
    const totals = { scanned: 0, noLines: 0, hiddenByInvoice: 0 };

    for (let round = 0; round < MAX_SCAN_ROUNDS; round++) {
      const poRes = await idempiereApi(
        `/models/c_order?$filter=IsSOTrx eq false and DocStatus eq 'CO'${searchFilter}` +
        `&$select=C_Order_ID,DocumentNo,C_BPartner_ID,C_BPartner_Location_ID,DateOrdered,GrandTotal` +
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
          if (po.lines.length === 0) { totals.noLines++; return; }
          if (HIDE_PARTIALLY_INVOICED && po.hasAnyInvoice) { totals.hiddenByInvoice++; return; }
          items.push(po);
        });
        console.debug('[usePOInvoiceLines] halaman', { skip, ...stats });
      }

      if (exhausted || items.length >= MIN_VISIBLE_PER_LOAD) break;
    }

    console.debug('[usePOInvoiceLines] ringkasan', { tampil: items.length, ...totals, exhausted });
    return { items, nextSkip: skip, exhausted };
  }, []);

  const fetchPOs = useCallback(async (term = '') => {
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
      console.error('[usePOInvoiceLines] gagal fetch PO:', err);
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
      if (seq !== seqRef.current) return;   // pencarian baru sudah jalan
      skipRef.current = nextSkip;
      hasMoreRef.current = !exhausted;
      setHasMore(!exhausted);
      setPos(prev => {
        const seen = new Set(prev.map(p => String(p.C_Order_ID)));
        return [...prev, ...items.filter(p => !seen.has(String(p.C_Order_ID)))];
      });
    } catch (err) {
      console.error('[usePOInvoiceLines] gagal muat halaman berikutnya:', err);
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