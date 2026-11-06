import { useState, useCallback } from 'react';
import { idempiereApi } from '@/api/idempiereApi';
import { getLoginInfo } from '@/shared/hooks/useLoginInfo';
import { useUomConversion } from '@/shared/hooks/useUomConversion';
import { saveRequisitionOffline, updatePendingRequisition } from '@/features/requisition/utils/offlineRequisitionStorage';

export function useRequisitionSubmit({ docTypeId, description: defaultDescription, DateRequired, onError }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toBaseQty } = useUomConversion();

  const submit = useCallback(async (
    cart,
    requesterName,
    warehouseId,
    editRequisitionId = null,
    description = null,
    dateRequired = null,
    submitMode = 'complete',
    // syncOptions hanya dipakai oleh proses auto-sync offline; pemanggilan
    // normal dari UI cukup abaikan parameter ini.
    syncOptions = {},
  ) => {
    const { contextOverride = null, onReqIdCreated = null, offlineId = null } = syncOptions;

    if (cart.length === 0) {
      onError?.('Daftar permintaan masih kosong!');
      return { success: false, reqId: editRequisitionId, message: 'empty-cart' };
    }

    const resolvedDescription = (description && description.trim()) ? description.trim() : defaultDescription;
    const todayISO = new Date().toISOString().split('T')[0];
    const resolvedDateRequired = (dateRequired && dateRequired.trim()) ? dateRequired.trim() : todayISO;

    // Kalau ada contextOverride (dipanggil dari auto-sync), pakai nilai yang
    // tersimpan saat dokumen dibuat offline — BUKAN sesi/login yang aktif
    // sekarang. Ini mencegah dokumen tersinkron atas nama/org/tipe dokumen
    // yang salah kalau user sudah ganti sesi sebelum koneksi kembali.
    const liveInfo = getLoginInfo();
    const userId    = contextOverride?.userId    ?? liveInfo.userId;
    const orgId     = contextOverride?.orgId     ?? liveInfo.orgId;
    const clientId  = contextOverride?.clientId  ?? liveInfo.clientId;
    const resolvedDocTypeId   = contextOverride?.docTypeId ?? docTypeId;
    const resolvedWarehouseId = warehouseId ?? liveInfo.warehouseId;

    if (!userId || !resolvedWarehouseId || !orgId || !clientId) {
      onError?.('Data sesi tidak lengkap.\nSilakan login kembali.', 'Error');
      return { success: false, reqId: editRequisitionId, message: 'missing-session' };
    }

    setIsSubmitting(true);

    // ── PENANGANAN OFFLINE ────────────────────────────────────────────────
    if (!navigator.onLine) {
      try {
        const offlineData = {
          cart,
          requesterName,
          warehouseId: resolvedWarehouseId,
          editRequisitionId,
          description: resolvedDescription,
          dateRequired: resolvedDateRequired,
          submitMode,
          docTypeId: resolvedDocTypeId,
          userId,
          orgId,
          clientId,
        };

        const saved = await saveRequisitionOffline(offlineData);

        return {
          success: true,
          isOffline: true,
          offlineId: saved.offlineId,
          documentNo: `OFFLINE (${saved.offlineId.slice(-6)})`,
          status: 'Tersimpan Offline',
          date: new Date().toLocaleString('id-ID'),
          requesterName,
          warehouseName: null,
          items: [...cart],
        };
      } catch (err) {
        onError?.('Gagal menyimpan dokumen secara offline:\n' + err.message, 'Error');
        return { success: false, reqId: editRequisitionId, message: err.message };
      } finally {
        setIsSubmitting(false);
      }
    }

    // ── PROSES ONLINE NORMAL ─────────────────────────────────────────────
    // reqId dilacak di luar try supaya kalau ada error SETELAH header
    // berhasil dibuat, kita masih tahu id-nya dan bisa laporkan ke caller
    // (auto-sync) untuk disimpan — retry berikutnya jadi mode edit, bukan
    // membuat header baru lagi (mencegah dokumen duplikat).
    let reqId = editRequisitionId;

    try {
      const insertRequisitionLine = async (targetReqId, item) => {
        const uomId      = item.selectedUom?.C_UOM_ID || item.C_UOM_ID;
        const qtyEntered = parseFloat(item.Qty);
        const qtyBase    = toBaseQty(qtyEntered, item.selectedUom);

        const basePayload = {
          AD_Org_ID:        { id: orgId },
          M_Requisition_ID: { id: targetReqId },
          M_Product_ID:     { id: parseInt(item.M_Product_ID) },
          C_UOM_ID:         { id: parseInt(uomId) },
          Qty:              qtyBase,
          ...(item.VendorId ? { C_BPartner_ID: { id: parseInt(item.VendorId) } } : {}),
        };

        try {
          return await idempiereApi('/models/m_requisitionline', {
            method: 'POST',
            body: JSON.stringify({ ...basePayload, QtyEntered: qtyEntered }),
          });
        } catch (err) {
          const msg = String(err?.message || '');
          const looksLikeMissingColumn = /qtyentered/i.test(msg);
          if (!looksLikeMissingColumn) throw err;

          return await idempiereApi('/models/m_requisitionline', {
            method: 'POST',
            body: JSON.stringify(basePayload),
          });
        }
      };

      if (reqId) {
        const currentRes = await idempiereApi(`/models/m_requisition/${reqId}?$select=DocStatus`);
        const currentStatus = currentRes?.DocStatus?.id ?? currentRes?.DocStatus ?? null;

        await idempiereApi(`/models/m_requisition/${reqId}`, {
          method: 'PUT',
          body: JSON.stringify({
            M_Warehouse_ID: { id: resolvedWarehouseId },
            DateRequired:   resolvedDateRequired,
            Description:    resolvedDescription,
          }),
        });

        const oldLinesRes = await idempiereApi(
          `/models/m_requisitionline?$filter=M_Requisition_ID eq ${reqId}&$select=M_RequisitionLine_ID`
        );
        const oldLines = Array.isArray(oldLinesRes.records) ? oldLinesRes.records : [];
        for (const line of oldLines) {
          const lineId = line.id ?? line.M_RequisitionLine_ID;
          await idempiereApi(`/models/m_requisitionline/${lineId}`, { method: 'DELETE' });
        }

        for (const item of cart) {
          await insertRequisitionLine(reqId, item);
        }

        if (currentStatus === 'NA' && submitMode === 'complete') {
          await idempiereApi(`/models/m_requisition/${reqId}`, {
            method: 'PUT',
            body: JSON.stringify({ 'doc-action': 'PR' }),
          });
        }
      } else {
        const headerRes = await idempiereApi('/models/m_requisition', {
          method: 'POST',
          body: JSON.stringify({
            AD_Client_ID:   { id: clientId },
            AD_Org_ID:      { id: orgId },
            C_DocType_ID:   { id: resolvedDocTypeId },
            M_Warehouse_ID: { id: resolvedWarehouseId },
            AD_User_ID:     { id: userId },
            DateRequired:   resolvedDateRequired,
            Description:    resolvedDescription,
            IsActive:       true,
          }),
        });

        reqId = headerRes.id ?? headerRes.M_Requisition_ID;
        if (!reqId) throw new Error('Gagal mendapatkan M_Requisition_ID dari server.');

        // Header sudah kebentuk di server — segera kabari caller & simpan
        // ke antrean offline (kalau ada) sebelum lanjut insert baris, jadi
        // kalau langkah berikutnya gagal, retry tidak membuat header lagi.
        onReqIdCreated?.(reqId);
        if (offlineId) {
          await updatePendingRequisition(offlineId, { editRequisitionId: reqId }).catch(() => {});
        }

        for (const item of cart) {
          await insertRequisitionLine(reqId, item);
        }
      }

      let docNo;
      let finalStatusLabel;

      if (submitMode === 'complete') {
        const completedRes = await idempiereApi(`/models/m_requisition/${reqId}`, {
          method: 'PUT',
          body: JSON.stringify({ 'doc-action': 'CO' }),
        });
        docNo = completedRes.DocumentNo || `REQ-${reqId}`;
        finalStatusLabel = 'Completed';
      } else {
        const draftRes = await idempiereApi(`/models/m_requisition/${reqId}?$select=DocumentNo,DocStatus`);
        docNo = draftRes.DocumentNo || `REQ-${reqId}`;
        finalStatusLabel = 'Draft';
      }

      return {
        success:       true,
        reqId,
        documentNo:    docNo,
        status:        finalStatusLabel,
        date:          new Date().toLocaleString('id-ID'),
        requesterName,
        warehouseName: null,
        items:         [...cart],
      };
    } catch (err) {
      const action = submitMode === 'complete' ? 'menyelesaikan' : 'menyimpan draft';
      onError?.(`Gagal ${action} Requisition:\n\n` + err.message, 'Error');
      return { success: false, reqId, message: err.message };
    } finally {
      setIsSubmitting(false);
    }
  }, [docTypeId, defaultDescription, onError, toBaseQty]);

  return { submit, isSubmitting };
}
