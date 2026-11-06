/** ─────────────────────────────────────────────────────────────────────────────
* useInvoiceSubmit.jsx
* Bikin Vendor Invoice (C_Invoice/C_InvoiceLine, IsSOTrx=false) dari cart yang
* isinya baris-baris PO Complete yang mau ditagih (hasil import via
* POToInvoiceImportModal). Pola SAMA PERSIS dgn usePurchaseOrderSubmit.jsx:
* cart di-groupBy C_BPartner_ID → 1 Invoice per vendor per submit,
* submitMode 'draft'|'complete' (default 'complete').
*
* Item cart WAJIB bawa:
*   C_OrderLine_ID — link 3-way match ke PO asal (wajib)
*   C_Order_ID     — dipakai sbg C_Order_ID (referensi) di header invoice
*   M_InOutLine_ID — opsional, kalau baris ini sudah ketemu matching Receipt
*                    line (3-way match penuh)
*   M_Product_ID, C_UOM_ID, Qty (= QtyInvoiced sekarang), Price
*   C_BPartner_ID, C_BPartner_Location_ID, VendorName
*
* PO sumber TIDAK disentuh sama sekali di sini — cuma dibaca lewat modal
* import (lihat usePOInvoiceLines.jsx, dihitung sisa qty blm diinvoice).
* ─────────────────────────────────────────────────────────────────────────────
*/
import { useState, useCallback } from 'react';
import { idempiereApi } from '@/api/idempiereApi';
import { getLoginInfo } from '@/shared/hooks/useLoginInfo';
import { todayLocalISO, isDateOnly } from '@/utils/dateOnly';

