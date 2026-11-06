// Layer data untuk Laporan Penelusuran Procurement (QC).
// Semua panggilan REST lewat callGet() -> hanya SATU tempat yang perlu disesuaikan dengan idempiereApi Anda.
import * as apiModule from "@/api/idempiereApi"; // ADAPT: sesuaikan path

const PAGE = 100;     // bxservice hanya mengembalikan 100 baris per request
const CHUNK = 40;     // jumlah "X eq id or ..." per request
const PARALLEL = 3;   // chunk paralel

// idempiereApi bisa berupa named export, default export, fungsi, atau objek.
const client = apiModule.idempiereApi ?? apiModule.default ?? apiModule;

const buildQuery = (params = {}) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

async function callGet(path, params) {
  const qs = buildQuery(params);
  const url = qs ? `${path}?${qs}` : path;
  let res;
  if (typeof client?.get === "function") res = await client.get(url);
  else if (typeof client === "function") res = await client(url);
  else if (typeof client?.request === "function") res = await client.request(url);
  else {
    throw new Error(
      `idempiereApi tidak punya get()/fungsi pemanggil. Export yang tersedia: ${Object.keys(apiModule).join(", ")}`
    );
  }
  if (res && typeof res.json === "function") res = await res.json(); // fetch Response
  return res?.data ?? res;
}

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

// bxservice mengirim primary key sebagai field `id` (bukan nama kolom PK).
// Alias-kan kembali ke nama kolom PK agar kode lain bisa memakai r.C_Order_ID dst.
const PK = {
  m_requisition: "M_Requisition_ID", m_requisitionline: "M_RequisitionLine_ID",
  c_order: "C_Order_ID", c_orderline: "C_OrderLine_ID",
  m_inout: "M_InOut_ID", m_inoutline: "M_InOutLine_ID",
  c_invoice: "C_Invoice_ID", c_invoiceline: "C_InvoiceLine_ID",
  c_payment: "C_Payment_ID", c_paymentallocate: "C_PaymentAllocate_ID",
  c_allocationline: "C_AllocationLine_ID",
  m_product: "M_Product_ID",
};

/** FK {id, identifier} -> Key = id, Key_Name = identifier. PK di-alias dari `id`. */
export function normalize(rec, table) {
  const out = {};
  for (const [k, v] of Object.entries(rec || {})) {
    if (isObj(v) && "id" in v) {
      out[k] = v.id;
      out[`${k}_Name`] = v.identifier;
    } else out[k] = v;
  }
  const pk = PK[table];
  if (pk && (out[pk] === undefined || out[pk] === null) && out.id !== undefined) out[pk] = out.id;
  return out;
}

/** Ambil semua halaman ($skip loop sampai row-count terpenuhi). */
export async function fetchAll(table, { filter, select, orderby } = {}) {
  const rows = [];
  let skip = 0;
  let total = Infinity;
  while (skip < total) {
    const data = await callGet(`/models/${table}`, {
      $filter: filter, $select: select, $orderby: orderby, $top: PAGE, $skip: skip,
    });
    const recs = data?.records ?? [];
    total = data?.["row-count"] ?? recs.length;
    rows.push(...recs.map((r) => normalize(r, table)));
    if (!recs.length) break;
    skip += recs.length;
  }
  return rows;
}

/** Ambil baris berdasarkan daftar id (chunked OR filter). */
export async function fetchByIds(table, field, ids, { select, orderby, extra } = {}) {
  const uniq = [...new Set((ids || []).filter((v) => v !== null && v !== undefined))];
  const chunks = [];
  for (let i = 0; i < uniq.length; i += CHUNK) chunks.push(uniq.slice(i, i + CHUNK));
  const out = [];
  for (let i = 0; i < chunks.length; i += PARALLEL) {
    const batch = await Promise.all(
      chunks.slice(i, i + PARALLEL).map((c) => {
        const ors = c.map((id) => `${field} eq ${id}`).join(" or ");
        return fetchAll(table, { filter: extra ? `(${ors}) and ${extra}` : `(${ors})`, select, orderby });
      })
    );
    batch.forEach((b) => out.push(...b));
  }
  return out;
}

const uniqBy = (arr, key) => [...new Map(arr.map((r) => [r[key], r])).values()];
const ids = (arr, key) => arr.map((r) => r[key]).filter(Boolean);

