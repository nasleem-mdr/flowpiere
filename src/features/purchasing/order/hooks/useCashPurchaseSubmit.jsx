import { useState, useCallback } from 'react';
import { idempiereApi, fkId } from '@/api/idempiereApi';
import { getLoginInfo } from '@/shared/hooks/useLoginInfo';
import { useAPPaymentSubmit } from '@/features/purchasing/order/hooks/useAPPaymentSubmit';
import { waitForDocStatus } from '@/utils/docStatusWaiter';
import { useUomConversion } from '@/shared/hooks/useUomConversion';
import { todayLocalISO, isDateOnly } from '@/utils/dateOnly';

// ─────────────────────────────────────────────────────────────────────────────
// useCashPurchaseSubmit.jsx
// Alur: PO → Receipt → Invoice → Payment → Allocation (pembelian TUNAI).
//
// PERUBAHAN UTAMA — dukungan APPROVAL WORKFLOW pada Purchase Order
// ─────────────────────────────────────────────────────────────────────────────
// Kalau PO punya approval workflow, `doc-action: CO` dari REST TIDAK langsung
// menghasilkan status CO. Dokumen masuk IP (In Progress) dan menunggu approver.
// Itu BUKAN error. Perilaku sekarang:
//   1. submit(): kalau PO berhenti di IP/WP → proses berhenti rapi dan
//      mengembalikan { pendingApproval: true, poId, ... } (BUKAN throw).
//      Receipt/Invoice/Payment TIDAK dibuat, supaya tidak ada dokumen setengah jadi.
//   2. resumeFromPO(poId, {...}): dipanggil SETELAH PO di-approve. Membaca ulang
//      PO + baris-barisnya dari server, lalu melanjutkan Receipt → Invoice →
//      Payment → Allocation. Kalau PO berstatus AP (approved tapi workflow tidak
//      lanjut ke Complete), resume akan meng-Complete-kan PO itu dulu.
//
// BYPASS WORKFLOW UNTUK CASH PURCHASE: bypass TIDAK bisa dilakukan dari React
// (REST doc-action selalu lewat workflow dokumen di server). Bypass diatur di
// iDempiere lewat Transition Condition pada transisi menuju QC Check. Hook ini
// menjaga sisi React: kalau PO Cash Purchase tetap masuk IP/WP, proses dihentikan
// dengan pesan error konfigurasi yang jelas (kecuali allowApprovalWait: true).
//
// Status lain: Receipt/Invoice juga dicek statusnya setelah CO (sebelumnya
// Invoice tidak dicek, sehingga Payment bisa dibuat untuk Invoice yang belum CO).
//
// UOM/PRICE: sama seperti sebelumnya — konversi di-fetch fresh dari server,
// priceOrdered diturunkan dari rasio qty.
// ─────────────────────────────────────────────────────────────────────────────

const AD_TABLE_C_ORDER = 259;
const NOT_DONE_STATUSES = ['IP', 'WP', 'AP'];

const idOf = (v) => v?.id ?? v;
const docStatusOf = (rec) => idOf(rec?.DocStatus) ?? null;

// Kirim keterangan live ke progress modal (status tetap 'pending').
const pend = (cb, step, detail) => cb?.(step, 'pending', { detail });

