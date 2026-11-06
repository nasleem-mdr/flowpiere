import { useState, useCallback } from 'react';
import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';

// ─────────────────────────────────────────────────────────────────────────────
// usePOInvoiceLines.jsx
// Pengganti useProductSearch.jsx — karena semua pembelian WAJIB lewat PO,
// container ini tidak lagi menampilkan grid produk, tapi grid PO yang SUDAH
// Complete dan MASIH ada sisa qty belum ditagih.
//
// STRATEGI PERHITUNGAN SISA QTY (supaya tidak N+1 request per PO):
//   1. Fetch C_Order Complete (IsSOTrx=false, DocStatus='CO'), diurutkan
//      DateOrdered desc, PER HALAMAN (lihat catatan pagination di bawah).
//   2. Fetch SEMUA C_OrderLine milik PO-PO di halaman itu — 1 call.
//   3. Fetch SEMUA C_InvoiceLine yg C_OrderLine_ID-nya termasuk di atas,
//      dikecualikan invoice Voided/Reversed — 1 call.
//   4. Agregasi di JS: qtyInvoiced per C_OrderLine_ID, lalu qtyOutstanding
//      per line = QtyOrdered - qtyInvoiced.
//
// ⚠️ Filter nested `C_Invoice_ID.DocStatus notin (...)` BELUM PERNAH DITES
// (Postman lagi down saat ini) — kalau ternyata tidak didukung versi REST
// API Anda, sudah ada fallback try/catch di bawah (ambil semua tanpa filter
// status, sedikit overcount kalau ada invoice voided — cek manual kalau
// sering kejadian). WAJIB dites ulang begitu Postman normal.
//
// PO yang outstanding-nya 0 TETAP di-fetch (browse tidak aneh), tapi
// ditandai `isFullyInvoiced: true` — card-nya di-gray-out, bukan hilang.
//
// ── CATATAN PAGINATION (penting) ────────────────────────────────────────────
// Sebelumnya hook ini pakai `$top=100` TETAP, diurutkan DateOrdered desc.
// Masalahnya: kalau ada PO LAMA yang masih outstanding (belum ditagih),
// tapi sudah ada 100+ PO lebih baru (walau sudah lunas semua), PO lama itu
// akan TERLEMPAR KELUAR dari hasil fetch — tidak akan pernah muncul di grid
// sama sekali, bahkan dengan toggle "Tampilkan Semua" sekalipun, karena
// toggle cuma memfilter dari data yang SUDAH ke-fetch.
//
// Solusinya: pagination eksplisit (fetchPOs dengan { append: true } +
// fetchNextPage()). Halaman pertama tetap cukup untuk kebanyakan kasus,
// tapi user (atau UI) bisa "Muat Lebih Banyak" untuk menjangkau PO yang
// lebih lama tanpa perlu tau nomor dokumen persisnya buat search manual.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

