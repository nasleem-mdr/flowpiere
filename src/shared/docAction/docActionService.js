import { idempiereApi } from "@/api/idempiereApi";
import { DOC_ACTION_CONFIG, RESOLVED_STATUSES, STATUS_LABEL } from "./docActionConfig";

const PAGE = 100;   // bxservice membatasi 100 baris per request
const CHUNK = 40;

const fk = (v) => (v && typeof v === "object" ? v.id : v);
export const statusOf = (v) => (v && typeof v === "object" ? v.id : v);
const uniq = (arr) => [...new Set(arr.filter((v) => v !== null && v !== undefined))];

async function getAll(table, filter, select, orderby) {
  const rows = [];
  let skip = 0, total = Infinity;
  while (skip < total) {
    const res = await idempiereApi(
      `/models/${table}?$filter=${encodeURIComponent(filter)}` +
      (select ? `&$select=${select}` : "") +
      (orderby ? `&$orderby=${orderby}` : "") +
      `&$top=${PAGE}&$skip=${skip}`
    );
    const recs = Array.isArray(res?.records) ? res.records : [];
    total = res?.["row-count"] ?? recs.length;
    rows.push(...recs);
    if (!recs.length) break;
    skip += recs.length;
  }
  return rows;
}

async function byIds(table, field, ids, select, orderby) {
  const list = uniq(ids);
  const out = [];
  for (let i = 0; i < list.length; i += CHUNK) {
    const filter = list.slice(i, i + CHUNK).map((id) => `${field} eq ${id}`).join(" or ");
    out.push(...(await getAll(table, `(${filter})`, select, orderby)));
  }
  return out;
}

// PK dikirim bxservice sebagai `id`
const headers = async (table, pk, ids) =>
  (await byIds(table, pk, ids, "DocumentNo,DocStatus", pk)).map((r) => ({ id: r.id, no: r.DocumentNo, status: statusOf(r.DocStatus) }));
const tag = (type, label, docs) => docs.map((d) => ({ ...d, type, typeLabel: label }));

/* ---- Resolver: dokumen tahap BERIKUTNYA dari sebuah dokumen (lewat tabel line) ---- */
const DOWNSTREAM = {
  // Requisition -> PO
  M_Requisition: async (id) => {
    const lines = await getAll("m_requisitionline", `M_Requisition_ID eq ${id}`, "C_OrderLine_ID", "M_RequisitionLine_ID");
    const olIds = uniq(lines.map((l) => fk(l.C_OrderLine_ID)));
    if (!olIds.length) return [];
    const ols = await byIds("c_orderline", "C_OrderLine_ID", olIds, "C_Order_ID", "C_OrderLine_ID");
    return tag("PO", "Purchase Order", await headers("c_order", "C_Order_ID", ols.map((r) => fk(r.C_Order_ID))));
  },
  // PO -> Penerimaan Barang + Invoice
  C_Order: async (id) => {
    const olIds = (await getAll("c_orderline", `C_Order_ID eq ${id}`, "Line", "C_OrderLine_ID")).map((l) => l.id);
    if (!olIds.length) return [];
    const [io, inv] = await Promise.all([
      byIds("m_inoutline", "C_OrderLine_ID", olIds, "M_InOut_ID", "M_InOutLine_ID"),
      byIds("c_invoiceline", "C_OrderLine_ID", olIds, "C_Invoice_ID", "C_InvoiceLine_ID"),
    ]);
    const [grs, invs] = await Promise.all([
      headers("m_inout", "M_InOut_ID", io.map((r) => fk(r.M_InOut_ID))),
      headers("c_invoice", "C_Invoice_ID", inv.map((r) => fk(r.C_Invoice_ID))),
    ]);
    return [...tag("GR", "Penerimaan Barang", grs), ...tag("INV", "Invoice Vendor", invs)];
  },
  // Penerimaan Barang -> Invoice
  M_InOut: async (id) => {
    const ioLineIds = (await getAll("m_inoutline", `M_InOut_ID eq ${id}`, "Line", "M_InOutLine_ID")).map((l) => l.id);
    if (!ioLineIds.length) return [];
    const inv = await byIds("c_invoiceline", "M_InOutLine_ID", ioLineIds, "C_Invoice_ID", "C_InvoiceLine_ID");
    return tag("INV", "Invoice Vendor", await headers("c_invoice", "C_Invoice_ID", inv.map((r) => fk(r.C_Invoice_ID))));
  },
  // Invoice -> Pembayaran
  C_Invoice: async (id) => {
    const [alloc, pa, direct] = await Promise.all([
      getAll("c_allocationline", `C_Invoice_ID eq ${id}`, "C_Payment_ID", "C_AllocationLine_ID"),
      getAll("c_paymentallocate", `C_Invoice_ID eq ${id}`, "C_Payment_ID", "C_PaymentAllocate_ID"),
      getAll("c_payment", `C_Invoice_ID eq ${id}`, "DocumentNo", "C_Payment_ID"),
    ]);
    const payIds = uniq([...alloc.map((r) => fk(r.C_Payment_ID)), ...pa.map((r) => fk(r.C_Payment_ID)), ...direct.map((r) => r.id)]);
    if (!payIds.length) return [];
    return tag("PAY", "Pembayaran", await headers("c_payment", "C_Payment_ID", payIds));
  },
  C_Payment: async () => [],
};

export async function pool(list, size, fn) {
  const queue = [...list];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

const currentStatus = async (cfg, id) =>
  statusOf((await idempiereApi(`/models/${cfg.path}/${id}?$select=DocStatus`)).DocStatus);

/**
 * Periksa apakah aksi boleh dijalankan.
 * return { state: 'ready' | 'blocked' | 'invalid', status, message, blockers[] }
 */
export async function previewItem(tableName, item, actionCode) {
  const cfg = DOC_ACTION_CONFIG[tableName];
  const act = cfg.actions.find((a) => a.code === actionCode);
  const status = await currentStatus(cfg, item.id); // status terbaru, bukan status di list
  if (!act.statuses.includes(status)) {
    return { state: "invalid", status, message: `Status ${STATUS_LABEL[status] || status} tidak mendukung ${act.label}.` };
  }
  if (act.checkDownstream !== false) {
    const blockers = (await DOWNSTREAM[tableName](item.id)).filter((d) => !RESOLVED_STATUSES.includes(d.status));
    if (blockers.length) {
      return {
        state: "blocked", status, blockers,
        message: `Sudah diproses ke tahap berikutnya. Void/Close dokumen berikut terlebih dahulu.`,
      };
    }
  }
  return { state: "ready", status, message: "" };
}

/** Periksa ulang lalu jalankan aksi dan verifikasi status hasilnya. */
export async function runItem(tableName, item, actionCode) {
  const cfg = DOC_ACTION_CONFIG[tableName];
  const act = cfg.actions.find((a) => a.code === actionCode);
  try {
    const pre = await previewItem(tableName, item, actionCode);
    if (pre.state !== "ready") return pre;
    await idempiereApi(`/models/${cfg.path}/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({ "doc-action": act.code }),
    });
    const after = await currentStatus(cfg, item.id);
    if (!act.expect.includes(after)) {
      return { state: "error", status: after, message: `${act.label} tidak berhasil: status masih ${STATUS_LABEL[after] || after}. Periksa pesan proses di iDempiere.` };
    }
    return { state: "success", status: after, message: `Status sekarang ${STATUS_LABEL[after] || after}.` };
  } catch (err) {
    return { state: "error", message: err?.message || "Aksi gagal dijalankan." };
  }
}