// PUT doc-action CO lalu baca status dari response. Hanya fallback ke polling
// kalau status tidak terbaca — IP/WP/AP langsung dianggap "belum selesai"
// (tidak perlu menunggu timeout waitForDocStatus).
async function completeDocument(table, id) {
  const rec = await idempiereApi(`/models/${table}/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ 'doc-action': 'CO' }),
  });
  const status = docStatusOf(rec);

  if (status === 'CO') {
    return { status, completed: true, pending: false, documentNo: rec?.DocumentNo, record: rec };
  }
  if (NOT_DONE_STATUSES.includes(status)) {
    return { status, completed: false, pending: true, documentNo: rec?.DocumentNo, record: rec };
  }

  const w = await waitForDocStatus(table, id);
  return {
    status: w.status,
    completed: !!w.success,
    pending: NOT_DONE_STATUSES.includes(w.status),
    documentNo: w.documentNo ?? rec?.DocumentNo,
    record: rec,
  };
}

// Apakah PO ini punya workflow activity yang masih berjalan (menunggu approver)?
// true = ada, false = tidak ada, null = tidak bisa dicek (mis. tidak ada akses).
async function hasOpenWorkflow(poId) {
  try {
    const res = await idempiereApi(
      `/models/ad_wf_activity?$filter=AD_Table_ID eq ${AD_TABLE_C_ORDER} and Record_ID eq ${poId} and Processed eq false&$top=1`
    );
    return (res?.records?.length ?? 0) > 0;
  } catch {
    return null;
  }
}

export function useCashPurchaseSubmit({ poDocTypeId, receiptDocTypeId, invoiceDocTypeId, description, onError, onStepUpdate }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progressStep, setProgressStep] = useState(null); // 'po' | 'receipt' | 'invoice' | 'payment' | 'allocation'
  // Status per tahap disimpan DI DALAM hook (dikembalikan sebagai `steps`), jadi
  // progress modal tidak bergantung pada callback onStepUpdate dari container.
  const [steps, setSteps] = useState({});
  const emit = useCallback((step, status, meta) => {
    console.log('[CashPurchase v3] emit:', step, status, meta); // DEBUG — hapus kalau sudah beres
    setSteps(prev => ({ ...prev, [step]: { ...meta, status } }));
    onStepUpdate?.(step, status, meta); // tetap diteruskan (opsional) ke container
  }, [onStepUpdate]);

  const { submitPaymentAllocation } = useAPPaymentSubmit();
  const { fetchUomOptions, toBaseQty } = useUomConversion();

  const resolveLineUom = useCallback(async (item) => {
    const enteredUomId = parseInt(item.C_UOM_ID);
    const baseUomId = parseInt(item.BaseUOM_ID || item.C_UOM_ID);

    if (!baseUomId) return null;
    if (enteredUomId === baseUomId) return null; // sudah UOM dasar

    const options = await fetchUomOptions(item.M_Product_ID, baseUomId, null);
    const match = Array.isArray(options) ? options.find(o => o.C_UOM_ID === enteredUomId) : null;

    if (!match) {
      console.warn(
        `[CashPurchase] Konversi UOM tidak ditemukan untuk produk #${item.M_Product_ID} ` +
        `(C_UOM_ID=${enteredUomId}). Qty TIDAK dikonversi — cek C_UOM_Conversion.`
      );
      return null;
    }
    return match;
  }, [fetchUomOptions]);

  // Ambil ulang baris PO dari server (dipakai saat resume setelah approval).
  const fetchPoLines = useCallback(async (poId) => {
    const res = await idempiereApi(`/models/c_orderline?$filter=C_Order_ID eq ${poId}&$orderby=Line`);
    return (res?.records ?? []).map(l => ({
      orderLineId:  l.id ?? l.C_OrderLine_ID,
      productId:    idOf(l.M_Product_ID),
      uom:          { C_UOM_ID: idOf(l.C_UOM_ID) },
      qtyEntered:   parseFloat(l.QtyEntered),
      qtyOrdered:   parseFloat(l.QtyOrdered),
      priceEntered: parseFloat(l.PriceEntered),
      priceOrdered: parseFloat(l.PriceActual),
    }));
  }, []);

  // ═════════════════════════════════════════════════════════════════════════
  // TAHAP 2–5 (Receipt → Invoice → Payment → Allocation)
  // Dipakai bersama oleh submit() dan resumeFromPO().
  // ═════════════════════════════════════════════════════════════════════════
  const runFromReceipt = useCallback(async ({
    poId, poLines, vendorId, vendorLocationId, warehouseId, locatorId,
    dateISO, bankAccountId, paymentTenderType, created, setStep,
  }) => {
    const { orgId, clientId } = getLoginInfo();

    // ── TAHAP 2 — Material Receipt ──────────────────────────────────────
    setStep('receipt');
    pend(emit, 'receipt', 'Membuat header Material Receipt...');
    const receiptRes = await idempiereApi('/models/m_inout', {
      method: 'POST',
      body: JSON.stringify({
        AD_Client_ID: { id: clientId },
        AD_Org_ID:    { id: orgId },
        C_DocType_ID: { id: receiptDocTypeId },
        C_Order_ID:   { id: poId },
        C_BPartner_ID: { id: parseInt(vendorId) },
        C_BPartner_Location_ID: { id: parseInt(vendorLocationId) },
        M_Warehouse_ID: { id: parseInt(warehouseId) },
        MovementDate: dateISO,
        DateAcct:     dateISO,
        IsSOTrx:      false,
        Description:  description,
      }),
    });
    const receiptId = fkId(receiptRes.id) ?? receiptRes.id ?? receiptRes.M_InOut_ID;
    if (!receiptId) throw new Error('Gagal mendapatkan M_InOut_ID (Receipt).');
    created.receiptId = receiptId;

    const inOutLineIds = [];
    for (const [i, line] of poLines.entries()) {
      pend(emit, 'receipt', `Menambah baris ${i + 1}/${poLines.length}`);
      const lineRes = await idempiereApi('/models/m_inoutline', {
        method: 'POST',
        body: JSON.stringify({
          AD_Org_ID:      { id: orgId },
          M_InOut_ID:     { id: receiptId },
          M_Product_ID:   { id: parseInt(line.productId) },
          M_Locator_ID:   { id: parseInt(locatorId) },
          C_UOM_ID:       { id: parseInt(line.uom.C_UOM_ID) },
          QtyEntered:     line.qtyEntered,
          MovementQty:    line.qtyOrdered,
          C_OrderLine_ID: { id: line.orderLineId }, // kunci 3-way matching
        }),
      });
      inOutLineIds.push({
        inOutLineId: fkId(lineRes.id) ?? lineRes.id,
        orderLineId: line.orderLineId,
      });
    }

    pend(emit, 'receipt', 'Complete Receipt...');
    const receiptDone = await completeDocument('m_inout', receiptId);
    if (!receiptDone.completed) {
      throw new Error(
        `Receipt belum Complete (status: ${receiptDone.status}). ` +
        (receiptDone.pending ? 'Receipt tampaknya juga terkena approval workflow — selesaikan manual di iDempiere.' : '')
      );
    }
    emit('receipt', 'success', { id: receiptId, documentNo: receiptDone.documentNo });

    // ── TAHAP 3 — Vendor Invoice ────────────────────────────────────────
    setStep('invoice');
    pend(emit, 'invoice', 'Membuat header Vendor Invoice...');

    // POReference invoice diisi nomor dokumen PO (C_Order.DocumentNo).
    // Dibaca ulang dari server supaya sama untuk jalur submit() maupun
    // resumeFromPO() (PO yang baru di-approve).
    let poDocumentNo = '';
    try {
      const poHdr = await idempiereApi(`/models/c_order/${poId}?$select=DocumentNo`);
      poDocumentNo = poHdr?.DocumentNo ?? '';
    } catch (e) {
      console.warn('[CashPurchase] Gagal membaca DocumentNo PO untuk POReference:', e);
    }

    const invoiceRes = await idempiereApi('/models/c_invoice', {
      method: 'POST',
      body: JSON.stringify({
        AD_Client_ID: { id: clientId },
        AD_Org_ID:    { id: orgId },
        C_DocType_ID: { id: invoiceDocTypeId },
        C_DocTypeTarget_ID: { id: invoiceDocTypeId },
        C_Order_ID:   { id: poId },
        C_BPartner_ID: { id: parseInt(vendorId) },
        C_BPartner_Location_ID: { id: parseInt(vendorLocationId) },
        DateInvoiced: dateISO,
        DateAcct:     dateISO,
        IsSOTrx:      false,
        PaymentRule:  'P',
        Description:  description,
        ...(poDocumentNo && { POReference: poDocumentNo }),   // ← baru
      }),
    });
    const invoiceId = fkId(invoiceRes.id) ?? invoiceRes.id ?? invoiceRes.C_Invoice_ID;
    if (!invoiceId) throw new Error('Gagal mendapatkan C_Invoice_ID.');
    created.invoiceId = invoiceId;

    for (const [idx, line] of poLines.entries()) {
      pend(emit, 'invoice', `Menambah baris ${idx + 1}/${poLines.length}`);
      const matchedInOutLine = inOutLineIds.find(io => io.orderLineId === line.orderLineId);
      const invoiceLinePayload = {
        AD_Org_ID:      { id: orgId },
        C_Invoice_ID:   { id: invoiceId },
        M_Product_ID:   { id: parseInt(line.productId) },
        C_UOM_ID:       { id: parseInt(line.uom.C_UOM_ID) },
        QtyEntered:     line.qtyEntered,
        QtyInvoiced:    line.qtyOrdered,
        PriceActual:    line.priceOrdered,
        PriceEntered:   line.priceEntered,
        C_OrderLine_ID: { id: line.orderLineId },
        ...(matchedInOutLine ? { M_InOutLine_ID: { id: matchedInOutLine.inOutLineId } } : {}),
      };
      try {
        await idempiereApi('/models/c_invoiceline', {
          method: 'POST',
          body: JSON.stringify(invoiceLinePayload),
        });
      } catch (err) {
        console.error(`[CashPurchase] POST c_invoiceline baris ${idx + 1} GAGAL. Payload:`, invoiceLinePayload, err);
        throw err;
      }
      created.invoiceLinesCreated++;
    }

    pend(emit, 'invoice', 'Complete Invoice...');
    const invoiceDone = await completeDocument('c_invoice', invoiceId);
    if (!invoiceDone.completed) {
      throw new Error(
        `Invoice belum Complete (status: ${invoiceDone.status}). Payment tidak dibuat untuk invoice yang belum Complete.`
      );
    }

    let invoiceGrandTotal = parseFloat(invoiceDone.record?.GrandTotal ?? 0);
    if (!invoiceGrandTotal) {
      // Response CO tidak memuat GrandTotal → baca langsung dari server.
      const inv = await idempiereApi(`/models/c_invoice/${invoiceId}?$select=GrandTotal`);
      invoiceGrandTotal = parseFloat(inv?.GrandTotal ?? 0);
    }
    emit('invoice', 'success', { id: invoiceId, documentNo: invoiceDone.documentNo });

    // ── TAHAP 4 — Payment ───────────────────────────────────────────────
    setStep('payment');
    pend(emit, 'payment', 'Membuat & Complete payment ke vendor, lalu verifikasi alokasi...');
    const paymentResult = await submitPaymentAllocation(
      // grandTotal 0 → undefined supaya hook payment memakai GrandTotal dari record invoice
      [{ invoiceId, grandTotal: invoiceGrandTotal || undefined }],
      { vendorId, bankAccountId, paymentTenderType, dateTrx: dateISO }
    );
    if (!paymentResult || !paymentResult.paymentId) {
      throw new Error('Payment/Allocation gagal — lihat detail error sebelumnya.');
    }
    created.paymentId = paymentResult.paymentId;
    emit('payment', 'success', { id: paymentResult.paymentId, documentNo: paymentResult.documentNo });

    // ── TAHAP 5 — Allocation (verifikasi saja, dibuat otomatis saat Payment CO) ──
    if (paymentResult.allocated) {
      emit('allocation', 'success', { documentNo: paymentResult.documentNo });
    } else {
      emit('allocation', 'error', {
        message: 'Payment sudah Complete tapi Allocation belum terverifikasi. Cek manual di window "Payment Allocation".',
      });
    }

    return { receiptId, invoiceId, paymentId: created.paymentId, grandTotal: invoiceGrandTotal };
  }, [receiptDocTypeId, invoiceDocTypeId, description, emit, submitPaymentAllocation]);

  // Laporan kegagalan seragam: tampilkan dokumen mana yang SUDAH terbentuk.
  const reportFailure = useCallback((err, step, created) => {
    const doneList = Object.entries(created)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    onError?.(
      `Gagal pada tahap "${step}": ${err.message}` +
      (doneList ? `\n\nDokumen yang SUDAH berhasil dibuat (perlu ditindaklanjuti manual):\n${doneList}` : ''),
      'Proses Terhenti'
    );
    emit(step, 'error', { message: err.message });
  }, [onError, emit]);

  // ═════════════════════════════════════════════════════════════════════════
  // submit — mulai dari PO
  // Return:
  //   null                         → validasi/gagal (onError sudah dipanggil)
  //   { pendingApproval: true, … } → PO menunggu approval (BUKAN error)
  //   { poId, receiptId, … }       → seluruh rantai selesai
  // ═════════════════════════════════════════════════════════════════════════
  const submit = useCallback(async (cart, {
    warehouseId,
    locatorId,
    vendorId,
    vendorLocationId,
    vendorName,
    paymentTenderType = 'K',
    bankAccountId,
    dateOrdered,
    // Cash Purchase TIDAK boleh menunggu approval (bypass dikonfigurasi di
    // workflow iDempiere lewat Transition Condition). Kalau PO tetap masuk
    // IP/WP, berarti bypass belum bekerja → dianggap error konfigurasi.
    // Set true hanya kalau suatu saat flow ini ingin mendukung approval lagi.
    allowApprovalWait = false,
  } = {}) => {
    if (cart.length === 0) {
      onError?.('Keranjang pembelian masih kosong!');
      return null;
    }

    const { orgId, clientId } = getLoginInfo();

    if (!vendorId || !vendorLocationId) {
      onError?.('Vendor belum ditentukan.', 'Data Belum Lengkap');
      return null;
    }
    if (!warehouseId || !locatorId) {
      onError?.('Gudang/lokasi tujuan belum ditentukan.', 'Data Belum Lengkap');
      return null;
    }
    if (!poDocTypeId || !receiptDocTypeId || !invoiceDocTypeId) {
      onError?.('Document Type (PO/Receipt/Invoice) belum ter-resolve.', 'Konfigurasi Tidak Lengkap');
      return null;
    }

    const zeroLinePriceItems = cart.filter(
      item => parseFloat(item.PriceEntered ?? item.Price ?? 0) <= 0
    );
    if (zeroLinePriceItems.length > 0) {
      const names = zeroLinePriceItems.map(i => i.Name || `#${i.M_Product_ID}`).join(', ');
      onError?.(
        `Item berikut belum punya harga (Rp 0) di cart: ${names}.\n` +
        `Isi harga manual dulu di cart (kolom harga per item) sebelum submit Cash Purchase.`,
        'Harga Item Kosong'
      );
      return null;
    }

    const orderDateISO = dateOrdered || todayLocalISO();
    if (!isDateOnly(orderDateISO)) {
      onError?.(`Tanggal pemesanan tidak valid: "${orderDateISO}".`, 'Data Belum Lengkap');
      return null;
    }
    if (orderDateISO > todayLocalISO()) {
      onError?.(
        'Cash Purchase tidak boleh bertanggal di masa depan (barang diterima & dibayar saat itu juga).\n' +
        'Ubah tanggal pemesanan ke hari ini atau sebelumnya, atau gunakan Draft/Complete biasa.',
        'Tanggal Tidak Valid'
      );
      return null;
    }

    console.log('[CashPurchase v3] submit() dimulai, item:', cart.length); // DEBUG
    setSteps({});
    setIsSubmitting(true);
    setProgressStep(null);
    // Dilacak via variabel lokal (bukan state) — closure tidak melihat state terbaru.
    let currentStep = null;
    const setStep = (step) => { currentStep = step; setProgressStep(step); };
    const created = { poId: null, receiptId: null, invoiceId: null, paymentId: null, invoiceLinesCreated: 0 };

    try {
      // ── TAHAP 1 — Purchase Order ────────────────────────────────────────
      setStep('po');
      pend(emit, 'po', 'Membuat header Purchase Order...');
      const poRes = await idempiereApi('/models/c_order', {
        method: 'POST',
        body: JSON.stringify({
          AD_Client_ID:  { id: clientId },
          AD_Org_ID:     { id: orgId },
          C_DocType_ID:  { id: poDocTypeId },
          C_DocTypeTarget_ID: { id: poDocTypeId },
          C_BPartner_ID: { id: parseInt(vendorId) },
          C_BPartner_Location_ID: { id: parseInt(vendorLocationId) },
          M_Warehouse_ID: { id: parseInt(warehouseId) },
          DateOrdered:   orderDateISO,
          DatePromised:  orderDateISO,
          DateAcct:      orderDateISO,
          IsSOTrx:       false,
          PaymentRule:   'P',
          Description:   description,
        }),
      });
      const poId = fkId(poRes.id) ?? poRes.id ?? poRes.C_Order_ID;
      if (!poId) throw new Error('Gagal mendapatkan C_Order_ID (PO).');
      created.poId = poId;

      const poLines = [];
      for (const [i, item] of cart.entries()) {
        pend(emit, 'po', `Menambah baris ${i + 1}/${cart.length}: ${item.Name || '#' + item.M_Product_ID}`);
        const qtyEntered   = parseFloat(item.Qty ?? item.QtyEntered ?? 1);
        const priceEntered = parseFloat(item.PriceEntered ?? item.Price ?? 0);

        const selectedUom  = await resolveLineUom(item);
        const qtyOrdered   = toBaseQty(qtyEntered, selectedUom);
        const priceOrdered = qtyOrdered > 0 ? (priceEntered * qtyEntered) / qtyOrdered : priceEntered;

        const lineRes = await idempiereApi('/models/c_orderline', {
          method: 'POST',
          body: JSON.stringify({
            AD_Org_ID:    { id: orgId },
            C_Order_ID:   { id: poId },
            M_Product_ID: { id: parseInt(item.M_Product_ID) },
            C_UOM_ID:     { id: parseInt(item.C_UOM_ID) },
            QtyEntered:   qtyEntered,
            QtyOrdered:   qtyOrdered,
            PriceActual:  priceOrdered,
            PriceEntered: priceEntered,
          }),
        });
        poLines.push({
          orderLineId: fkId(lineRes.id) ?? lineRes.id,
          productId:   item.M_Product_ID,
          uom:         { C_UOM_ID: item.C_UOM_ID },
          qtyEntered,
          qtyOrdered,
          priceEntered,
          priceOrdered,
        });
      }

      pend(emit, 'po', 'Complete PO...');
      const poDone = await completeDocument('c_order', poId);

      if (!poDone.completed) {
        if (poDone.pending) {
          // IP/WP bisa berarti (a) menunggu approver, atau (b) Complete gagal
          // (mis. field wajib kosong) tanpa ada workflow. Bedakan keduanya.
          const waiting = await hasOpenWorkflow(poId);
          if (waiting === false) {
            throw new Error(
              `PO tidak bisa di-Complete (status: ${poDone.status}) dan tidak ada approval yang menunggu. ` +
              `Cek dokumen langsung di iDempiere — kemungkinan ada field wajib yang belum terisi.`
            );
          }
          if (!allowApprovalWait) {
            throw new Error(
              `PO Cash Purchase masuk approval workflow (status: ${poDone.status}), padahal pembelian tunai ` +
              `harus bypass workflow. Periksa Transition Condition pada workflow Purchase Order ` +
              `(transisi ke node QC Check harus dilewati untuk Cash Purchase). ` +
              `PO ${poDone.documentNo ?? poId} sudah terbentuk dan berstatus ${poDone.status} — ` +
              `Complete/Void manual di iDempiere.`
            );
          }
          emit('po', 'waiting', { id: poId, documentNo: poDone.documentNo, docStatus: poDone.status });
          return {
            pendingApproval: true,
            poId,
            documentNo: poDone.documentNo,
            status: poDone.status,
            vendorName: vendorName || `#${vendorId}`,
            // Simpan ini di caller untuk dipakai saat memanggil resumeFromPO():
            resumeParams: { locatorId, bankAccountId, paymentTenderType },
          };
        }
        throw new Error(`PO gagal Complete (status: ${poDone.status})`);
      }
      emit('po', 'success', { id: poId, documentNo: poDone.documentNo });

      // ── TAHAP 2–5 ───────────────────────────────────────────────────────
      const chain = await runFromReceipt({
        poId, poLines, vendorId, vendorLocationId, warehouseId, locatorId,
        dateISO: orderDateISO, bankAccountId, paymentTenderType, created, setStep,
      });

      return {
        poId,
        ...chain,
        vendorName: vendorName || `#${vendorId}`,
        date: new Date().toLocaleString('id-ID'),
        items: [...cart],
      };
    } catch (err) {
      reportFailure(err, currentStep, created);
      return null;
    } finally {
      setIsSubmitting(false);
      setProgressStep(null);
    }
  }, [poDocTypeId, receiptDocTypeId, invoiceDocTypeId, description, onError, emit,
      resolveLineUom, toBaseQty, runFromReceipt, reportFailure]);

  // ═════════════════════════════════════════════════════════════════════════
  // resumeFromPO — lanjutkan rantai SETELAH PO di-approve.
  // Semua data header diambil dari PO di server; yang harus dikirim caller
  // hanya yang tidak tersimpan di PO: locatorId, bankAccountId, tender type.
  // ═════════════════════════════════════════════════════════════════════════
  const resumeFromPO = useCallback(async (poId, {
    locatorId,
    bankAccountId,
    paymentTenderType = 'K',
  } = {}) => {
    if (!poId) {
      onError?.('ID Purchase Order tidak ada.', 'Data Belum Lengkap');
      return null;
    }
    if (!locatorId) {
      onError?.('Lokasi (Locator) tujuan belum ditentukan.', 'Data Belum Lengkap');
      return null;
    }

    setSteps({});
    setIsSubmitting(true);
    let currentStep = null;
    const setStep = (step) => { currentStep = step; setProgressStep(step); };
    const created = { poId, receiptId: null, invoiceId: null, paymentId: null, invoiceLinesCreated: 0 };

    try {
      setStep('po');
      emit('po', 'pending');

      let po = await idempiereApi(`/models/c_order/${poId}`);
      let status = docStatusOf(po);

      if (status === 'AP') {
        // Sudah di-approve tapi workflow tidak lanjut ke Complete → Complete manual dari sini.
        const done = await completeDocument('c_order', poId);
        if (!done.completed) {
          throw new Error(`PO berstatus AP dan gagal di-Complete (status: ${done.status}). Cek field wajib / pesan error di iDempiere.`);
        }
        po = done.record;
        status = 'CO';
      }

      if (status !== 'CO') {
        // Belum selesai di-approve (atau workflow dibatalkan).
        const waiting = await hasOpenWorkflow(poId);
        if (waiting === false) {
          throw new Error(`PO berstatus ${status} dan tidak ada approval yang menunggu — cek Workflow Process di iDempiere.`);
        }
        emit('po', 'waiting', { id: poId, documentNo: po?.DocumentNo, docStatus: status });
        return { pendingApproval: true, poId, documentNo: po?.DocumentNo, status };
      }
      emit('po', 'success', { id: poId, documentNo: po?.DocumentNo });

      const poLines = await fetchPoLines(poId);
      if (poLines.length === 0) throw new Error('Baris PO tidak ditemukan.');

      const dateISO = String(po?.DateOrdered ?? '').slice(0, 10);
      if (!isDateOnly(dateISO)) throw new Error(`Tanggal PO tidak valid: "${po?.DateOrdered}".`);

      const chain = await runFromReceipt({
        poId,
        poLines,
        vendorId:         idOf(po.C_BPartner_ID),
        vendorLocationId: idOf(po.C_BPartner_Location_ID),
        warehouseId:      idOf(po.M_Warehouse_ID),
        locatorId,
        dateISO,
        bankAccountId,
        paymentTenderType,
        created,
        setStep,
      });

      return {
        poId,
        ...chain,
        vendorName: po?.C_BPartner_ID?.identifier ?? `#${idOf(po.C_BPartner_ID)}`,
        date: new Date().toLocaleString('id-ID'),
      };
    } catch (err) {
      reportFailure(err, currentStep, created);
      return null;
    } finally {
      setIsSubmitting(false);
      setProgressStep(null);
    }
  }, [onError, emit, fetchPoLines, runFromReceipt, reportFailure]);

  return { submit, resumeFromPO, isSubmitting, progressStep, steps };
}