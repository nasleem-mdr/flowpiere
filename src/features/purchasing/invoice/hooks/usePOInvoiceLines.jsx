/** ─────────────────────────────────────────────────────────────────────────────
* usePOInvoiceLines.jsx
* Pengganti useProductSearch.jsx — karena semua pembelian WAJIB lewat PO,
* container ini tidak lagi menampilkan grid produk, tapi grid PO yang SUDAH
* Complete dan MASIH ada sisa qty belum ditagih.
*
* STRATEGI PERHITUNGAN SISA QTY (supaya tidak N+1 request per PO):
*   1. Fetch semua C_Order Complete (IsSOTrx=false, DocStatus='CO') — 1 call.
*   2. Fetch SEMUA C_OrderLine milik PO-PO itu sekaligus — 1 call.
*   3. Fetch SEMUA C_InvoiceLine yg C_OrderLine_ID-nya termasuk di atas,
*      dikecualikan invoice Voided/Reversed — 1 call.
*   4. Agregasi di JS: qtyInvoiced per C_OrderLine_ID, lalu qtyOutstanding
*      per line = QtyOrdered - qtyInvoiced.
*
* ⚠️ Filter nested `C_Invoice_ID.DocStatus notin (...)` BELUM PERNAH DITES
* (Postman lagi down saat ini) — kalau ternyata tidak didukung versi REST
* API Anda, sudah ada fallback try/catch di bawah (ambil semua tanpa filter
* status, sedikit overcount kalau ada invoice voided — cek manual kalau
* sering kejadian). WAJIB dites ulang begitu Postman normal.
*
* PO yang outstanding-nya 0 TETAP di-fetch (browse tidak aneh), tapi
* ditandai `isFullyInvoiced: true` — card-nya di-gray-out, bukan hilang.
* ─────────────────────────────────────────────────────────────────────────────
*/

import { 
  useState, 
  useCallback, 
} from 'react';

import { 
  idempiereApi, 
  fkId, 
  fkLabel, 
} from '@/api/idempiereApi';

