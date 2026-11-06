// Menyusun baris laporan dari data mentah. Murni (tanpa side-effect) -> mudah dites.
const DAY = 86400000;
export const DONE = ["CO", "CL"];
export const VOIDED = ["VO", "RE"];
const ACTIVE = ["pending", "partial", "draft"];

export const STATUS_LABEL = {
  done: "Selesai", partial: "Sebagian", pending: "Belum diproses",
  draft: "Draft", wait: "Menunggu tahap sebelumnya", na: "Tanpa requisition",
};
export const OVERALL_LABEL = { selesai: "Selesai", berjalan: "Berjalan", terlambat: "Terlambat", anomali: "Anomali" };
const STAGE_LABEL = { req: "Persetujuan requisition", po: "PO", gr: "Penerimaan barang", inv: "Invoice vendor", pay: "Pembayaran" };

const isTrue = (v) => v === true || v === "Y";
const num = (v) => Number(v) || 0;
const sum = (arr, k) => arr.reduce((a, r) => a + num(r[k]), 0);
const isDone = (r) => DONE.includes(r.DocStatus);
const isVoid = (r) => VOIDED.includes(r.DocStatus);
const toDate = (s) => {
  if (!s) return null;
  const d = new Date(String(s).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
};
const latest = (arr) => arr.map(toDate).filter(Boolean).sort((a, b) => b - a)[0] || null;
const addTo = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
const groupBy = (arr, fn) => { const m = new Map(); arr.forEach((x) => { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return m; };
const age = (status, from, today) => (ACTIVE.includes(status) && from ? Math.max(0, Math.floor((today - from) / DAY)) : null);
const fmtQ = (n) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 });

export const fmtDate = (s) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "");

export function toDoc(type, r) {
  switch (type) {
    case "REQ": return { type, id: r.M_Requisition_ID, no: r.DocumentNo, date: r.DateDoc, status: r.DocStatus };
    case "PO": return { type, id: r.C_Order_ID, no: r.DocumentNo, date: r.DateOrdered, status: r.DocStatus };
    case "GR": return { type, id: r.M_InOut_ID, no: r.DocumentNo, date: r.MovementDate, status: r.DocStatus };
    case "INV": return { type, id: r.C_Invoice_ID, no: r.DocumentNo, date: r.DateInvoiced, status: r.DocStatus };
    default: return { type, id: r.C_Payment_ID, no: r.DocumentNo, date: r.DateTrx, status: r.DocStatus };
  }
}

/** status tahap: ready=tahap sebelumnya sudah jalan, pct=0..1 */
function flow(ready, docs, pct) {
  if (!ready) return "wait";
  if (pct >= 0.9999) return "done";
  if (pct > 0) return "partial";
  return docs.length ? "draft" : "pending";
}

