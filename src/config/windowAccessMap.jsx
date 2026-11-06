/** ─────────────────────────────────────────────────────────────────────────────
* windowAccessMap.js
* Pemetaan "kunci halaman" (dipakai di route & komponen React) ke AD_Window_ID
* iDempiere. Ini satu-satunya tempat yang perlu diisi manual — cek nilai
* AD_Window_ID lewat menu System Admin > Window, atau query:
* GET /api/v1/models/ad_window?$select=AD_Window_ID,Name&$filter=contains(Name,'Requisition')
* 
* Kalau sebuah halaman TIDAK terdaftar di sini, defaultnya dianggap
* "tidak butuh AD_Window_Access" (lihat hasAccess() di AccessContext) —
* jadi pastikan semua halaman yang ingin dibatasi role didaftarkan.
* ─────────────────────────────────────────────────────────────────────────────
*/

import { Receipt } from "lucide-react";

export const WINDOW_ACCESS_MAP = {
  dashboard:            null,
  businessPartner:      123,
  businessPartnerEdit:  123,
  posOrder:             143,
  salesOrder:           143,
  product:              140,
  requisition:          322,
  goodsReceipt:         184,
  purchasing:           181,
  internalUse:          168,
  booking:              null,
  vendorInvoice:        183,
  bankStatement:        194,
  salesInvoice:         167,
  paymentReceipt:       195,
  paymentVendor:        195,
  receiptCustomer:      195,
  productDetail:        140,
  productImport:        140,
  userManagement:       108,
  roleManagement:       111,
  bankTransfer:         null,
  shipmentCustomer:     null,
  // ===== List / Report =====
  salesOrderDetailReport:  143,
  requisitionList:         null, 
  posOrderList:            null,
  purchasingList:          null,
  goodsReceiptList:        null,
  internalUseList:         null,
  vendorInvoiceList:       null,
  salesInvoiceList:        null,
  financialReport:         null,
  outstandingInvoice:      null,
  dashboardMenu:           null,
  shipmentCustomerReport:  null,
  inventoryReport:        null,
  purchaseOrderDetail:     null,
  financialComparasion:    null,
  generalLedger:           null,
  workfowApproval:         null,
  procurementTrace:        null,
  productAnalysis:         null,
  trendReport:             null,
  statementList:           null,
  shipmentList:           null,
  salesImport:             167,
  cashierClosing:          194,
};

// Helper: ambil AD_Window_ID dari key, atau null kalau tidak terdaftar/tidak dibatasi.
export const getWindowId = (key) => {
  const id = WINDOW_ACCESS_MAP[key];
  return (id === null || id === undefined) ? null : id;
};
