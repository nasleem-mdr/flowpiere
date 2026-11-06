/** ─────────────────────────────────────────────────────────────────────────────
* usePaymentAllocationSubmit.jsx
* Diekstrak dari useCashPurchaseSubmit.jsx (TAHAP 4 versi sudah-diperbaiki) —
* dipakai ulang oleh modul manapun yang perlu "bayar invoice langsung"
* (Cash Purchase, Purchase Invoice "Bayar", dst) tanpa duplikasi kode.
*
* ALUR (hasil verifikasi Application Dictionary + Windows client):
*   1. C_Payment dibuat DRAFT.
*   2. C_PaymentAllocate diisi SAAT Payment MASIH DRAFT (C_AllocationLine_ID
*      dibiarkan kosong — mandatory=false di AD).
*   3. C_Payment di-Complete ('CO') → iDempiere OTOMATIS generate
*      C_AllocationHdr + C_AllocationLine dari baris C_PaymentAllocate ini,
*      lalu backfill C_AllocationLine_ID ke baris itu.
* TIDAK PERLU insert C_AllocationHdr/C_AllocationLine manual.
*
* `invoices` = array, supaya 1 Payment bisa melunasi >1 invoice sekaligus
* (1 baris C_PaymentAllocate per invoice). Untuk 1 invoice, kirim array isi 1.
* ─────────────────────────────────────────────────────────────────────────────
*/

import { 
  useState, 
  useCallback, 
} from 'react';

import { 
  idempiereApi, 
  fkId, 
} from '@/api/idempiereApi';

import { getLoginInfo } from '@/shared/hooks/useLoginInfo';
import { todayLocalISO, isDateOnly } from '@/utils/dateOnly';

export function usePaymentAllocationSubmit({ paymentDocTypeId, description, onError }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(async (invoices, {
    vendorId,
    bankAccountId,
    paymentTenderType = 'K',
    dateTrx = null, // 'YYYY-MM-DD' untuk DateTrx & DateAcct; null → hari ini (lokal)
  } = {}) => {
    if (!invoices || invoices.length === 0) {
      onError?.('Tidak ada invoice yang akan dibayar.');
      return null;
    }
    if (!paymentDocTypeId) {
      onError?.('Document Type Payment belum ter-resolve.', 'Konfigurasi Tidak Lengkap');
      return null;
    }
    if (!vendorId) {
      onError?.('Vendor belum ditentukan.', 'Data Belum Lengkap');
      return null;
    }

    const { orgId, clientId } = getLoginInfo();
    const totalAmount = invoices.reduce((s, i) => s + parseFloat(i.grandTotal || 0), 0);
    if (totalAmount <= 0) {
      onError?.('Total pembayaran harus lebih dari 0.');
      return null;
    }

    const trxDateISO = dateTrx || todayLocalISO();
    if (!isDateOnly(trxDateISO)) {
      onError?.(`Tanggal payment tidak valid: "${trxDateISO}".`, 'Data Belum Lengkap');
      return null;
    }

    setIsSubmitting(true);
    try {
      const paymentRes = await idempiereApi('/models/c_payment', {
        method: 'POST',
        body: JSON.stringify({
          AD_Client_ID: { id: clientId },
          AD_Org_ID:    { id: orgId },
          C_BPartner_ID: { id: parseInt(vendorId) },
          C_DocType_ID:       { id: paymentDocTypeId },
          C_DocTypeTarget_ID: { id: paymentDocTypeId },
          DateTrx:      trxDateISO,
          DateAcct:     trxDateISO,
          IsReceipt:    false, // false = uang KELUAR (kita bayar vendor)
          TenderType:   paymentTenderType,
          PayAmt:       totalAmount,
          Description:  description,
          ...(bankAccountId ? { C_BankAccount_ID: { id: parseInt(bankAccountId) } } : {}),
        }),
      });
      const paymentId = fkId(paymentRes.id) ?? paymentRes.id ?? paymentRes.C_Payment_ID;
      if (!paymentId) throw new Error('Gagal mendapatkan C_Payment_ID.');

      // ── Isi Payment Allocation SEBELUM Complete — 1 baris per invoice ──
      for (const inv of invoices) {
        await idempiereApi('/models/c_paymentallocate', {
          method: 'POST',
          body: JSON.stringify({
            AD_Org_ID:    { id: orgId },
            C_Payment_ID: { id: paymentId },
            C_Invoice_ID: { id: inv.invoiceId },
            Amount:       parseFloat(inv.grandTotal),
          }),
        });
      }

      const completedPayment = await idempiereApi(`/models/c_payment/${paymentId}`, {
        method: 'PUT',
        body: JSON.stringify({ 'doc-action': 'CO' }),
      });
      const finalStatus = completedPayment.DocStatus?.id ?? completedPayment.DocStatus;
      if (finalStatus !== 'CO' && finalStatus !== 'CL') {
        throw new Error(
          `Payment gagal Complete (status: ${finalStatus || 'tidak diketahui'}). ` +
          `Kemungkinan total baris Payment Allocation belum sama dengan PayAmt di header — cek langsung di iDempiere.`
        );
      }

      return {
        paymentId,
        documentNo: completedPayment.DocumentNo || `PAY-${paymentId}`,
        payAmt: totalAmount,
      };
    } catch (err) {
      onError?.(`Gagal memproses Payment/Allocation:\n\n${err.message}`, 'Error');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [paymentDocTypeId, description, onError]);

  return { submit, isSubmitting };
}