/** Lapisan akses data REST untuk Product Analysis (decision support).
 *  Sumber data (semua via /api/v1/models — tanpa SQL kustom):
 *  M_RequisitionLine  → history kebutuhan (requisition)
 *  C_OrderLine        → history PO (IsSOTrx=false) & Sales Order (IsSOTrx=true)
 *  C_InvoiceLine      → history pembelian & penjualan aktual (terinvois)
 *  Fact_Acct          → keterkaitan jurnal accounting produk
 */

import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';

// ─── helpers ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s || '').replace(/'/g, "''");
export const num = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
// `decimals` hanya dipakai kalau berupa bilangan bulat 0–20. Helper ini sering dipasang
// langsung sebagai `render: fmtNum` di kolom tabel, dan callback render dipanggil dengan
// (value, row) — argumen ke-2 berupa OBJECT baris, yang bila diteruskan apa adanya ke
// toLocaleString memicu "RangeError: minimumFractionDigits value is out of range".
export const fmtNum = (v, decimals = 2) => {
  const d = Number.isInteger(decimals) && decimals >= 0 && decimals <= 20 ? decimals : 2;
  return num(v).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
};
export const fmtDate = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v)
    : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};
const MONTHS_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
export const fmtMonth = (ym) => {
  const [y, m] = String(ym).split('-');
  return `${MONTHS_ID[Number(m) - 1]} ${String(y).slice(2)}`;
};

// ─── pencarian produk ─────────────────────────────────────────────────────────
export async function searchProducts(keyword, top = 20) {
  const q = esc(keyword).toUpperCase();
  const filter = q
    ? `(contains(toupper(Name),'${q}') or contains(toupper(Value),'${q}') or contains(toupper(UPC),'${q}'))`
    : `IsActive eq true`;
  const base = `IsActive eq true${q ? ` and ${filter}` : ''}`;
  const res = await idempiereApi(
    `/models/m_product?$filter=${base}&$select=M_Product_ID,Name,Value,UPC,C_UOM_ID&$orderby=Name&$top=${top}`
  );
  return (res?.records || []).map((r) => ({
    id: fkId(r.M_Product_ID) ?? r.id,
    value: r.Value || '',
    name: fkLabel(r.M_Product_ID) || r.Name || '',
    upc: r.UPC || '',
    uom: fkLabel(r.C_UOM_ID) || '',
  }));
}

// ─── lines + header batching ──────────────────────────────────────────────────
// Ambil lines berdasar M_Product_ID, lalu fetch header secara PARALEL
// (dedupe ID, di-cap) untuk dapat DocumentNo/Tanggal/BPartner/IsSOTrx.
async function fetchHeaders(tableName, ids, cap = 50) {
  const uniq = [...new Set(ids.filter(Boolean))].slice(0, cap);
  const entries = await Promise.all(uniq.map(async (id) => {
    try {
      return [id, await idempiereApi(`/models/${tableName}/${id}`)];
    } catch {
      return [id, null];
    }
  }));
  return Object.fromEntries(entries);
}

export async function fetchLinesWithHeaders({ lineTable, headerTable, productId, top = 100 }) {
  const res = await idempiereApi(
    `/models/${lineTable}?$filter=M_Product_ID eq ${productId}&$orderby=Created desc&$top=${top}`
  );
  const lines = res?.records || [];
  const linkCol = `${headerTable}_ID`;
  const headers = await fetchHeaders(
    headerTable, lines.map((l) => fkId(l[linkCol]))
  );
  return lines.map((l) => ({
    line: l,
    header: headers[fkId(l[linkCol])] || null,
  }));
}

// ─── normalisasi rows per dokumen ─────────────────────────────────────────────
export function toRequisitionRows(pairs) {
  return pairs
    .filter((p) => p.header)
    .map((p) => ({
      id: fkId(p.line.M_Requisition_ID) ?? p.line.id,
      docNo: p.header.DocumentNo || '-',
      date: p.header.DateRequired || p.header.Created,
      requester: fkLabel(p.header.AD_User_ID) || '-',
      qty: num(p.line.Qty),
      price: num(p.line.PriceActual),
      amount: num(p.line.Qty) * num(p.line.PriceActual),
      _date: new Date(p.header.DateRequired || p.header.Created || 0).getTime() || 0,
    }))
    .sort((a, b) => b._date - a._date);
}

