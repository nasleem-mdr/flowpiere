import { idempiereApi } from '@/api/idempiereApi';

// ─────────────────────────────────────────────────────────────────────────────
// fetchReceiptData.js
// Rekonstruksi ulang receiptData untuk ReceiptModal dari order yang SUDAH
// completed — dipakai untuk fitur "Print Ulang Nota" dari POSOrderList.
//
// Kembalian TIDAK disimpan di server (memang tidak perlu) — ReceiptModal
// sudah menghitungnya sendiri dari selisih total tender (payments) vs total
// tagihan. Yang penting: PayAmt yang direkonstruksi harus nilai TENDER ASLI
// (mis. kasir terima Rp 100.000 untuk tagihan Rp 80.000), BUKAN nilai yang
// sudah di-clip ke GrandTotal seperti C_Payment di jalur fallback manual
// (lihat usePOSPaymentSubmit.handleSubmitPayment → Math.min). Karena itu
// sumbernya HARUS C_POSPayment (baris tender mentah), bukan C_Payment.
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchReceiptData(orderId) {
  const header = await idempiereApi(
    `/models/c_order/${orderId}` +
    `?$select=DocumentNo,DateOrdered,GrandTotal,C_BPartner_ID,C_POS_ID,CreatedBy,DocStatus`
  );

  if (header?.DocStatus?.id !== 'CO' && header?.DocStatus !== 'CO') {
    throw new Error('Nota hanya bisa dicetak ulang untuk order dengan status Completed.');
  }

  const linesRes = await idempiereApi(
    `/models/c_orderline?$filter=C_Order_ID eq ${orderId}` +
    `&$select=Line,M_Product_ID,QtyEntered,PriceEntered,C_UOM_ID&$orderby=Line`
  );
  const lines = Array.isArray(linesRes.records) ? linesRes.records : [];

  const paymentsRes = await idempiereApi(
    `/models/c_pospayment?$filter=C_Order_ID eq ${orderId}&$select=TenderType,PayAmt`
  );
  const paymentRecords = Array.isArray(paymentsRes.records) ? paymentsRes.records : [];

  if (paymentRecords.length === 0) {
    // Kemungkinan order lama sebelum C_POSPayment mulai dicatat, atau
    // transaksi non-POS. Tidak fatal — nota tetap ditampilkan tanpa baris
    // pembayaran, tapi beri sinyal ke pemanggil untuk konteks.
    console.warn(`[fetchReceiptData] Tidak ada C_POSPayment untuk order ${orderId} — nota dicetak tanpa rincian pembayaran.`);
  }

  const items = lines.map((l) => ({
    Name:         l.M_Product_ID?.identifier || l.M_Product_ID?.Name || '-',
    Qty:          parseFloat(l.QtyEntered || 0),
    PriceEntered: parseFloat(l.PriceEntered || 0),
    selectedUOM:  { name: l.C_UOM_ID?.identifier || l.C_UOM_ID?.Name || 'EA' },
  }));

  const payments = paymentRecords.map((p) => ({
    TenderType: typeof p.TenderType === 'object' ? (p.TenderType.id ?? p.TenderType.identifier) : p.TenderType,
    PayAmt:     parseFloat(p.PayAmt || 0),
  }));

  return {
    documentNo:   header.DocumentNo,
    date:         header.DateOrdered ? new Date(header.DateOrdered).toLocaleString('id-ID') : '-',
    posName:      header.C_POS_ID?.identifier || 'POS Terminal',
    cashierName:  header.CreatedBy?.identifier || '-',
    bPartnerName: header.C_BPartner_ID?.identifier || '-',
    items,
    total:        parseFloat(header.GrandTotal || 0),
    payments,
  };
}