// Kolom yang diambil (hapus $select bila ada kolom yang tidak ada di instance Anda)
const SEL = {
  req: "DocumentNo,DateDoc,DateRequired,DocStatus,Description",
  reqLine: "M_Requisition_ID,Line,M_Product_ID,Qty,C_OrderLine_ID",
  po: "DocumentNo,DateOrdered,DocStatus,C_BPartner_ID,GrandTotal,IsSOTrx",
  poLine: "C_Order_ID,Line,QtyOrdered,QtyDelivered,QtyInvoiced",
  io: "DocumentNo,MovementDate,DocStatus,C_BPartner_ID,C_Order_ID",
  ioLine: "M_InOut_ID,C_OrderLine_ID,MovementQty",
  inv: "DocumentNo,DateInvoiced,DocStatus,C_BPartner_ID,GrandTotal,IsPaid,C_Order_ID",
  invLine: "C_Invoice_ID,C_OrderLine_ID,M_InOutLine_ID,QtyInvoiced",
  pay: "DocumentNo,DateTrx,DocStatus,PayAmt,C_BPartner_ID,C_Invoice_ID",
  payLink: "C_Payment_ID,C_Invoice_ID",
};

const nextDay = (s) => {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Ambil seluruh rantai Requisition -> PO -> GR -> Invoice -> Payment.
 * Titik awal: Requisition & PO dalam rentang tanggal. Dokumen hilir dicari lewat tabel line.
 * Perluasan hulu dilakukan 1 level (PO dari requisition di luar periode, & sebaliknya).
 */
export async function fetchProcurementData({ dateFrom, dateTo }, onProgress = () => {}) {
  const rng = (col) => `${col} ge '${dateFrom}' and ${col} lt '${nextDay(dateTo)}'`;

  onProgress("Mengambil Requisition & Purchase Order…");
  let [reqs, pos] = await Promise.all([
    fetchAll("m_requisition", { filter: rng("DateDoc"), select: SEL.req, orderby: "M_Requisition_ID" }),
    fetchAll("c_order", { filter: `IsSOTrx eq false and ${rng("DateOrdered")}`, select: SEL.po, orderby: "C_Order_ID" }),
  ]);
  let [reqLines, poLines] = await Promise.all([
    fetchByIds("m_requisitionline", "M_Requisition_ID", ids(reqs, "M_Requisition_ID"), { select: SEL.reqLine, orderby: "M_RequisitionLine_ID" }),
    fetchByIds("c_orderline", "C_Order_ID", ids(pos, "C_Order_ID"), { select: SEL.poLine, orderby: "C_OrderLine_ID" }),
  ]);

  onProgress("Menelusuri relasi Requisition ↔ PO…");
  // A) PO yang dirujuk requisition tetapi di luar periode
  const knownOL = new Set(poLines.map((l) => l.C_OrderLine_ID));
  const missOL = ids(reqLines, "C_OrderLine_ID").filter((id) => !knownOL.has(id));
  if (missOL.length) {
    const extra = await fetchByIds("c_orderline", "C_OrderLine_ID", missOL, { select: SEL.poLine, orderby: "C_OrderLine_ID" });
    const have = new Set(ids(pos, "C_Order_ID"));
    const newPo = [...new Set(ids(extra, "C_Order_ID"))].filter((id) => !have.has(id));
    if (newPo.length) {
      const [h, l] = await Promise.all([
        fetchByIds("c_order", "C_Order_ID", newPo, { select: SEL.po, orderby: "C_Order_ID" }),
        fetchByIds("c_orderline", "C_Order_ID", newPo, { select: SEL.poLine, orderby: "C_OrderLine_ID" }),
      ]);
      pos = pos.concat(h);
      poLines = poLines.concat(l);
    }
  }
  // B) Requisition yang merujuk line PO (hubungan hanya tersimpan di M_RequisitionLine.C_OrderLine_ID)
  const linkedRL = await fetchByIds("m_requisitionline", "C_OrderLine_ID", ids(poLines, "C_OrderLine_ID"), { select: SEL.reqLine, orderby: "M_RequisitionLine_ID" });
  const knownRL = new Set(reqLines.map((l) => l.M_RequisitionLine_ID));
  const extraRL = linkedRL.filter((l) => !knownRL.has(l.M_RequisitionLine_ID));
  if (extraRL.length) {
    const have = new Set(ids(reqs, "M_Requisition_ID"));
    const newReq = [...new Set(ids(extraRL, "M_Requisition_ID"))].filter((id) => !have.has(id));
    if (newReq.length) {
      const [h, l] = await Promise.all([
        fetchByIds("m_requisition", "M_Requisition_ID", newReq, { select: SEL.req, orderby: "M_Requisition_ID" }),
        fetchByIds("m_requisitionline", "M_Requisition_ID", newReq, { select: SEL.reqLine, orderby: "M_RequisitionLine_ID" }),
      ]);
      reqs = reqs.concat(h);
      reqLines = reqLines.concat(l);
    }
    // line yang sudah termuat tetapi belum ada di reqLines (requisition sudah ada, line sama) tidak perlu ditambah lagi
  }

  onProgress("Mengambil Penerimaan Barang & Invoice…");
  const olIds = ids(poLines, "C_OrderLine_ID");
  const ioLines = await fetchByIds("m_inoutline", "C_OrderLine_ID", olIds, { select: SEL.ioLine, orderby: "M_InOutLine_ID" });
  const ios = await fetchByIds("m_inout", "M_InOut_ID", ids(ioLines, "M_InOut_ID"), { select: SEL.io, orderby: "M_InOut_ID" });
  const [invLinesA, invLinesB] = await Promise.all([
    fetchByIds("c_invoiceline", "C_OrderLine_ID", olIds, { select: SEL.invLine, orderby: "C_InvoiceLine_ID" }),
    fetchByIds("c_invoiceline", "M_InOutLine_ID", ids(ioLines, "M_InOutLine_ID"), { select: SEL.invLine, orderby: "C_InvoiceLine_ID" }),
  ]);
  const invLines = uniqBy([...invLinesA, ...invLinesB], "C_InvoiceLine_ID");
  const invs = await fetchByIds("c_invoice", "C_Invoice_ID", ids(invLines, "C_Invoice_ID"), { select: SEL.inv, orderby: "C_Invoice_ID" });

  onProgress("Mengambil Pembayaran…");
  const invIds = ids(invs, "C_Invoice_ID");
  const [allocLines, payAllocs, payDirect] = await Promise.all([
    fetchByIds("c_allocationline", "C_Invoice_ID", invIds, { select: SEL.payLink, orderby: "C_AllocationLine_ID" }),
    fetchByIds("c_paymentallocate", "C_Invoice_ID", invIds, { select: SEL.payLink, orderby: "C_PaymentAllocate_ID" }),
    fetchByIds("c_payment", "C_Invoice_ID", invIds, { select: SEL.pay, orderby: "C_Payment_ID" }),
  ]);
  const payLinks = [
    ...allocLines.filter((l) => l.C_Payment_ID),
    ...payAllocs.filter((l) => l.C_Payment_ID),
    ...payDirect.map((p) => ({ C_Payment_ID: p.C_Payment_ID, C_Invoice_ID: p.C_Invoice_ID })),
  ];
  const haveP = new Set(ids(payDirect, "C_Payment_ID"));
  const needP = [...new Set(ids(payLinks, "C_Payment_ID"))].filter((id) => !haveP.has(id));
  const payMore = await fetchByIds("c_payment", "C_Payment_ID", needP, { select: SEL.pay, orderby: "C_Payment_ID" });
  const pays = payDirect.concat(payMore);
  onProgress("Mengambil nama produk…");
  const products = await fetchByIds("m_product", "M_Product_ID", ids(reqLines, "M_Product_ID"), {
    select: "Name", orderby: "M_Product_ID",
  });
  
  return { reqs, reqLines, pos, poLines, ios, ioLines, invs, invLines, pays, payLinks, products };
}

/* ---------- Detail dokumen (untuk modal) ---------- */
export async function fetchDocDetail(meta, id) {
  const header = normalize(await callGet(`/models/${meta.table}/${id}`), meta.table);
  const lines = await fetchAll(meta.lineTable, { filter: `${meta.pk} eq ${id}`, orderby: meta.linePk });
  return { header, lines };
}