export function toOrderRows(pairs, isSOTrx) {
  return pairs
    .filter((p) => p.header && p.header.IsSOTrx === isSOTrx)
    .map((p) => ({
      id: p.line.id,
      docNo: p.header.DocumentNo || '-',
      date: p.header.DateOrdered || p.header.Created,
      bp: fkLabel(p.header.C_BPartner_ID) || '-',
      qty: num(p.line.QtyOrdered),
      delivered: num(p.line.QtyDelivered),
      price: num(p.line.PriceActual),
      amount: num(p.line.LineNetAmt) || num(p.line.QtyOrdered) * num(p.line.PriceActual),
      _date: new Date(p.header.DateOrdered || p.header.Created || 0).getTime() || 0,
      _iso: p.header.DateOrdered || p.header.Created,
    }))
    .sort((a, b) => b._date - a._date);
}

export function toInvoiceRows(pairs) {
  return pairs
    .filter((p) => p.header)
    .map((p) => ({
      id: p.line.id,
      docNo: p.header.DocumentNo || '-',
      isSOTrx: p.header.IsSOTrx === true,
      date: p.header.DateInvoiced || p.header.Created,
      bp: fkLabel(p.header.C_BPartner_ID) || '-',
      qty: num(p.line.QtyInvoiced),
      price: num(p.line.PriceActual),
      amount: num(p.line.LineNetAmt) || num(p.line.QtyInvoiced) * num(p.line.PriceActual),
      _date: new Date(p.header.DateInvoiced || p.header.Created || 0).getTime() || 0,
    }))
    .sort((a, b) => b._date - a._date);
}

export function toFactRows(records) {
  return records.map((r) => ({
    id: r.id,
    date: r.DateAcct,
    account: fkLabel(r.Account_ID) || '-',
    debit: num(r.AmtAcctDr),
    credit: num(r.AmtAcctCr),
    table: fkLabel(r.AD_Table_ID) || '-',
    recordId: r.Record_ID ?? '-',
    postingType: r.PostingType || '-',
    _date: new Date(r.DateAcct || 0).getTime() || 0,
  }));
}

// ─── agregasi untuk KPI & grafik ──────────────────────────────────────────────
export function computeKpis({ requisitions, purchases, sales }) {
  const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);
  const last = (rows) => rows.length ? rows[0] : null; // rows sudah sort desc

  const poQty = sum(purchases, 'qty');
  const poAmt = sum(purchases, 'amount');
  const soQty = sum(sales, 'qty');
  const soAmt = sum(sales, 'amount');
  const lastPO = last(purchases);
  const lastSO = last(sales);

  return {
    reqCount: requisitions.length,
    reqQty: sum(requisitions, 'qty'),
    poCount: purchases.length,
    poQty, poAmt,
    poAvgPrice: poQty ? poAmt / poQty : 0,
    lastPOPrice: lastPO?.price ?? 0,
    lastPODate: lastPO?.date ?? null,
    soCount: sales.length,
    soQty, soAmt,
    soAvgPrice: soQty ? soAmt / soQty : 0,
    lastSOPrice: lastSO?.price ?? 0,
    lastSODate: lastSO?.date ?? null,
    margin: lastPO && lastSO ? lastSO.price - lastPO.price : 0,
    marginPct: lastPO?.price ? ((lastSO?.price ?? 0) - lastPO.price) / lastPO.price * 100 : 0,
  };
}

// Series tren harga (untuk LineChart): [{date, 'Harga Beli': n, 'Harga Jual': n}]
export function buildPriceSeries(purchases, sales) {
  const map = new Map();
  const put = (rows, seriesKey) => {
    rows.forEach((r) => {
      const iso = r._iso || r.date;
      if (!iso) return;
      if (!map.has(iso)) {
        map.set(iso, { date: fmtDate(iso), _t: new Date(iso).getTime() || 0 });
      }
      map.get(iso)[seriesKey] = r.price;
    });
  };
  put(purchases, 'Harga Beli');
  put(sales, 'Harga Jual');
  return [...map.values()]
    .sort((a, b) => a._t - b._t)
    .map(({ _t, ...rest }) => rest);
}

// Series volume bulanan (untuk BarChart): [{month:'Jan 26', 'Qty Beli':n, 'Qty Jual':n}]
export function buildMonthlySeries(purchases, sales) {
  const map = new Map();
  const bucket = (rows, key) => {
    rows.forEach((r) => {
      const src = r._iso || r.date;
      if (!src) return;
      const ym = String(src).slice(0, 7); // YYYY-MM
      if (!map.has(ym)) {
        map.set(ym, { _ym: ym, month: fmtMonth(ym), 'Qty Beli': 0, 'Qty Jual': 0 });
      }
      map.get(ym)[key] += r.qty;
    });
  };
  bucket(purchases, 'Qty Beli');
  bucket(sales, 'Qty Jual');
  return [...map.values()]
    .sort((a, b) => a._ym.localeCompare(b._ym))
    .map(({ _ym, ...rest }) => rest);
}