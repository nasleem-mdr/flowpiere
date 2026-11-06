/** ─────────────────────────────────────────────────────────────────────────────
* useBankStatementSubmit.js
* BeginningBalance = EndingBalance statement TERAKHIR yang sudah Complete utk
* bank account ini (0 kalau belum pernah ada statement sama sekali) — sesuai
* konfirmasi Anda. EndingBalance final dihitung NATIVE oleh iDempiere saat
* Complete (tidak kita kirim manual).
* ─────────────────────────────────────────────────────────────────────────────
*/

import { useState, useCallback } from 'react';
import { idempiereApi, fkId } from '@/api/idempiereApi';
import { getLoginInfo } from '@/shared/hooks';

export function useBankStatementSubmit({ onError }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchBeginningBalance = useCallback(async (bankAccountId) => {
    try {
      const res = await idempiereApi(
        `/models/c_bankstatement?$filter=C_BankAccount_ID eq ${bankAccountId} and DocStatus eq 'CO'` +
        `&$select=EndingBalance&$orderby=StatementDate desc,C_BankStatement_ID desc&$top=1`
      );
      const records = Array.isArray(res.records) ? res.records : [];
      return records[0] ? parseFloat(records[0].EndingBalance ?? 0) : 0;
    } catch (err) {
      console.warn('[useBankStatementSubmit] gagal fetch statement terakhir, BeginningBalance default 0:', err.message);
      return 0;
    }
  }, []);

  const submit = useCallback(async (cart, { bankAccountId, beginningBalance, statementDate, submitMode = 'complete' } = {}) => {
    if (cart.length === 0) {
      onError?.('Belum ada baris statement.');
      return { result: null, hadError: true };
    }
    if (!bankAccountId) {
      onError?.('Bank Account belum dipilih.', 'Data Belum Lengkap');
      return { result: null, hadError: true };
    }
    if (!statementDate) {
      onError?.('Statement Date belum diisi.', 'Data Belum Lengkap');
      return { result: null, hadError: true };
    }

    const { orgId, clientId } = getLoginInfo();
    setIsSubmitting(true);

    try {
      const stmtDate = statementDate; // format YYYY-MM-DD

      const hdrRes = await idempiereApi('/models/c_bankstatement', {
        method: 'POST',
        body: JSON.stringify({
          AD_Client_ID: { id: clientId },
          AD_Org_ID:    { id: orgId },
          C_BankAccount_ID: { id: parseInt(bankAccountId) },
          Name:             stmtDate,
          StatementDate:    stmtDate,
          DateAcct:         stmtDate,
          BeginningBalance: parseFloat(beginningBalance || 0),
        }),
      });
      const statementId = hdrRes.id ?? hdrRes.C_BankStatement_ID;
      if (!statementId) throw new Error('Gagal membuat header C_BankStatement.');

      for (const item of cart) {
        const basePayload = {
          AD_Org_ID: { id: orgId },
          C_BankStatement_ID: { id: statementId },
          StmtAmt: parseFloat(item.StmtAmt || 0),
          DateAcct:          stmtDate,
          StatementLineDate: stmtDate,
          ValutaDate:        stmtDate,
        };
        
        if (item.type === 'payment') {
          await idempiereApi('/models/c_bankstatementline', {
            method: 'POST',
            body: JSON.stringify({
              ...basePayload,
              TrxAmt:  parseFloat(item.TrxAmt ?? item.StmtAmt ?? 0),
              C_Payment_ID: { id: parseInt(item.C_Payment_ID) },
              ...(item.C_BPartner_ID ? { C_BPartner_ID: { id: parseInt(item.C_BPartner_ID) } } : {}),
              ...(item.C_Invoice_ID  ? { C_Invoice_ID:  { id: parseInt(item.C_Invoice_ID) } } : {}),
            }),
          });
        } else {
          await idempiereApi('/models/c_bankstatementline', {
            method: 'POST',
            body: JSON.stringify({
              ...basePayload,
              ChargeAmt:  parseFloat(item.ChargeAmt ?? item.StmtAmt ?? 0),
              C_Charge_ID: { id: parseInt(item.C_Charge_ID) },
              Description: item.Description || '',
            }),
          });
        }
      }

      let finalStatus = 'Draft';
      let documentNo = `BS-${statementId}`;
      if (submitMode === 'complete') {
        const completedRes = await idempiereApi(`/models/c_bankstatement/${statementId}`, {
          method: 'PUT',
          body: JSON.stringify({ 'doc-action': 'CO' }),
        });
        const status = completedRes.DocStatus?.id ?? completedRes.DocStatus;
        if (status !== 'CO' && status !== 'CL') {
          throw new Error(`Bank Statement gagal Complete (status: ${status || 'tidak diketahui'}). Cek langsung di iDempiere.`);
        }
        finalStatus = 'Completed';
        documentNo = completedRes.DocumentNo || documentNo;

        // TODO: kalau setelah dites ternyata IsReconciled TIDAK auto-ter-update
        // oleh Complete di atas, tambahkan loop di sini:
        // for (const item of cart.filter(i => i.type === 'payment')) {
        //   await idempiereApi(`/models/c_payment/${item.C_Payment_ID}`, {
        //     method: 'PUT', body: JSON.stringify({ IsReconciled: true }),
        //   });
        // }
      }

      return {
        result: { statementId, documentNo, status: finalStatus, itemCount: cart.length },
        hadError: false,
      };
    } catch (err) {
      onError?.(`Gagal memproses Bank Statement:\n\n${err.message}`, 'Error');
      return { result: null, hadError: true };
    } finally {
      setIsSubmitting(false);
    }
  }, [onError]);

  return { submit, fetchBeginningBalance, isSubmitting };
}