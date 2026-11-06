import { useState, useCallback } from 'react';
import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';

export function useUnreconciledPaymentLines() {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLines = useCallback(async ({
    bankAccountId,
    docTypeFilter = null,     // 'AR' | 'AP' | null
    createdByIds = null,      // array AD_User_ID — null/[] = tidak difilter (semua)
    dateFrom = null,
    dateTo = null,
  }) => {
    if (!bankAccountId) { setLines([]); return; }
    setLoading(true);
    try {
      let filter = `C_BankAccount_ID eq ${bankAccountId} and DocStatus eq 'CO' and IsReconciled eq false`;
      if (docTypeFilter === 'AR') filter += ' and IsReceipt eq true';
      if (docTypeFilter === 'AP') filter += ' and IsReceipt eq false';
      if (dateFrom) filter += ` and DateTrx ge '${dateFrom}'`;
      if (dateTo)   filter += ` and DateTrx le '${dateTo}'`;
      if (Array.isArray(createdByIds) && createdByIds.length > 0) {
        filter += ` and (${createdByIds.map(id => `CreatedBy eq ${id}`).join(' or ')})`;
      }

      const res = await idempiereApi(
        `/models/c_payment?$filter=${filter}` +
        `&$select=C_Payment_ID,DocumentNo,DateTrx,PayAmt,IsReceipt,C_BPartner_ID,C_Currency_ID,Description,CreatedBy` +
        `&$orderby=DateTrx desc&$top=200`
      );
      const payments = Array.isArray(res.records) ? res.records : [];
      if (payments.length === 0) { setLines([]); return; }

      const paymentIds = payments.map(p => p.id ?? p.C_Payment_ID);
      const filterStr = paymentIds.map(id => `C_Payment_ID eq ${id}`).join(' or ');
      let usedPaymentIds = new Set();
      try {
        const usedRes = await idempiereApi(
          `/models/c_bankstatementline?$filter=${filterStr}&$select=C_Payment_ID&$top=500`
        );
        const usedRecords = Array.isArray(usedRes.records) ? usedRes.records : [];
        usedRecords.forEach(r => {
          const pid = fkId(r.C_Payment_ID) ?? r.C_Payment_ID?.id;
          if (pid != null) usedPaymentIds.add(String(pid));
        });
      } catch (err) {
        console.warn('[useUnreconciledPaymentLines] gagal cross-check C_BankStatementLine:', err.message);
      }

      let invoiceByPayment = new Map();
      try {
        const allocRes = await idempiereApi(
          `/models/c_allocationline?$filter=${paymentIds.map(id => `C_Payment_ID eq ${id}`).join(' or ')}` +
          `&$select=C_Payment_ID,C_Invoice_ID&$top=500`
        );
        const allocRecords = Array.isArray(allocRes.records) ? allocRes.records : [];
        allocRecords.forEach(a => {
          const pid = fkId(a.C_Payment_ID) ?? a.C_Payment_ID?.id;
          const invId = fkId(a.C_Invoice_ID) ?? a.C_Invoice_ID?.id;
          if (pid != null && invId != null) invoiceByPayment.set(String(pid), { id: invId, label: fkLabel(a.C_Invoice_ID) });
        });
      } catch (err) {
        console.warn('[useUnreconciledPaymentLines] gagal fetch C_AllocationLine:', err.message);
      }

      const mapped = payments
        .filter(p => !usedPaymentIds.has(String(p.id ?? p.C_Payment_ID)))
        .map(p => {
          const pid = p.id ?? p.C_Payment_ID;
          const invoice = invoiceByPayment.get(String(pid));
          return {
            C_Payment_ID: pid,
            DocumentNo:   p.DocumentNo,
            DateTrx:      p.DateTrx,
            PayAmt:       parseFloat(p.PayAmt ?? 0),
            IsReceipt:    !!p.IsReceipt,
            C_BPartner_ID: fkId(p.C_BPartner_ID) ?? p.C_BPartner_ID?.id ?? null,
            BPName:        fkLabel(p.C_BPartner_ID) || '',
            C_Currency_ID: fkId(p.C_Currency_ID) ?? p.C_Currency_ID?.id ?? null,
            C_Invoice_ID:  invoice?.id ?? null,
            InvoiceLabel:  invoice?.label ?? '',
            Description:   p.Description || '',
          };
        });

      setLines(mapped);
    } catch (err) {
      console.error('[useUnreconciledPaymentLines] gagal fetch:', err);
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { lines, loading, fetchLines };
}