export function buildTraceRows(data, { slaDays = 3, includeVoid = false, today = new Date() } = {}) {
  const keep = (r) => includeVoid || !isVoid(r);
  const productName = new Map((data.products || []).map((p) => [p.M_Product_ID ?? p.id, p.Name]));
  const reqMap = new Map(data.reqs.filter(keep).map((r) => [r.M_Requisition_ID, r]));
  const poMap = new Map(data.pos.filter(keep).map((r) => [r.C_Order_ID, r]));
  const ioMap = new Map(data.ios.filter(keep).map((r) => [r.M_InOut_ID, r]));
  const invMap = new Map(data.invs.filter(keep).map((r) => [r.C_Invoice_ID, r]));
  const payMap = new Map(data.pays.filter(keep).map((r) => [r.C_Payment_ID, r]));

  const reqLinesByReq = groupBy(data.reqLines, (l) => l.M_Requisition_ID);
  const poLinesByPo = groupBy(data.poLines, (l) => l.C_Order_ID);
  const reqLineById = new Map(data.reqLines.map((l) => [l.M_RequisitionLine_ID, l]));
  const poLineById = new Map(data.poLines.map((l) => [l.C_OrderLine_ID, l]));

  // --- Requisition <-> PO (via line, dua arah) ---
  const olToRl = new Map();
  data.reqLines.forEach((l) => l.C_OrderLine_ID && olToRl.set(l.C_OrderLine_ID, l.M_RequisitionLine_ID));
  const poToReqs = new Map(), reqToPos = new Map(), coveredRL = new Set();
  olToRl.forEach((rlId, olId) => {
    const ol = poLineById.get(olId), rl = reqLineById.get(rlId);
    if (!ol || !rl) return;
    const po = poMap.get(ol.C_Order_ID), rq = reqMap.get(rl.M_Requisition_ID);
    if (!po || !rq) return;
    addTo(poToReqs, po.C_Order_ID, rq.M_Requisition_ID);
    addTo(reqToPos, rq.M_Requisition_ID, po.C_Order_ID);
    coveredRL.add(rlId);
  });
  const reqInfo = (rq) => {
    const ls = reqLinesByReq.get(rq.M_Requisition_ID) || [];
    const covered = ls.filter((l) => coveredRL.has(l.M_RequisitionLine_ID)).length;
    return { ...toDoc("REQ", rq), total: ls.length, covered, poCount: (reqToPos.get(rq.M_Requisition_ID) || new Set()).size };
  };

  // --- PO -> GR ---
  const ioByPo = new Map(), olIoLineToPo = new Map();
  data.ioLines.forEach((l) => {
    const ol = poLineById.get(l.C_OrderLine_ID);
    if (!ol || !ioMap.has(l.M_InOut_ID)) return;
    addTo(ioByPo, ol.C_Order_ID, l.M_InOut_ID);
    if (l.M_InOutLine_ID) olIoLineToPo.set(l.M_InOutLine_ID, ol.C_Order_ID);
  });
  // --- PO -> Invoice ---
  const invByPo = new Map();
  data.invLines.forEach((l) => {
    const poId = poLineById.get(l.C_OrderLine_ID)?.C_Order_ID ?? olIoLineToPo.get(l.M_InOutLine_ID);
    if (poId && invMap.has(l.C_Invoice_ID) && poMap.has(poId)) addTo(invByPo, poId, l.C_Invoice_ID);
  });
  // --- Invoice -> Payment ---
  const invToPays = new Map();
  data.payLinks.forEach((l) => payMap.has(l.C_Payment_ID) && invMap.has(l.C_Invoice_ID) && addTo(invToPays, l.C_Invoice_ID, l.C_Payment_ID));

  const rows = [];
  const mk = (o) => {
    const overdue = ["req", "po", "gr", "inv", "pay"].filter((s) => o.ages[s] != null && o.ages[s] > slaDays);
    overdue.forEach((s) => o.flags.push({ level: "warn", text: `${o.stageText?.[s] || STAGE_LABEL[s]} tertunda ${o.ages[s]} hari` }));
    const s = o.stages;
    const allDone = s.po === "done" && s.gr === "done" && s.inv === "done" && s.pay === "done" && ["done", "na"].includes(s.req) && !o.reqs.some((r) => r.covered < r.total);
    const overall = o.flags.some((f) => f.level === "error") ? "anomali" : overdue.length ? "terlambat" : allDone ? "selesai" : "berjalan";
    const all = [...o.reqs, o.po, ...o.grs, ...o.invoices, ...o.payments].filter(Boolean);
    rows.push({ ...o, overdue, overall, searchText: all.map((d) => d.no).join(" ").toLowerCase() });
  };

  poMap.forEach((po) => {
    const id = po.C_Order_ID;
    const lines = poLinesByPo.get(id) || [];
    const ordered = sum(lines, "QtyOrdered"), delivered = sum(lines, "QtyDelivered"), invoiced = sum(lines, "QtyInvoiced");
    const reqs = [...(poToReqs.get(id) || [])].map((r) => reqInfo(reqMap.get(r)));
    const ioRecs = [...(ioByPo.get(id) || [])].map((i) => ioMap.get(i));
    const invRecs = [...(invByPo.get(id) || [])].map((i) => invMap.get(i));
    const payRecs = [...new Set(invRecs.flatMap((i) => [...(invToPays.get(i.C_Invoice_ID) || [])]))].map((p) => payMap.get(p));
    const doneInv = invRecs.filter(isDone);
    const paidCnt = doneInv.filter((i) => isTrue(i.IsPaid)).length;
    const poDone = isDone(po);

    const stages = {
      req: reqs.length ? (reqs.every((r) => DONE.includes(r.status)) ? "done" : "draft") : "na",
      po: poDone ? "done" : "draft",
      gr: flow(poDone, ioRecs, ordered ? delivered / ordered : 0),
      inv: flow(poDone && (delivered > 0 || invRecs.length > 0), invRecs, ordered ? invoiced / ordered : 0),
      pay: flow(doneInv.length > 0, payRecs, doneInv.length ? paidCnt / doneInv.length : 0),
    };
    const poDate = toDate(po.DateOrdered);
    const lastGr = latest(ioRecs.map((r) => r.MovementDate)), lastInv = latest(invRecs.map((r) => r.DateInvoiced)), lastPay = latest(payRecs.map((r) => r.DateTrx));
    const ages = {
      req: age(stages.req, latest(reqs.map((r) => r.date)), today),
      po: age(stages.po, poDate, today),
      gr: age(stages.gr, lastGr || poDate, today),
      inv: age(stages.inv, lastInv || lastGr || poDate, today),
      pay: age(stages.pay, lastPay || lastInv, today),
    };

    const flags = [];
    reqs.filter((r) => r.covered < r.total).forEach((r) =>
      flags.push({ level: "warn", text: `Req ${r.no}: ${r.total - r.covered} dari ${r.total} line belum menjadi PO` }));
    if (!reqs.length) flags.push({ level: "info", text: "PO tanpa requisition" });
    if (doneInv.length && delivered <= 0) flags.push({ level: "error", text: "Invoice sudah ada, barang belum diterima" });
    //if (delivered > ordered + 1e-4) flags.push({ level: "error", text: "Qty diterima melebihi qty PO" });
    //if (invoiced > ordered + 1e-4) flags.push({ level: "error", text: "Qty invoice melebihi qty PO" });
    if (delivered > ordered + 1e-4) flags.push({ level: "error", text: `Qty diterima (${fmtQ(delivered)}) melebihi qty PO (${fmtQ(ordered)})` });
    if (invoiced > ordered + 1e-4)  flags.push({ level: "error", text: `Qty invoice (${fmtQ(invoiced)}) melebihi qty PO (${fmtQ(ordered)})` });
    // Bandingkan tiap line PO dengan line Requisition asalnya (satuan dasar).
    // Qty PO / diterima / ditagih tidak boleh melebihi qty Requisition.
    lines.forEach((l) => {
      const rl = reqLineById.get(olToRl.get(l.C_OrderLine_ID));
      const rq = rl && reqMap.get(rl.M_Requisition_ID);
      if (!rl || !rq) return;
      const reqQty = num(rl.Qty);
      const over = [];
      if (num(l.QtyOrdered)   > reqQty + 1e-4) over.push(`qty PO ${fmtQ(l.QtyOrdered)}`);
      if (num(l.QtyDelivered) > reqQty + 1e-4) over.push(`qty diterima ${fmtQ(l.QtyDelivered)}`);
      if (num(l.QtyInvoiced)  > reqQty + 1e-4) over.push(`qty invoice ${fmtQ(l.QtyInvoiced)}`);
      if (over.length) {
        flags.push({
          level: "error",
          text: `Requisition ${rq.DocumentNo} · ${productName.get(rl.M_Product_ID) || `Produk #${rl.M_Product_ID}`}: ` +
            `${over.join(", ")} melebihi qty Requisition ${fmtQ(reqQty)}`,
        });
      }
    });
    mk({
      key: `PO${id}`, dateRef: po.DateOrdered, vendor: po.C_BPartner_ID_Name || "",
      reqs, po: toDoc("PO", po), grs: ioRecs.map((r) => toDoc("GR", r)),
      invoices: invRecs.map((r) => toDoc("INV", r)), payments: payRecs.map((r) => toDoc("PAY", r)),
      stages, ages, flags,
      notes: { gr: ordered ? `Diterima ${fmtQ(delivered)} / ${fmtQ(ordered)}` : "", inv: ordered ? `Ditagih ${fmtQ(invoiced)} / ${fmtQ(ordered)}` : "", pay: doneInv.length ? `${paidCnt} / ${doneInv.length} invoice lunas` : "" },
      poTotal: num(po.GrandTotal), invTotal: sum(doneInv, "GrandTotal"),
    });
  });

  // Requisition yang belum punya PO sama sekali
  reqMap.forEach((rq, id) => {
    if (reqToPos.has(id)) return;
    const info = reqInfo(rq), done = DONE.includes(rq.DocStatus), d = toDate(rq.DateDoc);
    const stages = { req: done ? "done" : "draft", po: done ? "pending" : "wait", gr: "wait", inv: "wait", pay: "wait" };
    mk({
      key: `R${id}`, dateRef: rq.DateDoc, vendor: "", reqs: [info], po: null, grs: [], invoices: [], payments: [],
      stages, ages: { req: age(stages.req, d, today), po: age(stages.po, d, today) }, flags: [], notes: {},
      stageText: { po: "Pembuatan PO" }, poTotal: 0, invTotal: 0,
    });
  });

  return rows.sort((a, b) => String(b.dateRef).localeCompare(String(a.dateRef)));
}

export function summarize(rows) {
  const s = { semua: rows.length, selesai: 0, berjalan: 0, terlambat: 0, anomali: 0 };
  rows.forEach((r) => { s[r.overall] += 1; });
  return s;
}