export function usePOInvoiceLines() {
  const [pos, setPos]               = useState([]);
  const [loading, setLoading]       = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [hasMore, setHasMore]       = useState(false);
  const [page, setPage]             = useState(0);

  // Fungsi inti: fetch 1 halaman PO + lines + invoice lines, return hasil
  // TERPROSES (bukan langsung setPos) — supaya bisa dipakai baik untuk
  // "fetch awal" (replace) maupun "load more" (append).
  const fetchPage = useCallback(async (term, pageIndex) => {
    const t = term.trim();
    const searchFilter = t
      ? ` and (contains(upper(DocumentNo), upper('${t}')) or contains(upper(C_BPartner_ID.Name), upper('${t}')))`
      : '';

    const poRes = await idempiereApi(
      `/models/c_order?$filter=IsSOTrx eq false and DocStatus eq 'CO'${searchFilter}` +
      `&$select=C_Order_ID,DocumentNo,C_BPartner_ID,C_BPartner_Location_ID,DateOrdered,GrandTotal` +
      `&$orderby=DateOrdered desc&$top=${PAGE_SIZE}&$skip=${pageIndex * PAGE_SIZE}`
    );
    const orders = Array.isArray(poRes.records) ? poRes.records : [];
    if (orders.length === 0) return { merged: [], hasMore: false };

    const orderIds = orders.map(o => o.id ?? o.C_Order_ID);
    const orderFilterStr = orderIds.map(id => `C_Order_ID eq ${id}`).join(' or ');

    const linesRes = await idempiereApi(
      `/models/c_orderline?$filter=${orderFilterStr}` +
      `&$select=C_OrderLine_ID,C_Order_ID,M_Product_ID,C_UOM_ID,QtyOrdered,QtyEntered,PriceEntered,PriceActual&$top=1000`
    );
    const lines = Array.isArray(linesRes.records) ? linesRes.records : [];
    if (lines.length === 0) {
      // PO ada tapi tidak ada line (harusnya jarang) — tetap kembalikan
      // order tanpa lines, jangan drop diam-diam.
      const merged = orders.map(o => ({
        C_Order_ID: o.id ?? o.C_Order_ID,
        DocumentNo: o.DocumentNo,
        C_BPartner_ID: fkId(o.C_BPartner_ID) ?? o.C_BPartner_ID?.id,
        VendorName: fkLabel(o.C_BPartner_ID) || '',
        C_BPartner_Location_ID: fkId(o.C_BPartner_Location_ID) ?? o.C_BPartner_Location_ID?.id,
        DateOrdered: o.DateOrdered,
        GrandTotal: parseFloat(o.GrandTotal ?? 0),
        lines: [],
        isFullyInvoiced: true,
      }));
      return { merged, hasMore: orders.length === PAGE_SIZE };
    }

    const lineIds = lines.map(l => l.id ?? l.C_OrderLine_ID);
    const lineFilterStr = lineIds.map(id => `C_OrderLine_ID eq ${id}`).join(' or ');

    let invoiceLines = [];
    try {
      const invLinesRes = await idempiereApi(
        `/models/c_invoiceline?$filter=(${lineFilterStr}) and C_Invoice_ID.DocStatus notin ('VO','RE')` +
        `&$select=C_OrderLine_ID,QtyInvoiced&$top=2000`
      );
      invoiceLines = Array.isArray(invLinesRes.records) ? invLinesRes.records : [];
    } catch (err) {
      console.warn('[usePOInvoiceLines] nested filter DocStatus gagal, fallback tanpa filter status:', err.message);
      const invLinesRes = await idempiereApi(
        `/models/c_invoiceline?$filter=${lineFilterStr}&$select=C_OrderLine_ID,QtyInvoiced&$top=2000`
      );
      invoiceLines = Array.isArray(invLinesRes.records) ? invLinesRes.records : [];
    }

    const invoicedByLine = new Map();
    invoiceLines.forEach(il => {
      const olId = fkId(il.C_OrderLine_ID) ?? il.C_OrderLine_ID?.id;
      if (olId == null) return;
      invoicedByLine.set(String(olId), (invoicedByLine.get(String(olId)) || 0) + parseFloat(il.QtyInvoiced || 0));
    });

    const linesByOrder = new Map();
    lines.forEach(l => {
      const oId    = fkId(l.C_Order_ID) ?? l.C_Order_ID?.id;
      const lineId = l.id ?? l.C_OrderLine_ID;
      const qtyOrdered     = parseFloat(l.QtyOrdered ?? l.QtyEntered ?? 0);
      const qtyInvoiced    = invoicedByLine.get(String(lineId)) || 0;
      const qtyOutstanding = Math.max(qtyOrdered - qtyInvoiced, 0);
      if (!linesByOrder.has(oId)) linesByOrder.set(oId, []);
      linesByOrder.get(oId).push({
        C_OrderLine_ID: lineId,
        M_Product_ID: fkId(l.M_Product_ID) ?? l.M_Product_ID?.id,
        ProductName:  fkLabel(l.M_Product_ID) || `Produk #${fkId(l.M_Product_ID)}`,
        C_UOM_ID:     fkId(l.C_UOM_ID) ?? l.C_UOM_ID?.id,
        UomName:      fkLabel(l.C_UOM_ID) || '',
        PriceEntered: parseFloat(l.PriceEntered ?? l.PriceActual ?? 0),
        qtyOrdered, qtyInvoiced, qtyOutstanding,
      });
    });

    const merged = orders.map(o => {
      const oId = o.id ?? o.C_Order_ID;
      const orderLines = linesByOrder.get(oId) || [];
      const totalOutstanding = orderLines.reduce((s, l) => s + l.qtyOutstanding, 0);
      return {
        C_Order_ID: oId,
        DocumentNo: o.DocumentNo,
        C_BPartner_ID: fkId(o.C_BPartner_ID) ?? o.C_BPartner_ID?.id,
        VendorName: fkLabel(o.C_BPartner_ID) || '',
        C_BPartner_Location_ID: fkId(o.C_BPartner_Location_ID) ?? o.C_BPartner_Location_ID?.id,
        DateOrdered: o.DateOrdered,
        GrandTotal: parseFloat(o.GrandTotal ?? 0),
        lines: orderLines,
        isFullyInvoiced: totalOutstanding < 0.01,
      };
    });

    // hasMore: kalau jumlah order yang didapat = PAGE_SIZE penuh, kemungkinan
    // masih ada halaman berikutnya (heuristik standar offset-pagination).
    return { merged, hasMore: orders.length === PAGE_SIZE };
  }, []);

  // Fetch awal / re-search — SELALU replace (halaman 0), reset pagination.
  const fetchPOs = useCallback(async (term = '') => {
    setLoading(true);
    setPage(0);
    try {
      const { merged, hasMore: more } = await fetchPage(term, 0);
      setPos(merged);
      setHasMore(more);
    } catch (err) {
      console.error('[usePOInvoiceLines] gagal fetch PO:', err);
      setPos([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  // Muat halaman berikutnya, APPEND ke pos yang sudah ada (bukan replace).
  // Dipakai buat tombol "Muat Lebih Banyak" di UI, supaya PO lama yang
  // masih outstanding tetap bisa dijangkau tanpa harus search manual.
  const fetchNextPage = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const { merged, hasMore: more } = await fetchPage(searchValue, nextPage);
      setPos(prev => [...prev, ...merged]);
      setPage(nextPage);
      setHasMore(more);
    } catch (err) {
      console.error('[usePOInvoiceLines] gagal muat halaman berikutnya:', err);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, page, hasMore, loadingMore, searchValue]);

  const search = useCallback((value) => setSearchValue(value), []);

  return {
    pos, loading, fetchPOs,
    search, searchValue, setSearchValue,
    hasMore, loadingMore, fetchNextPage,
  };
}