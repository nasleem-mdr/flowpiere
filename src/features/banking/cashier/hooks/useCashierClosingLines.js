import { useState, useCallback } from 'react';
import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';

/**
 * Ambil SEMUA AR Receipt (IsReceipt = true) yang Completed, belum reconciled,
 * dan belum dipakai di C_BankStatementLine mana pun — lintas semua bank/kas.
 * Mengembalikan item berbentuk cart-item (type: 'payment') + C_BankAccount_ID,
 * jadi bisa langsung dimasukkan ke useBankStatementCart.addItems().
 */
export function useCashierClosingLines() {
  const [loading, setLoading] = useState(false);

  const fetchLines = useCallback(async ({ createdById = null } = {}) => {
    setLoading(true);
    try {
      let filter = `DocStatus eq 'CO' and IsReconciled eq false and IsReceipt eq true`;
      if (createdById) filter += ` and CreatedBy eq ${createdById}`;

      const res = await idempiereApi(
        `/models/c_payment?$filter=${filter}` +
        `&$select=C_Payment_ID,DocumentNo,DateTrx,PayAmt,C_BankAccount_ID,C_BPartner_ID,C_Currency_ID,Description,CreatedBy` +
        `&$orderby=C_BankAccount_ID,DocumentNo&$top=500`
      );
      const payments = Array.isArray(res.records) ? res.records : [];
      if (payments.length === 0) return [];

      const paymentIds = payments.map(p => p.id ?? p.C_Payment_ID);
      const idFilter = paymentIds.map(id => `C_Payment_ID eq ${id}`).join(' or ');

      // Cross-check: payment yang sudah masuk statement line (Draft sekalipun) dibuang
      const usedPaymentIds = new Set();
      try {
        const usedRes = await idempiereApi(
          `/models/c_bankstatementline?$filter=${idFilter}&$select=C_Payment_ID&$top=1000`
        );
        (Array.isArray(usedRes.records) ? usedRes.records : []).forEach(r => {
          const pid = fkId(r.C_Payment_ID) ?? r.C_Payment_ID?.id;
          if (pid != null) usedPaymentIds.add(String(pid));
        });
      } catch (err) {
        console.warn('[useCashierClosingLines] gagal cross-check C_BankStatementLine:', err.message);
      }

      // Invoice terkait (opsional, dari alokasi)
      const invoiceByPayment = new Map();
      try {
        const allocRes = await idempiereApi(
          `/models/c_allocationline?$filter=${idFilter}&$select=C_Payment_ID,C_Invoice_ID&$top=1000`
        );
        (Array.isArray(allocRes.records) ? allocRes.records : []).forEach(a => {
          const pid = fkId(a.C_Payment_ID) ?? a.C_Payment_ID?.id;
          const invId = fkId(a.C_Invoice_ID) ?? a.C_Invoice_ID?.id;
          if (pid != null && invId != null) invoiceByPayment.set(String(pid), { id: invId, label: fkLabel(a.C_Invoice_ID) });
        });
      } catch (err) {
        console.warn('[useCashierClosingLines] gagal fetch C_AllocationLine:', err.message);
      }

      return payments
        .filter(p => !usedPaymentIds.has(String(p.id ?? p.C_Payment_ID)))
        .map(p => {
          const pid = p.id ?? p.C_Payment_ID;
          const invoice = invoiceByPayment.get(String(pid));
          const amt = parseFloat(p.PayAmt ?? 0);
          return {
            type: 'payment',
            C_Payment_ID: pid,
            C_BankAccount_ID: String(fkId(p.C_BankAccount_ID) ?? p.C_BankAccount_ID?.id ?? ''),
            DocumentNo: p.DocumentNo,
            DateTrx: p.DateTrx,
            StmtAmt: amt,
            TrxAmt: amt,
            C_BPartner_ID: fkId(p.C_BPartner_ID) ?? p.C_BPartner_ID?.id ?? null,
            BPName: fkLabel(p.C_BPartner_ID) || '',
            C_Currency_ID: fkId(p.C_Currency_ID) ?? p.C_Currency_ID?.id ?? null,
            C_Invoice_ID: invoice?.id ?? null,
            InvoiceLabel: invoice?.label ?? '',
            Description: p.Description || '',
          };
        })
        .filter(i => i.C_BankAccount_ID);
    } catch (err) {
      console.error('[useCashierClosingLines] gagal fetch:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, fetchLines };
}
