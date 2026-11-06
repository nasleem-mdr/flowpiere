// Metadata dokumen untuk modal detail. kind: text | date | qty | money
export const DOC_META = {
  REQ: {
    label: "Requisition", table: "m_requisition", pk: "M_Requisition_ID", lineTable: "m_requisitionline", linePk: "M_RequisitionLine_ID",
    header: [["DocumentNo", "No. Dokumen"], ["DateDoc", "Tanggal", "date"], ["DateRequired", "Tgl. Dibutuhkan", "date"], ["DocStatus_Name", "Status"], ["AD_User_ID_Name", "Pemohon"], ["M_Warehouse_ID_Name", "Gudang"], ["TotalLines", "Total", "money"], ["Description", "Keterangan"]],
    lines: [["Line", "No"], ["M_Product_ID_Name", "Produk"], ["Description", "Keterangan"], ["Qty", "Qty", "qty"], ["PriceActual", "Harga", "money"], ["LineNetAmt", "Jumlah", "money"], ["C_OrderLine_ID_Name", "Ditindaklanjuti ke PO"]],
  },
  PO: {
    label: "Purchase Order", table: "c_order", pk: "C_Order_ID", lineTable: "c_orderline", linePk: "C_OrderLine_ID",
    header: [["DocumentNo", "No. Dokumen"], ["DateOrdered", "Tanggal", "date"], ["DatePromised", "Tgl. Janji", "date"], ["DocStatus_Name", "Status"], ["C_BPartner_ID_Name", "Vendor"], ["POReference", "Ref. Vendor"], ["GrandTotal", "Total", "money"], ["Description", "Keterangan"]],
    lines: [["Line", "No"], ["M_Product_ID_Name", "Produk"], ["QtyOrdered", "Qty PO", "qty"], ["QtyDelivered", "Diterima", "qty"], ["QtyInvoiced", "Ditagih", "qty"], ["PriceActual", "Harga", "money"], ["LineNetAmt", "Jumlah", "money"]],
  },
  GR: {
    label: "Penerimaan Barang", table: "m_inout", pk: "M_InOut_ID", lineTable: "m_inoutline", linePk: "M_InOutLine_ID",
    header: [["DocumentNo", "No. Dokumen"], ["MovementDate", "Tgl. Terima", "date"], ["DocStatus_Name", "Status"], ["C_BPartner_ID_Name", "Vendor"], ["C_Order_ID_Name", "PO"], ["M_Warehouse_ID_Name", "Gudang"], ["Description", "Keterangan"]],
    lines: [["Line", "No"], ["M_Product_ID_Name", "Produk"], ["MovementQty", "Qty", "qty"], ["C_OrderLine_ID_Name", "Baris PO"]],
  },
  INV: {
    label: "Invoice Vendor", table: "c_invoice", pk: "C_Invoice_ID", lineTable: "c_invoiceline", linePk: "C_InvoiceLine_ID",
    header: [["DocumentNo", "No. Dokumen"], ["DateInvoiced", "Tanggal", "date"], ["DocStatus_Name", "Status"], ["C_BPartner_ID_Name", "Vendor"], ["POReference", "Ref. Vendor"], ["C_Order_ID_Name", "PO"], ["GrandTotal", "Total", "money"], ["IsPaid", "Lunas"]],
    lines: [["Line", "No"], ["M_Product_ID_Name", "Produk"], ["QtyInvoiced", "Qty", "qty"], ["PriceActual", "Harga", "money"], ["LineNetAmt", "Jumlah", "money"], ["C_OrderLine_ID_Name", "Baris PO"], ["M_InOutLine_ID_Name", "Baris Penerimaan"]],
  },
  PAY: {
    label: "Pembayaran", table: "c_payment", pk: "C_Payment_ID", lineTable: "c_paymentallocate", linePk: "C_PaymentAllocate_ID",
    header: [["DocumentNo", "No. Dokumen"], ["DateTrx", "Tanggal", "date"], ["DocStatus_Name", "Status"], ["C_BPartner_ID_Name", "Vendor"], ["C_BankAccount_ID_Name", "Rekening"], ["PayAmt", "Jumlah", "money"], ["C_Invoice_ID_Name", "Invoice"]],
    lines: [["C_Invoice_ID_Name", "Invoice"], ["Amount", "Dibayar", "money"], ["DiscountAmt", "Diskon", "money"], ["WriteOffAmt", "Write-off", "money"]],
  },
};

// Opsional: isi dengan route halaman detail di aplikasi Anda agar muncul tombol "Buka halaman dokumen".
// Contoh: REQ: (id) => `/requisition/${id}`
export const DOC_ROUTES = { REQ: null, PO: null, GR: null, INV: null, PAY: null };

export function formatValue(v, kind) {
  if (v === null || v === undefined || v === "") return "—";
  if (kind === "date") return String(v).slice(0, 10).split("-").reverse().join("/");
  if (kind === "qty") return Number(v).toLocaleString("id-ID", { maximumFractionDigits: 2 });
  if (kind === "money") return Number(v).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v === true || v === "Y") return "Ya";
  if (v === false || v === "N") return "Tidak";
  return String(v);
}