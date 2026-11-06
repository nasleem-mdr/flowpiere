import { useState, useCallback } from 'react';
import { idempiereApi, fkId, waitForDocStatus } from '@/api/idempiereApi';
import { getLoginInfo } from '@/shared/hooks/useLoginInfo';
import { checkColumnSupport } from '@/shared/hooks/useSchemaCapability';
import { todayLocalISO } from '@/utils/dateOnly';
const toIdempiereTimestamp = (dateInput) => {
  if (!dateInput) return null;
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d)) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
};
export function useSalesInvoiceSubmit({ invoiceDocTypeId, description, onError, onStepUpdate }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressStep, setProgressStep] = useState(null);

  const submit = useCallback(async (cart, {
      customerId,
      customerLocationId,
      customerName,
      bankAccountId,
      dateInvoiced,          
      paymentRule = 'P',
      submitMode = 'complete',
      editInvoiceId = null,
    } = {}) => {
    if (cart.length === 0) {
      onError?.('Keranjang penjualan masih kosong!');
      return null;
    }

    const { orgId, clientId } = getLoginInfo();

    if (!customerId || !customerLocationId) {
      onError?.('Customer belum ditentukan.', 'Data Belum Lengkap');
      return null;
    }
    if (!invoiceDocTypeId) {
      onError?.('Document Type (Invoice) belum ter-resolve.', 'Konfigurasi Tidak Lengkap');
      return null;
    }

    setIsSubmitting(true);
    const isEditMode = !!editInvoiceId;
    const created = { invoiceId: isEditMode ? editInvoiceId : null };

    try {
      const effectiveDate = dateInvoiced || todayLocalISO();
      const trimmedDescription = (description || '').trim();

      setProgressStep('invoice');
      onStepUpdate?.('invoice', 'pending');

      const hasBankAccount = await checkColumnSupport('c_invoice', 'C_BankAccount_ID');

      if (hasBankAccount && !bankAccountId) {
        onError?.('Rekening bank belum ditentukan.', 'Data Belum Lengkap');
        setIsSubmitting(false);
        setProgressStep(null);
        return null;
      }

      let invoiceId = editInvoiceId;
      let invoiceRes;

      if (isEditMode) {
        // ═══════════════════════════════════════════════════════════════
        // MODE EDIT — update header + diff lines terhadap invoice existing
        // ═══════════════════════════════════════════════════════════════

        // Guard: invoice hanya boleh diubah kalau masih Draft/Ditolak —
        // konsisten dengan isEditDisabled di SalesInvoiceList.jsx.
        const existing = await idempiereApi(`/models/c_invoice/${invoiceId}?$select=DocStatus,DocumentNo`);
        const existingStatus = existing.DocStatus?.id ?? existing.DocStatus;
        if (!['DR', 'NA'].includes(existingStatus)) {
          throw new Error(`Invoice berstatus "${existingStatus}" tidak bisa diedit lagi.`);
        }

        const headerPayload = {
          C_BPartner_ID: { id: parseInt(customerId) },
          C_BPartner_Location_ID: { id: parseInt(customerLocationId) },
          PaymentRule: paymentRule,
          DateInvoiced: effectiveDate,
          DateAcct:     effectiveDate,
        };
        if (trimmedDescription) headerPayload.POReference = trimmedDescription;
        if (hasBankAccount) {
          // Eksplisit null kalau user mengosongkan pilihan bank saat edit.
          headerPayload.C_BankAccount_ID = bankAccountId ? { id: parseInt(bankAccountId) } : null;
        }

        invoiceRes = await idempiereApi(`/models/c_invoice/${invoiceId}`, {
          method: 'PUT',
          body: JSON.stringify(headerPayload),
        });
        invoiceRes.DocumentNo = invoiceRes.DocumentNo || existing.DocumentNo;
        
        
        // ── Diff line items ────────────────────────────────────────────
        // cart item dengan `sourceInvoiceLineId` = line lama yang masih
        // dipertahankan (mungkin diedit qty/price/uom-nya). Item tanpa
        // field itu = line baru yang ditambahkan user saat edit. Line
        // lama yang ID-nya tidak lagi muncul di cart = dihapus user →
        // DELETE dari server.
        const currentLinesRes = await idempiereApi(
          `/models/c_invoiceline?$filter=C_Invoice_ID eq ${invoiceId}&$select=C_InvoiceLine_ID`
        );
        const currentLineIds = (currentLinesRes.records || [])
          .map(l => String(l.id ?? l.C_InvoiceLine_ID));
        const keptLineIds = new Set(
          cart.filter(i => i.sourceInvoiceLineId).map(i => String(i.sourceInvoiceLineId))
        );
        const toDelete = currentLineIds.filter(id => !keptLineIds.has(id));

        for (const lineId of toDelete) {
          await idempiereApi(`/models/c_invoiceline/${lineId}`, { method: 'DELETE' });
        }

        for (const item of cart) {
          const uom = item.selectedUom || { C_UOM_ID: item.C_UOM_ID, multiplyRate: 1 };
          const qtyEntered = parseFloat(item.Qty);
          const qtyInvoiced = qtyEntered * (uom.multiplyRate || 1);

          const linePayload = {
            AD_Org_ID:     { id: orgId },
            M_Product_ID:  { id: parseInt(item.M_Product_ID) },
            C_UOM_ID:      { id: parseInt(uom.C_UOM_ID) },
            QtyEntered:    qtyEntered,
            QtyInvoiced:   qtyInvoiced,
            PriceActual:   parseFloat(item.PriceActual || item.Price || 0),
            PriceEntered:  parseFloat(item.PriceEntered || item.PriceActual || item.Price || 0),
            Description:   item.Description || item.Name,
          };
          if (item.DateService) linePayload.DateService = toIdempiereTimestamp(item.DateService);
          if (item.M_InOutLine_ID) linePayload.M_InOutLine_ID = { id: parseInt(item.M_InOutLine_ID) }; 
          if (item.C_OrderLine_ID) linePayload.C_OrderLine_ID = { id: parseInt(item.C_OrderLine_ID) }; 

          if (item.sourceInvoiceLineId) {
            await idempiereApi(`/models/c_invoiceline/${item.sourceInvoiceLineId}`, {
              method: 'PUT',
              body: JSON.stringify(linePayload),
            });
          } else {
            await idempiereApi('/models/c_invoiceline', {
              method: 'POST',
              body: JSON.stringify({ ...linePayload, C_Invoice_ID: { id: invoiceId } }),
            });
          }
        }

      } else {
        // ═══════════════════════════════════════════════════════════════
        // MODE CREATE — perilaku lama, TIDAK diubah
        // ═══════════════════════════════════════════════════════════════
        const invoicePayload = {
          AD_Client_ID:  { id: clientId },
          AD_Org_ID:     { id: orgId },
          C_DocType_ID:  { id: invoiceDocTypeId },
          C_DocTypeTarget_ID: { id: invoiceDocTypeId },
          C_BPartner_ID: { id: parseInt(customerId) },
          C_BPartner_Location_ID: { id: parseInt(customerLocationId) },
          DateInvoiced:  effectiveDate,
          DateAcct:      effectiveDate,
          IsSOTrx:       true,
          PaymentRule:   paymentRule,
        };

        if (trimmedDescription) {
          invoicePayload.POReference = trimmedDescription;
        }
        if (hasBankAccount && bankAccountId) {
          invoicePayload.C_BankAccount_ID = { id: parseInt(bankAccountId) };
        }

        invoiceRes = await idempiereApi('/models/c_invoice', {
          method: 'POST',
          body: JSON.stringify(invoicePayload),
        });
        invoiceId = fkId(invoiceRes.id) ?? invoiceRes.id ?? invoiceRes.C_Invoice_ID;
        if (!invoiceId) throw new Error('Gagal mendapatkan C_Invoice_ID.');

        for (const item of cart) {
          const uom = item.selectedUom || { C_UOM_ID: item.C_UOM_ID, multiplyRate: 1 };
          const qtyEntered = parseFloat(item.Qty);
          const qtyInvoiced = qtyEntered * (uom.multiplyRate || 1);
          // const toIdempiereTimestamp = (dateInput) => {
          //   if (!dateInput) return null;
          //   const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
          //   if (isNaN(d)) return null;
          //   return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); // "2026-08-20T00:00:00Z"
          // };

          await idempiereApi('/models/c_invoiceline', {
            method: 'POST',
            body: JSON.stringify({
            AD_Org_ID:     { id: orgId },
            C_Invoice_ID:  { id: invoiceId },
            M_Product_ID:  { id: parseInt(item.M_Product_ID) },
            C_UOM_ID:      { id: parseInt(uom.C_UOM_ID) },
            QtyEntered:    qtyEntered,
            QtyInvoiced:   qtyInvoiced,
            PriceActual:   parseFloat(item.PriceActual || item.Price || 0),
            PriceEntered:  parseFloat(item.PriceEntered || item.PriceActual || item.Price || 0),
            Description:   item.Description || item.Name,
            ...(item.M_InOutLine_ID ? { M_InOutLine_ID: { id: parseInt(item.M_InOutLine_ID) } } : {}), // ⬅️ TAMBAHKAN
            ...(item.C_OrderLine_ID ? { C_OrderLine_ID: { id: parseInt(item.C_OrderLine_ID) } } : {}), // ⬅️ TAMBAHKAN
            ...(item.DateService ? { DateService: toIdempiereTimestamp(item.DateService) } : {}),
          }),
          });
        }
      }

      created.invoiceId = invoiceId;

      // ═══════════════════════════════════════════════════════════════════
      // Complete / Draft — sama untuk kedua mode
      // ═══════════════════════════════════════════════════════════════════
      const clientGrandTotal = cart.reduce(
        (s, item) => s + (parseFloat(item.Qty) * parseFloat(item.Price || item.PriceActual || 0)), 0
      );

      if (submitMode === 'draft') {
        onStepUpdate?.('invoice', 'success', { id: invoiceId, documentNo: invoiceRes.DocumentNo, status: 'Drafted' });
        return {
          invoiceId,
          documentNo: invoiceRes.DocumentNo || `#${invoiceId}`,
          status: 'Draft',
          grandTotal: clientGrandTotal,
          customerName: customerName || `#${customerId}`,
          date: new Date().toLocaleString('id-ID'),
          items: [...cart],
        };
      }

      const completedInvoice = await idempiereApi(`/models/c_invoice/${invoiceId}`, {
        method: 'PUT',
        body: JSON.stringify({ 'doc-action': 'CO' }),
      });
      const invoiceStatus = await waitForDocStatus('c_invoice', invoiceId);
      if (!invoiceStatus.success) throw new Error(`Invoice gagal Complete (status: ${invoiceStatus.status})`);

      const grandTotal = parseFloat(completedInvoice.GrandTotal ?? invoiceStatus.grandTotal ?? clientGrandTotal);
      onStepUpdate?.('invoice', 'success', { id: invoiceId, documentNo: invoiceStatus.documentNo, status: 'Completed' });

      return {
        invoiceId,
        documentNo: invoiceStatus.documentNo,
        status: 'Completed',
        grandTotal,
        customerName: customerName || `#${customerId}`,
        date: new Date().toLocaleString('id-ID'),
        items: [...cart],
      };

    } catch (err) {
      const doneList = Object.entries(created)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');

      onStepUpdate?.(progressStep, 'error', { message: err.message });
      onError?.(
        `Gagal pada tahap "${progressStep}": ${err.message}` +
        (doneList ? `\n\nDokumen yang SUDAH berhasil dibuat/diubah (perlu ditindaklanjuti manual):\n${doneList}` : ''),
        'Proses Terhenti'
      );
      return null;
    } finally {
      setIsSubmitting(false);
      setProgressStep(null);
    }
  }, [invoiceDocTypeId, description, onError, onStepUpdate, progressStep]);
  
  return { submit, isSubmitting, progressStep };
}
