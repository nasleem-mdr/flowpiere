import { useState, useCallback } from 'react';
import { idempiereApi, fkId } from '@/api/idempiereApi';
import { getLoginInfo } from './useLoginInfo';
import { useUomConversion } from '@/shared/hooks/useUomConversion';

// ─────────────────────────────────────────────────────────────────────────────
// usePurchaseOrderSubmit.jsx
//
// MODE NORMAL (editOrderId = null): cart di-groupBy C_BPartner_ID, lalu untuk
// SETIAP vendor dibuatkan satu C_Order (header) + C_OrderLine (detail) BARU.
// 1 klik submit bisa menghasilkan BEBERAPA nomor dokumen PO sekaligus (1 per
// vendor) — sesuai requirement "kalau 1 FPB punya >1 vendor, buat PO terpisah".
//
// MODE EDIT (editOrderId diisi): meng-update SATU C_Order yang SUDAH ADA.
// KARENA proses normal di atas menjamin 1 dokumen PO = 1 vendor, PurchasingList
// juga hanya akan pernah mengirim cart utk edit dari 1 PO / 1 vendor. Maka:
//   - Cart WAJIB berisi 1 vendor saja, dan HARUS vendor yang sama dengan PO
//     yang sedang di-edit (vendor tidak bisa diganti lewat mode edit — kalau
//     butuh vendor lain, batalkan edit & buat PO baru).
//   - Header di-UPDATE (bukan create baru), lines lama dihapus lalu diganti
//     lines baru (pola sama dengan useRequisitionSubmit mode edit).
//   - FPB (M_RequisitionLine) yang tadinya ter-link ke line lama TAPI tidak
//     lagi ada di cart baru → otomatis di-UNMARK (C_OrderLine_ID di-null-kan)
//     supaya baris FPB itu bisa muncul lagi utk di-import ke PO lain.
//
// submitMode ('draft' | 'complete', default 'complete') — SAMA pola dengan
// useRequisitionSubmit.jsx:
//   - 'complete' -> doc-action 'CO' dipanggil setelah data tersimpan.
//   - 'draft'    -> TIDAK ada doc-action yang dipanggil sama sekali -> tetap Drafted.
//
// MATCHING M_RequisitionLine ↔ C_OrderLine — FIELD NATIVE (iDempiere 13+):
// Link-nya SATU ARAH SAJA: M_RequisitionLine.C_OrderLine_ID → C_OrderLine.
// PENTING: baris FPB HANYA ditandai "sudah di-PO-kan" kalau submitMode ===
// 'complete' — supaya FPB tidak dianggap selesai di-follow-up selama PO-nya
// sendiri masih draft (berlaku juga saat insert ulang lines di mode edit).
//
// ── UOM ENTERED vs BASE — 2 SUMBER, TERGANTUNG ASAL ITEM ──────────────────
// A) Item dari IMPORT FPB (item.sourceRequisitionLineId ada): QtyOrdered
//    diambil LANGSUNG dari item.BaseQty (sudah dikonversi benar sekali saat
//    FPB disubmit). TIDAK dihitung ulang di sini.
// B) Item MANUAL (tanpa sourceRequisitionLineId): QtyOrdered dihitung via
//    toBaseQty() dari useUomConversion.
// PriceActual, di KEDUA kasus, diturunkan dari rasio qty:
//     PriceActual = (PriceEntered × QtyEntered) ÷ QtyOrdered
//
// RETURN CONTRACT: submit() mengembalikan { results, hadError }. Setiap entry
// di `results` punya field `status: 'Draft' | 'Completed'`.
// ─────────────────────────────────────────────────────────────────────────────
export function usePurchaseOrderSubmit({ docTypeId, defaultDescription, onError }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fetchUomOptions, toBaseQty } = useUomConversion();

  const markRequisitionLineOrdered = useCallback(async (requisitionLineId, orderLineId) => {
    try {
      await idempiereApi(`/models/m_requisitionline/${requisitionLineId}`, {
        method: 'PUT',
        body: JSON.stringify({ C_OrderLine_ID: { id: orderLineId } }),
      });
      return true;
    } catch (err) {
      console.error(`[usePurchaseOrderSubmit] gagal update M_RequisitionLine.C_OrderLine_ID #${requisitionLineId}:`, err);
      return false;
    }
  }, []);

  // Unmark FPB line — dipakai saat edit membuang line yang tadinya dari FPB.
  const unmarkRequisitionLineOrdered = useCallback(async (requisitionLineId) => {
    try {
      await idempiereApi(`/models/m_requisitionline/${requisitionLineId}`, {
        method: 'PUT',
        body: JSON.stringify({ C_OrderLine_ID: null }),
      });
      return true;
    } catch (err) {
      console.error(`[usePurchaseOrderSubmit] gagal unmark M_RequisitionLine.C_OrderLine_ID #${requisitionLineId}:`, err);
      return false;
    }
  }, []);

  // Cari objek UOM (untuk toBaseQty) — HANYA dipakai untuk item MANUAL.
  const resolveSelectedUom = useCallback(async (item) => {
    const enteredUomId = parseInt(item.C_UOM_ID);
    const baseUomId    = parseInt(item.BaseUOM_ID || item.C_UOM_ID);
    if (!baseUomId || enteredUomId === baseUomId) return null;

    const options = await fetchUomOptions(item.M_Product_ID, baseUomId, null);
    const match = options.find(o => o.C_UOM_ID === enteredUomId);
    if (!match) {
      console.warn(
        `[usePurchaseOrderSubmit] tidak ditemukan C_UOM_Conversion untuk produk #${item.M_Product_ID} ` +
        `(UOM entered ${enteredUomId} → base ${baseUomId}). Qty tidak dikonversi — CEK MANUAL PO ini.`
      );
      return null;
    }
    return match;
  }, [fetchUomOptions]);

  const resolveQtyOrdered = useCallback(async (item, qtyEntered) => {
    const hasPrecomputedBaseQty = item.sourceRequisitionLineId && item.BaseQty != null && !isNaN(parseFloat(item.BaseQty));
    if (hasPrecomputedBaseQty) {
      return parseFloat(item.BaseQty);
    }
    const selectedUom = await resolveSelectedUom(item);
    return toBaseQty(qtyEntered, selectedUom);
  }, [resolveSelectedUom, toBaseQty]);

  // Hitung payload C_OrderLine dari 1 item cart — dipakai baik utk INSERT
  // (baris baru) maupun UPDATE (baris lama yang produknya masih sama, cuma
  // qty/harga/uom yang mungkin berubah).
  const buildLinePayload = useCallback(async (item) => {
    const qtyEntered   = parseFloat(item.Qty || 0);
    const priceEntered = parseFloat(item.Price || 0);
    const qtyOrdered   = await resolveQtyOrdered(item, qtyEntered);
    const priceActual  = qtyOrdered > 0 ? (priceEntered * qtyEntered) / qtyOrdered : priceEntered;
    return {
      C_UOM_ID:     { id: parseInt(item.C_UOM_ID) },
      QtyEntered:   qtyEntered,
      QtyOrdered:   qtyOrdered,
      PriceEntered: priceEntered,
      PriceActual:  priceActual,
      ...(item.sourceRequisitionLineId
        ? { Description: `Ref. FPB Line #${item.sourceRequisitionLineId}` }
        : {}),
    };
  }, [resolveQtyOrdered]);

  // Link 1 C_OrderLine (baru ATAU hasil update) ke FPB asalnya — HANYA
  // kalau submitMode === 'complete' (supaya FPB tidak dianggap selesai
  // selama PO masih draft). Dipakai baik oleh insertOrderLine maupun
  // updateOrderLine. Mengembalikan { ok, name } utk pelaporan matchFailures.
  const linkFpbIfNeeded = useCallback(async (item, orderLineId, submitMode) => {
    if (item.sourceRequisitionLineId && submitMode === 'complete') {
      const ok = await markRequisitionLineOrdered(item.sourceRequisitionLineId, orderLineId);
      return { ok, name: item.Name };
    }
    return { ok: true, name: item.Name };
  }, [markRequisitionLineOrdered]);

  // Insert 1 C_OrderLine BARU utk 1 item cart — dipakai di mode normal
  // (loop per vendor) dan mode edit (utk produk yang belum ada di PO ini).
  const insertOrderLine = useCallback(async (orderId, orgId, item, submitMode) => {
    const payload = await buildLinePayload(item);
    const lineRes = await idempiereApi('/models/c_orderline', {
      method: 'POST',
      body: JSON.stringify({
        AD_Org_ID:    { id: orgId },
        C_Order_ID:   { id: orderId },
        M_Product_ID: { id: parseInt(item.M_Product_ID) },
        ...payload,
      }),
    });
    const orderLineId = lineRes.id ?? lineRes.C_OrderLine_ID;
    return linkFpbIfNeeded(item, orderLineId, submitMode);
  }, [buildLinePayload, linkFpbIfNeeded]);

  // Update 1 C_OrderLine YANG SUDAH ADA (dipakai HANYA di mode edit, utk
  // produk yang sama persis dengan baris lama — jadi line-nya tidak pernah
  // di-delete sama sekali, menghindari error dependent-record mis. MRP
  // untuk baris yang sebenarnya tidak perlu diubah struktural-nya).
  const updateOrderLine = useCallback(async (lineId, item, submitMode) => {
    const payload = await buildLinePayload(item);
    await idempiereApi(`/models/c_orderline/${lineId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return linkFpbIfNeeded(item, lineId, submitMode);
  }, [buildLinePayload, linkFpbIfNeeded]);

  // Jalankan doc-action (atau tidak) sesuai submitMode, kembalikan {docNo, status}.
  const finalizeOrder = useCallback(async (orderId, submitMode, vendorName) => {
    if (submitMode === 'complete') {
      const completedRes = await idempiereApi(`/models/c_order/${orderId}`, {
        method: 'PUT',
        body: JSON.stringify({ 'doc-action': 'CO' }),
      });
      const finalStatus = completedRes.DocStatus?.id ?? completedRes.DocStatus;
      if (finalStatus !== 'CO' && finalStatus !== 'CL') {
        throw new Error(
          `PO untuk vendor "${vendorName}" (${completedRes.DocumentNo || `#${orderId}`}) gagal di-Complete ` +
          `(status: ${finalStatus || 'tidak diketahui'}). ` +
          `Kemungkinan ada field wajib yang belum terisi (mis. Company Agent) — cek dokumen ini langsung di iDempiere.`
        );
      }
      return { docNo: completedRes.DocumentNo || `PO-${orderId}`, status: 'Completed' };
    }
    // draft — tidak ada doc-action sama sekali
    const draftRes = await idempiereApi(`/models/c_order/${orderId}?$select=DocumentNo,DocStatus`);
    return { docNo: draftRes.DocumentNo || `PO-${orderId}`, status: 'Draft' };
  }, []);

  const submit = useCallback(async (cart, { warehouseId, description, submitMode = 'complete', editOrderId = null } = {}) => {
    if (cart.length === 0) {
      onError?.('Daftar Purchase Order masih kosong!');
      return { results: null, hadError: true };
    }

    const finalDescription = (description && description.trim()) || defaultDescription;

    const missingVendor = cart.filter(i => !i.C_BPartner_ID);
    if (missingVendor.length > 0) {
      onError?.(
        `${missingVendor.length} produk belum ditentukan vendor-nya:\n` +
        missingVendor.map(i => `• ${i.Name}`).join('\n'),
        'Vendor Belum Lengkap'
      );
      return { results: null, hadError: true };
    }

    // ── Mode edit: cart WAJIB 1 vendor saja ──────────────────────────────
    if (editOrderId) {
      const vendorIds = new Set(cart.map(i => String(i.C_BPartner_ID)));
      if (vendorIds.size > 1) {
        onError?.(
          'Saat mode edit, PO hanya boleh berisi 1 vendor (sesuai PO yang sedang di-edit).\n' +
          'Kalau butuh vendor lain, batalkan edit lalu buat PO baru dari FPB.',
          'Vendor Tidak Konsisten'
        );
        return { results: null, hadError: true };
      }
    }

    const { orgId, clientId, userId } = getLoginInfo();
    if (!orgId || !clientId || !warehouseId) {
      onError?.('Data sesi/gudang tidak lengkap.\nSilakan login kembali.', 'Error');
      return { results: null, hadError: true };
    }

    setIsSubmitting(true);
    const results = [];
    const matchFailures = [];
    const todayISO = new Date().toISOString().split('T')[0];

    try {
      if (editOrderId) {
        // ══════════════════════════════════════════════════════════════════
        // MODE EDIT — update 1 PO yang sudah ada, 1 vendor terkunci
        // ══════════════════════════════════════════════════════════════════
        const vendorId   = cart[0].C_BPartner_ID;
        const vendorName = cart[0].VendorName;

        const currentOrderRes = await idempiereApi(
          `/models/c_order/${editOrderId}?$select=DocStatus,C_BPartner_ID,C_BPartner_Location_ID`
        );
        const currentStatus  = currentOrderRes?.DocStatus?.id ?? currentOrderRes?.DocStatus ?? null;
        const existingVendorId = fkId(currentOrderRes?.C_BPartner_ID) ?? currentOrderRes?.C_BPartner_ID?.id;

        if (existingVendorId && String(existingVendorId) !== String(vendorId)) {
          throw new Error(
            `PO ini terdaftar untuk vendor lain (ID #${existingVendorId}).\n` +
            `Vendor tidak bisa diganti lewat mode edit — batalkan edit dan buat PO baru kalau perlu vendor berbeda.`
          );
        }

        let vendorLocationId = cart[0].C_BPartner_Location_ID
          || fkId(currentOrderRes?.C_BPartner_Location_ID)
          || currentOrderRes?.C_BPartner_Location_ID?.id;
        if (!vendorLocationId) {
          const locRes = await idempiereApi(
            `/models/c_bpartner_location?$select=C_BPartner_Location_ID&$filter=C_BPartner_ID eq ${vendorId} and IsActive eq true&$top=1`
          );
          const locRecords = Array.isArray(locRes.records) ? locRes.records : [];
          vendorLocationId = locRecords[0] ? (fkId(locRecords[0].C_BPartner_Location_ID) ?? locRecords[0].id) : null;
        }
        if (!vendorLocationId) {
          throw new Error(`Vendor "${vendorName}" tidak memiliki alamat aktif (C_BPartner_Location).\nTambahkan alamat vendor terlebih dahulu di Business Partner.`);
        }

        // ── Ambil lines lama (dengan detail lengkap, utk matching & compare) ─
        const oldLinesRes = await idempiereApi(
          `/models/c_orderline?$filter=C_Order_ID eq ${editOrderId}` +
          `&$select=C_OrderLine_ID,M_Product_ID,C_UOM_ID,QtyEntered,QtyOrdered,PriceEntered,PriceActual`
        );
        const oldLines = Array.isArray(oldLinesRes.records) ? oldLinesRes.records : [];

        // Map productId -> lineId lama, dipakai utk cocokkan tiap item cart
        // ke baris lama (matching BY PRODUK). Baris yang produknya masih
        // sama di-UPDATE DI TEMPAT — TIDAK PERNAH kena DELETE — sehingga
        // baris yang sebenarnya tidak berubah (atau cuma qty/harga yang
        // beda) tidak akan pernah tersandung dependent-record error (mis.
        // Material Requirement Planning) sama sekali.
        const oldLineByProduct = new Map();
        const oldLineDataById  = new Map();
        oldLines.forEach(l => {
          const lineId    = l.id ?? l.C_OrderLine_ID;
          const productId = fkId(l.M_Product_ID) ?? l.M_Product_ID?.id;
          if (productId != null) oldLineByProduct.set(String(productId), lineId);
          oldLineDataById.set(String(lineId), l);
        });

        // FPB yang ter-link ke MASING-MASING baris lama (per-line, bukan
        // cuma daftar) — dipakai supaya unmark hanya terjadi utk baris yang
        // BENAR-BENAR dibuang dari cart baru, bukan baris yang dipertahankan.
        let reqLineByOrderLine = new Map();
        if (oldLines.length > 0) {
          const oldLineIds = oldLines.map(l => l.id ?? l.C_OrderLine_ID);
          const filterStr = oldLineIds.map(id => `C_OrderLine_ID eq ${id}`).join(' or ');
          const linkedRes = await idempiereApi(
            `/models/m_requisitionline?$filter=${filterStr}&$select=M_RequisitionLine_ID,C_OrderLine_ID`
          );
          const linkedReqLines = Array.isArray(linkedRes.records) ? linkedRes.records : [];
          linkedReqLines.forEach(rl => {
            const olId = fkId(rl.C_OrderLine_ID) ?? rl.C_OrderLine_ID?.id;
            if (olId != null) reqLineByOrderLine.set(String(olId), rl.id ?? rl.M_RequisitionLine_ID);
          });
        }

        // ── Update header ──────────────────────────────────────────────
        await idempiereApi(`/models/c_order/${editOrderId}`, {
          method: 'PUT',
          body: JSON.stringify({
            M_Warehouse_ID:          { id: parseInt(warehouseId) },
            C_BPartner_Location_ID:  { id: parseInt(vendorLocationId) },
            DateOrdered:             todayISO,
            Description:             finalDescription,
          }),
        });

        // ── Proses tiap item cart: UPDATE baris lama yg produknya cocok,
        //    INSERT baris baru kalau produknya belum ada di PO ini ───────
        const matchedOldLineIds = new Set();
        for (const item of cart) {
          const productKey     = String(parseInt(item.M_Product_ID));
          const existingLineId = oldLineByProduct.get(productKey);

          if (existingLineId != null && !matchedOldLineIds.has(existingLineId)) {
            matchedOldLineIds.add(existingLineId);

            // Kalau baris ini sebelumnya ter-link ke FPB LAIN (bukan yang
            // sekarang dibawa item cart ini), unmark dulu FPB lama sebelum
            // update — supaya tidak ada 2 FPB nunjuk ke 1 baris yang sama.
            // Dicek TERLEPAS dari apakah qty/harga berubah atau tidak.
            const oldReqLineId = reqLineByOrderLine.get(String(existingLineId));
            if (oldReqLineId && String(oldReqLineId) !== String(item.sourceRequisitionLineId || '')) {
              const ok = await unmarkRequisitionLineOrdered(oldReqLineId);
              if (!ok) matchFailures.push(`(unmark) FPB line #${oldReqLineId}`);
            }

            // ── Bandingkan dgn data lama — SKIP PUT sama sekali kalau persis
            // sama (qty/uom/harga tidak berubah). Ini yang dimaksud "delete/
            // update baru jalan kalau memang ada perubahan" — baris yang
            // benar-benar tidak diapa-apakan user TIDAK disentuh sama sekali.
            const oldData         = oldLineDataById.get(String(existingLineId));
            const newQtyEntered   = parseFloat(item.Qty || 0);
            const newUomId        = parseInt(item.C_UOM_ID);
            const newPriceEntered = parseFloat(item.Price || 0);
            const oldQtyEntered   = parseFloat(oldData?.QtyEntered ?? oldData?.QtyOrdered ?? 0);
            const oldUomId        = fkId(oldData?.C_UOM_ID) ?? oldData?.C_UOM_ID?.id;
            const oldPriceEntered = parseFloat(oldData?.PriceEntered ?? oldData?.PriceActual ?? 0);

            const isUnchanged =
              Math.abs(oldQtyEntered - newQtyEntered) < 0.0001 &&
              Number(oldUomId) === Number(newUomId) &&
              Math.abs(oldPriceEntered - newPriceEntered) < 1; // toleransi kecil pembulatan rupiah

            if (isUnchanged) {
              // Tidak ada PUT ke C_OrderLine sama sekali. Tetap pastikan
              // link FPB benar kalau submitMode 'complete' (mis. PO
              // sebelumnya draft & FPB belum sempat di-mark) — ini hanya
              // sentuh M_RequisitionLine, tidak sentuh C_OrderLine.
              const { ok, name } = await linkFpbIfNeeded(item, existingLineId, submitMode);
              if (!ok) matchFailures.push(name);
            } else {
              const { ok, name } = await updateOrderLine(existingLineId, item, submitMode);
              if (!ok) matchFailures.push(name);
            }
          } else {
            const { ok, name } = await insertOrderLine(editOrderId, orgId, item, submitMode);
            if (!ok) matchFailures.push(name);
          }
        }

        // ── Baris lama yang produknya SUDAH TIDAK ADA di cart baru ───────
        // → coba dihapus. Kalau gagal (dependent record, mis. MRP), FALLBACK
        // nonaktifkan & nolkan qty-nya (bukan abort seluruh proses edit) —
        // supaya 1 baris bermasalah tidak memblokir seluruh perubahan lain.
        const linesToRemove = oldLines
          .map(l => l.id ?? l.C_OrderLine_ID)
          .filter(id => !matchedOldLineIds.has(id));

        for (const lineId of linesToRemove) {
          const reqLineId = reqLineByOrderLine.get(String(lineId));
          let removed = false;
          try {
            await idempiereApi(`/models/c_orderline/${lineId}`, { method: 'DELETE' });
            removed = true;
          } catch (err) {
            console.error(`[usePurchaseOrderSubmit] gagal hapus C_OrderLine #${lineId}, coba nonaktifkan:`, err);
            try {
              await idempiereApi(`/models/c_orderline/${lineId}`, {
                method: 'PUT',
                body: JSON.stringify({
                  IsActive:    false,
                  QtyEntered:  0,
                  QtyOrdered:  0,
                  Description: 'Dihapus dari edit (baris dipertahankan sistem krn ada data terkait, mis. MRP, yg mencegah delete)',
                }),
              });
              removed = true;
            } catch (err2) {
              console.error(`[usePurchaseOrderSubmit] gagal nonaktifkan C_OrderLine #${lineId} juga:`, err2);
              matchFailures.push(`(gagal dihapus) Line ID #${lineId} — perlu dicek manual di iDempiere`);
            }
          }
          if (removed && reqLineId) {
            const ok = await unmarkRequisitionLineOrdered(reqLineId);
            if (!ok) matchFailures.push(`(unmark) FPB line #${reqLineId}`);
          }
        }

        // ── Reset workflow kalau status lama NA (hanya relevan utk complete) ──
        if (currentStatus === 'NA' && submitMode === 'complete') {
          await idempiereApi(`/models/c_order/${editOrderId}`, {
            method: 'PUT',
            body: JSON.stringify({ 'doc-action': 'PR' }),
          });
        }

        // ── Complete / draft ─────────────────────────────────────────────
        const { docNo, status } = await finalizeOrder(editOrderId, submitMode, vendorName);

        results.push({
          documentNo: docNo,
          status,
          vendorName,
          date: new Date().toLocaleString('id-ID'),
          items: [...cart],
          total: cart.reduce((s, i) => s + i.Qty * (i.Price || 0), 0),
        });

      } else {
        // ══════════════════════════════════════════════════════════════════
        // MODE NORMAL — group-by-vendor, bikin PO baru per vendor
        // ══════════════════════════════════════════════════════════════════
        const groups = new Map();
        cart.forEach(item => {
          const key = item.C_BPartner_ID;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(item);
        });

        for (const [vendorId, items] of groups.entries()) {
          const vendorName = items[0].VendorName;

          let vendorLocationId = items[0].C_BPartner_Location_ID;
          if (!vendorLocationId) {
            const locRes = await idempiereApi(
              `/models/c_bpartner_location?$select=C_BPartner_Location_ID&$filter=C_BPartner_ID eq ${vendorId} and IsActive eq true&$top=1`
            );
            const locRecords = Array.isArray(locRes.records) ? locRes.records : [];
            vendorLocationId = locRecords[0] ? (fkId(locRecords[0].C_BPartner_Location_ID) ?? locRecords[0].id) : null;
          }
          if (!vendorLocationId) {
            throw new Error(`Vendor "${vendorName}" tidak memiliki alamat aktif (C_BPartner_Location).\nTambahkan alamat vendor terlebih dahulu di Business Partner.`);
          }

          const headerRes = await idempiereApi('/models/c_order', {
            method: 'POST',
            body: JSON.stringify({
              AD_Client_ID:           { id: clientId },
              AD_Org_ID:              { id: orgId },
              C_DocType_ID:           { id: docTypeId },
              C_DocTypeTarget_ID:     { id: docTypeId },
              C_BPartner_ID:          { id: parseInt(vendorId) },
              C_BPartner_Location_ID: { id: parseInt(vendorLocationId) },
              M_Warehouse_ID:         { id: parseInt(warehouseId) },
              DateOrdered:            todayISO,
              IsSOTrx:                false,
              Description:            finalDescription,
              IsActive:               true,
              ...(userId ? { SalesRep_ID: { id: parseInt(userId) } } : {}),
            }),
          });
          const orderId = headerRes.id ?? headerRes.C_Order_ID;
          if (!orderId) throw new Error(`Gagal membuat header PO untuk vendor "${vendorName}".`);

          for (const item of items) {
            const { ok, name } = await insertOrderLine(orderId, orgId, item, submitMode);
            if (!ok) matchFailures.push(name);
          }

          const { docNo, status } = await finalizeOrder(orderId, submitMode, vendorName);

          results.push({
            documentNo: docNo,
            status,
            vendorName,
            date: new Date().toLocaleString('id-ID'),
            items,
            total: items.reduce((s, i) => s + i.Qty * (i.Price || 0), 0),
          });
        }
      }

      if (matchFailures.length > 0) {
        onError?.(
          `PO berhasil diproses, tapi ada ${matchFailures.length} peringatan yang perlu dicek manual:\n` +
          matchFailures.map(n => `• ${n}`).join('\n') +
          `\n\nIni tidak mempengaruhi baris PO lain yang sudah berhasil dibuat/diupdate, tapi bagian yang ` +
          `disebutkan di atas (link status FPB dan/atau baris yang gagal dihapus) perlu dicek manual di iDempiere.`,
          'Peringatan: Ada Baris Perlu Dicek Manual'
        );
        return { results, hadError: true };
      }

      return { results, hadError: false };
    } catch (err) {
      onError?.(
        `Gagal memproses Purchase Order:\n\n${err.message}` +
        (results.length > 0
          ? `\n\n${results.length} PO SUDAH berhasil diproses sebelum error ini terjadi:\n` +
            results.map(r => `• ${r.documentNo} (${r.vendorName})`).join('\n')
          : ''),
        'Error'
      );
      return { results: results.length > 0 ? results : null, hadError: true };
    } finally {
      setIsSubmitting(false);
    }
  }, [docTypeId, defaultDescription, onError, insertOrderLine, updateOrderLine, linkFpbIfNeeded, finalizeOrder, unmarkRequisitionLineOrdered]);

  return { submit, isSubmitting };
}