export function useInvoiceSubmit({ invoiceDocTypeId, defaultDescription, onError }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const finalizeInvoice = useCallback(async (invoiceId, submitMode, vendorName) => {
    if (submitMode === 'complete') {
      const completedRes = await idempiereApi(`/models/c_invoice/${invoiceId}`, {
        method: 'PUT',
        body: JSON.stringify({ 'doc-action': 'CO' }),
      });
      const finalStatus = completedRes.DocStatus?.id ?? completedRes.DocStatus;
      if (finalStatus !== 'CO' && finalStatus !== 'CL') {
        throw new Error(
          `Invoice untuk vendor "${vendorName}" (${completedRes.DocumentNo || `#${invoiceId}`}) gagal Complete ` +
          `(status: ${finalStatus || 'tidak diketahui'}).`
        );
      }
      return { docNo: completedRes.DocumentNo || `INV-${invoiceId}`, status: 'Completed', grandTotal: parseFloat(completedRes.GrandTotal ?? 0) };
    }
    const draftRes = await idempiereApi(`/models/c_invoice/${invoiceId}?$select=DocumentNo,DocStatus,GrandTotal`);
    return { docNo: draftRes.DocumentNo || `INV-${invoiceId}`, status: 'Draft', grandTotal: parseFloat(draftRes.GrandTotal ?? 0) };
  }, []);

  const submit = useCallback(async (cart, { description, poReference, submitMode = 'complete', dateInvoiced = null } = {}) => {
    if (cart.length === 0) {
      onError?.('Daftar tagihan masih kosong!');
      return { results: null, hadError: true };
    }
    const finalDescription = (description && description.trim()) || defaultDescription;
    const finalPoReference = (poReference || '').trim();
    
    const missingOrderLine = cart.filter(i => !i.C_OrderLine_ID);
    if (missingOrderLine.length > 0) {
      onError?.('Ada item tanpa referensi PO (C_OrderLine_ID). Import ulang dari PO Complete.', 'Data Tidak Lengkap');
      return { results: null, hadError: true };
    }

    const { orgId, clientId, userId } = getLoginInfo();
    if (!orgId || !clientId) {
      onError?.('Data sesi tidak lengkap.\nSilakan login kembali.', 'Error');
      return { results: null, hadError: true };
    }
    if (!invoiceDocTypeId) {
      onError?.('Document Type Invoice belum ter-resolve.', 'Konfigurasi Tidak Lengkap');
      return { results: null, hadError: true };
    }

    // Tanggal invoice pilihan user (default: hari ini, zona waktu lokal). DateAcct ikut diisi
    // eksplisit — REST tidak menjalankan callout, jadi tanpa ini DateAcct tetap HARI INI.
    const invoiceDateISO = dateInvoiced || todayLocalISO();
    if (!isDateOnly(invoiceDateISO)) {
      onError?.(`Tanggal invoice tidak valid: "${invoiceDateISO}".`, 'Data Tidak Lengkap');
      return { results: null, hadError: true };
    }

    setIsSubmitting(true);
    const results = [];

    try {
      const groups = new Map();
      cart.forEach(item => {
        const key = item.C_BPartner_ID;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      });

      for (const [vendorId, items] of groups.entries()) {
        const vendorName = items[0].VendorName;
        const vendorLocationId = items[0].C_BPartner_Location_ID;
        if (!vendorLocationId) {
          throw new Error(`Vendor "${vendorName}" tidak punya alamat tersimpan di baris PO — cek data PO asal.`);
        }
        // C_Order_ID di header cuma bisa nunjuk ke 1 PO (referensi utama) —
        // dari item pertama grup ini. Kalau grup gabungan >1 PO utk vendor
        // yg sama, link akurat per baris tetap terjaga via C_OrderLine_ID.
        const primaryOrderId = items[0].C_Order_ID;

        const headerRes = await idempiereApi('/models/c_invoice', {
          method: 'POST',
          body: JSON.stringify({
            AD_Client_ID:           { id: clientId },
            AD_Org_ID:              { id: orgId },
            C_DocType_ID:           { id: invoiceDocTypeId },
            C_DocTypeTarget_ID:     { id: invoiceDocTypeId },
            C_BPartner_ID:          { id: parseInt(vendorId) },
            C_BPartner_Location_ID: { id: parseInt(vendorLocationId) },
            ...(primaryOrderId ? { C_Order_ID: { id: parseInt(primaryOrderId) } } : {}),
            DateInvoiced:           invoiceDateISO,
            DateAcct:               invoiceDateISO,
            IsSOTrx:                false,
            Description:            finalDescription,
            ...(finalPoReference ? { POReference: finalPoReference } : {}),
            ...(userId ? { SalesRep_ID: { id: parseInt(userId) } } : {}),
          }),
        });
        const invoiceId = headerRes.id ?? headerRes.C_Invoice_ID;
        if (!invoiceId) throw new Error(`Gagal membuat header Invoice untuk vendor "${vendorName}".`);
        if (!finalPoReference) {
          onError?.('No. Invoice Vendor wajib diisi.', 'Data Tidak Lengkap');
          return { results: null, hadError: true };
        }
        const vendorIds = new Set(cart.map(i => i.C_BPartner_ID));
          if (vendorIds.size > 1) {
            onError?.(
              'Invoice hanya bisa dibuat untuk 1 vendor per transaksi.\nHapus item vendor lain atau proses terpisah.',
              'Vendor Tidak Sama'
            );
            return { results: null, hadError: true };
          }
        for (const item of items) {
          const qtyEntered   = parseFloat(item.QtyEntered || 0);
          const qtyInvoiced  = parseFloat(item.QtyOrdered || 0);
          const priceEntered = parseFloat(item.Price || 0);

          await idempiereApi('/models/c_invoiceline', {
            method: 'POST',
            body: JSON.stringify({
              AD_Org_ID:      { id: orgId },
              C_Invoice_ID:   { id: invoiceId },
              M_Product_ID:   { id: parseInt(item.M_Product_ID) },
              C_UOM_ID:       { id: parseInt(item.C_UOM_ID) },
              QtyEntered:     qtyEntered,
              QtyInvoiced:    qtyInvoiced,
              PriceEntered:   priceEntered,
              PriceActual:    priceEntered,
              C_OrderLine_ID: { id: parseInt(item.C_OrderLine_ID) },
              ...(item.M_InOutLine_ID ? { M_InOutLine_ID: { id: parseInt(item.M_InOutLine_ID) } } : {}),
            }),
          });
        }

        const { docNo, status, grandTotal } = await finalizeInvoice(invoiceId, submitMode, vendorName);

        results.push({
          invoiceId, documentNo: docNo, status, grandTotal,
          vendorId, vendorName, vendorLocationId,
          date: new Date().toLocaleString('id-ID'),
          items,
        });
      }

      return { results, hadError: false };
    } catch (err) {
      onError?.(
        `Gagal memproses Invoice:\n\n${err.message}` +
        (results.length > 0
          ? `\n\n${results.length} Invoice SUDAH berhasil dibuat sebelum error ini:\n` +
            results.map(r => `• ${r.documentNo} (${r.vendorName})`).join('\n')
          : ''),
        'Error'
      );
      return { results: results.length > 0 ? results : null, hadError: true };
    } finally {
      setIsSubmitting(false);
    }
  }, [invoiceDocTypeId, defaultDescription, onError, finalizeInvoice]);

  return { submit, isSubmitting };
}