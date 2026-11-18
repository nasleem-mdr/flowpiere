import { useState, useCallback } from 'react';
import { idempiereApi } from '@/api/idempiereApi';

// bxservice hanya mengembalikan maksimal 100 baris per request (meski $top lebih besar),
// jadi semua fetch di sini memakai loop paging $skip.
const PAGE_SIZE     = 100;
const LINE_CHUNK    = 20;  // jumlah order per query c_orderline
const LINE_PARALLEL = 3;   // jumlah query c_orderline yang jalan bersamaan

const SHEET_NAME = 'Detail per No Order';
const XLSX_MIME  = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const fkId = (v) => (v && typeof v === 'object' ? v.id : v);

// Identifier M_Product_ID berbentuk "Value_Name". Kalau Value dan Name sama
// ("Pena AE7_Pena AE7"), tampilkan satu saja ("Pena AE7"). Kalau berbeda,
// identifier dipakai apa adanya.
const collapseSameValueName = (identifier) => {
  const s = String(identifier || '').trim();
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1 && s[mid] === '_') {
    const left = s.slice(0, mid).trim();
    const right = s.slice(mid + 1).trim();
    if (left && left === right) return left;
  }
  return s;
};

const getProductName = (fk) =>
  collapseSameValueName(fk && typeof fk === 'object' ? fk.identifier : '');

// "2026-11-17" -> Date (UTC) supaya tidak bergeser hari di Excel
const toExcelDate = (str) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ''));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
};

async function fetchAllPages(buildUrl) {
  const all = [];
  let skip = 0;
  for (;;) {
    const res = await idempiereApi(buildUrl(skip));
    const records = Array.isArray(res?.records) ? res.records : [];
    if (records.length === 0) break;
    all.push(...records);
    skip += records.length;

    const total = res?.['row-count'];
    if (typeof total === 'number' ? skip >= total : records.length < PAGE_SIZE) break;
  }
  return all;
}

// Ambil baris c_orderline untuk sekelompok order, kembalikan array flat
function fetchLinesForOrders(orderIds) {
  const filter = orderIds.map((id) => `C_Order_ID eq ${id}`).join(' or ');
  return fetchAllPages((skip) =>
    `/models/c_orderline?$filter=${encodeURIComponent(filter)}` +
    `&$select=C_OrderLine_ID,C_Order_ID,M_Product_ID,Line` +
    `&$orderby=C_OrderLine_ID asc&$top=${PAGE_SIZE}&$skip=${skip}`
  );
}

// Map orderId -> "Produk A, Produk B, ..." (urut sesuai Line, nama kembar digabung)
async function fetchProductsByOrder(orderIds) {
  const chunks = [];
  for (let i = 0; i < orderIds.length; i += LINE_CHUNK) {
    chunks.push(orderIds.slice(i, i + LINE_CHUNK));
  }

  const linesByOrder = new Map();
  for (let i = 0; i < chunks.length; i += LINE_PARALLEL) {
    const results = await Promise.all(
      chunks.slice(i, i + LINE_PARALLEL).map(fetchLinesForOrders)
    );
    for (const line of results.flat()) {
      const name = getProductName(line.M_Product_ID);
      if (!name) continue; // baris tanpa produk (mis. charge) dilewati
      const key = Number(fkId(line.C_Order_ID));
      if (!linesByOrder.has(key)) linesByOrder.set(key, []);
      linesByOrder.get(key).push({ no: Number(line.Line) || 0, name });
    }
  }

  const result = new Map();
  for (const [orderId, lines] of linesByOrder) {
    lines.sort((a, b) => a.no - b.no);
    result.set(orderId, [...new Set(lines.map((l) => l.name))].join(', '));
  }
  return result;
}

async function buildWorkbookBuffer({ rows, startDate, endDate }) {
  const mod = await import('exceljs');
  const ExcelJS = mod.default ?? mod;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET_NAME);

  [6, 24, 32, 14, 60, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  ws.getRow(1).values = ['LAPORAN DETAIL PURCHASE ORDER (PER NO. ORDER)'];
  ws.getRow(2).values = [`Periode: ${startDate} s/d ${endDate}`];
  ws.getRow(4).values = ['No', 'No PO', 'Supplier', 'Tanggal', 'Product', 'Total'];

  rows.forEach((r, idx) => {
    const row = ws.getRow(5 + idx);
    row.values = [idx + 1, r.documentNo, r.vendor || '-', r.date ?? '-', r.products || '-', r.total];
    row.getCell(4).numFmt = 'dd/mm/yyyy';
    row.getCell(6).numFmt = '#,##0';
    [3, 5].forEach((c) => {
      row.getCell(c).alignment = { wrapText: true, vertical: 'top' };
    });
    [1, 2, 4, 6].forEach((c) => {
      row.getCell(c).alignment = { vertical: 'top' };
    });
  });

  // Font seragam seperti format contoh (Calibri 12)
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = { name: 'Calibri', size: 12 };
    });
  });

  return wb.xlsx.writeBuffer();
}

function downloadBlob(buffer, filename) {
  const blob = new Blob([buffer], { type: XLSX_MIME });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Hook export Excel "Detail Purchase Order per No Order".
 *
 * const { exportExcel, exporting } = usePurchaseOrderExcel();
 * const count = await exportExcel({ filterClause, startDate, endDate });
 *
 * - filterClause : klausa $filter c_order (pakai yang sama dengan list di layar)
 * - return       : jumlah PO yang diexport (0 = tidak ada data, file tidak dibuat)
 */
export function usePurchaseOrderExcel() {
  const [exporting, setExporting] = useState(false);

  const exportExcel = useCallback(async ({ filterClause, startDate, endDate }) => {
    setExporting(true);
    try {
      const orders = await fetchAllPages((skip) =>
        `/models/c_order?$filter=${encodeURIComponent(filterClause)}` +
        `&$select=C_Order_ID,DocumentNo,DateOrdered,C_BPartner_ID,GrandTotal` +
        `&$orderby=DocumentNo asc&$top=${PAGE_SIZE}&$skip=${skip}`
      );
      if (orders.length === 0) return 0;

      const orderIds = orders.map((o) => Number(o.id ?? o.C_Order_ID));
      const productsByOrder = await fetchProductsByOrder(orderIds);

      const rows = orders
        .map((o, i) => ({
          documentNo: o.DocumentNo || `#${orderIds[i]}`,
          vendor:     collapseSameValueName(o.C_BPartner_ID?.identifier),
          date:       toExcelDate(o.DateOrdered),
          products:   productsByOrder.get(orderIds[i]) || '',
          total:      Number(o.GrandTotal) || 0,
        }))
        .sort((a, b) => a.documentNo.localeCompare(b.documentNo, undefined, { numeric: true }));

      const buffer = await buildWorkbookBuffer({ rows, startDate, endDate });
      downloadBlob(buffer, `PURCHASE-ORDER-DETAIL-PER-NO-ORDER-${startDate}_${endDate}.xlsx`);
      return rows.length;
    } finally {
      setExporting(false);
    }
  }, []);

  return { exportExcel, exporting };
}