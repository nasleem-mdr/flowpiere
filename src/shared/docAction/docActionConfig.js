// Konfigurasi aksi dokumen (Close / Void / Reverse) per tabel. Tambah dokumen baru cukup menambah entri di sini
// + resolver "tahap berikutnya" di docActionService.js.
export const RESOLVED_STATUSES = ["VO", "RE", "CL"]; // dokumen tahap berikutnya dianggap "sudah beres" bila statusnya salah satu ini

export const STATUS_LABEL = {
  DR: "Draft", IP: "In Progress", CO: "Completed", CL: "Closed", VO: "Voided", RE: "Reversed", NA: "Ditolak",
};

// statuses = status dokumen yang boleh menjalankan aksi; expect = status hasil yang diharapkan setelah aksi.
// checkDownstream:false -> lewati pemeriksaan tahap berikutnya untuk aksi tsb.
const CLOSE = { code: "CL", label: "Close", statuses: ["CO"], expect: ["CL"], tone: "neutral" };
const VOID = { code: "VO", label: "Void", statuses: ["DR", "IP", "NA"], expect: ["VO"], tone: "danger" };
const REVERSE = { code: "RC", label: "Reverse (Correct)", statuses: ["CO"], expect: ["RE"], tone: "danger" };

export const DOC_ACTION_CONFIG = {
  M_Requisition: { label: "Requisition", path: "m_requisition", actions: [CLOSE] },
  C_Order: { label: "Purchase Order", path: "c_order", actions: [CLOSE, { ...VOID, statuses: ["DR", "IP", "NA", "CO"] }] },
  M_InOut: { label: "Penerimaan Barang", path: "m_inout", actions: [CLOSE, REVERSE, VOID] },
  C_Invoice: { label: "Invoice Vendor", path: "c_invoice", actions: [CLOSE, REVERSE, VOID] },
  C_Payment: { label: "Pembayaran", path: "c_payment", actions: [REVERSE, VOID] },
};

export const getAvailableActions = (tableName, status) =>
  (DOC_ACTION_CONFIG[tableName]?.actions || []).filter((a) => a.statuses.includes(status));