export function usePOInvoiceLines() {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const fetchPOs = useCallback(async (term = '') => {
    setLoading(true);
    try {
      const t = term.trim();
      const searchFilter = t
        ? ` and (contains(upper(DocumentNo), upper('${t}')) or contains(upper(C_BPartner_ID.Name), upper('${t}')))`
        : '';
      const poRes = await idempiereApi(
        `/models/c_order?$filter=IsSOTrx eq false and DocStatus eq 'CO'${searchFilter}` +
        `&$select=C_Order_ID,DocumentNo,C_BPartner_ID,C_BPartner_Location_ID,DateOrdered,GrandTotal` +
        `&$orderby=DateOrdered desc&$top=100`
      );
      const orders = Array.isArray(poRes.records) ? poRes.records : [];
      if (orders.length === 0) { setPos([]); return; }

      const orderIds = orders.map(o => o.id ?? o.C_Order_ID);
      const orderFilterStr = orderIds.map(id => `C_Order_ID eq ${id}`).join(' or ');

      const linesRes = await idempiereApi(
        `/models/c_orderline?$filter=${orderFilterStr}` +
        `&$select=C_OrderLine_ID,C_Order_ID,M_Product_ID,C_UOM_ID,QtyOrdered,QtyEntered,PriceEntered,PriceActual&$top=1000`
      );
      const lines = Array.isArray(linesRes.records) ? linesRes.records : [];
      if (lines.length === 0) { setPos([]); return; }

      const lineIds = lines.map(l => l.id ?? l.C_OrderLine_ID);
      const lineFilterStr = lineIds.map(id => `C_OrderLine_ID eq ${id}`).join(' or ');

      let invoiceLines = [];
      try {
        // Step 1: ambil SEMUA invoice line untuk order line ini, TANPA filter
        // status (nested filter c_invoice_id.DocStatus dengan operator apapun
        // selain 'eq' tidak didukung REST plugin ini — sudah dicoba 'notin' dan
        // 'ne', keduanya gagal dengan "Unsupported operator").
        const invLinesRes = await idempiereApi(
          `/models/c_invoiceline?$filter=${lineFilterStr}` +
          `&$select=C_OrderLine_ID,QtyInvoiced,C_Invoice_ID&$top=2000`
        );
        const rawInvoiceLines = Array.isArray(invLinesRes.records) ? invLinesRes.records : [];

        // Step 2: kumpulkan C_Invoice_ID unik, fetch DocStatus-nya sekaligus
        // (operator 'eq' + 'or' dipastikan didukung — sudah dipakai di banyak
        // tempat lain di codebase ini).
        const invoiceIds = [...new Set(
          rawInvoiceLines.map(il => fkId(il.C_Invoice_ID) ?? il.C_Invoice_ID?.id).filter(Boolean)
        )];

        let voidedOrReversedIds = new Set();
        if (invoiceIds.length > 0) {
          const invoiceFilterStr = invoiceIds.map(id => `C_Invoice_ID eq ${id}`).join(' or ');
          const invStatusRes = await idempiereApi(
            `/models/c_invoice?$filter=${invoiceFilterStr}&$select=C_Invoice_ID,DocStatus&$top=${invoiceIds.length}`
          );
          const invStatusRecords = Array.isArray(invStatusRes.records) ? invStatusRes.records : [];
          invStatusRecords.forEach(inv => {
            const status = inv.DocStatus?.id ?? inv.DocStatus;
            if (status === 'VO' || status === 'RE') {
              voidedOrReversedIds.add(inv.id ?? inv.C_Invoice_ID);
            }
          });
        }

        // Step 3: exclude invoice line yang C_Invoice_ID-nya VO/RE — di JS.
        invoiceLines = rawInvoiceLines.filter(il => {
          const invId = fkId(il.C_Invoice_ID) ?? il.C_Invoice_ID?.id;
          return !voidedOrReversedIds.has(invId);
        });
      } catch (err) {
        console.error('[usePOInvoiceLines] gagal fetch invoice lines (2-step):', err.message);
        invoiceLines = [];
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
        // Rasio konversi UOM per baris — dihitung dari QtyOrdered (base)
        // vs QtyEntered (UOM yang dipilih user saat PO dibuat, mis. Kotak).
        // Sudah tersedia dari API c_orderline di atas, TIDAK perlu fetch
        // C_UOM_Conversion terpisah. Dipakai oleh POLineDetailSheet untuk
        // menampilkan & menghitung qty dalam UOM entered (bukan base),
        // supaya "Sisa X Kotak" dan QtyEntered yang dikirim ke invoice line
        // konsisten satu sama lain (lihat POLineDetailSheet.jsx).
        const qtyEnteredOriginal = parseFloat(l.QtyEntered ?? qtyOrdered ?? 0);
        const multiplyRate = qtyEnteredOriginal > 0 ? (qtyOrdered / qtyEnteredOriginal) : 1;
        if (!linesByOrder.has(oId)) linesByOrder.set(oId, []);
        linesByOrder.get(oId).push({
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

      const merged = orders
        .map(o => {
          const oId = o.id ?? o.C_Order_ID;
          const orderLines = linesByOrder.get(oId) || [];
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
            isFullyInvoiced: totalOutstanding < 0.01,
            hasAnyInvoice: totalInvoiced > 0.01,   // ⬅️ baru — sudah exclude invoice VO/RE dari step 2
          };
        })
        // Hanya tampilkan PO yang BELUM PERNAH dibuat invoice sama sekali —
        // PO yang sudah punya invoice (baik partial maupun full) disembunyikan,
        // bukan cuma di-gray-out. Invoice berstatus VO/RE tidak dihitung
        // (sudah di-exclude di step invoiceLines di atas), jadi PO yang
        // invoice-nya cuma pernah dibuat lalu di-void tetap dianggap "belum
        // dibuat invoice" dan tetap muncul di sini.
        .filter(po => !po.hasAnyInvoice);

      setPos(merged);
    } catch (err) {
      console.error('[usePOInvoiceLines] gagal fetch PO:', err);
      setPos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const search = useCallback((value) => setSearchValue(value), []);

  return { pos, loading, fetchPOs, search, searchValue, setSearchValue };
}