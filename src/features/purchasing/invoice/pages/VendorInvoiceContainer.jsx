import React, { useState, useEffect, useRef, useCallback } from 'react';

import { 
  Dialog, 
  CartFab 
} from '@/shared/components';

import { 
  useIsDesktop, 
  getLoginInfo, 
  getMissingSessionFields,
  useInfiniteScroll 
} from '@/shared/hooks';

import { 
  POCard, 
  POLineDetailSheet,
  POCartSidebar, 
  POCartPanel 
} from '@/features/purchasing/shared/components';

import { 
  InvoiceSubmitModal, 
  VendorInvoiceSuccessModal 
} from '@/features/purchasing/invoice/components';

import { 
  useInvoiceSubmit, 
  usePOInvoiceLines, 
  usePaymentAllocationSubmit, 
  useInvoiceCart, 
  useBankAccounts 
} from '@/features/purchasing/invoice/hooks';

import { COLOR, RADIUS } from '@/utils/styleTokens';
import { resolveDocTypeId, DOC_BASE_TYPE } from '@/utils/docTypeResolver';
import { ShoppingCartIcon } from '@/shared/components/icon';
import { useAccess } from '@/context/AccessContext';
import { todayLocalISO, formatDateID } from '@/utils/dateOnly';
import '@/css/Header.css';

const INVOICE_CONFIG = { DESCRIPTION: 'Purchase Invoice via Web' };

const VendorInvoiceContainer = () => {
  const isDesktop = useIsDesktop();
  const [cartOpen, setCartOpen] = useState(false);
  const [dialog, setDialog] = useState({ isOpen: false, title: '', message: '' });
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [successData, setSuccessData] = useState(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [poReference, setPoReference] = useState('');
  const [invoiceDocTypeId, setInvoiceDocTypeId] = useState(null);
  const [paymentDocTypeId, setPaymentDocTypeId] = useState(null);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState(null);
  const [dateInvoiced, setDateInvoiced] = useState(todayLocalISO);
  
  const searchRef = useRef(null);
  const alert = (message, title = 'Perhatian') => setDialog({ isOpen: true, title, message });

  
  const { cart, addItems, removeItem, updateQty, updatePrice, clearCart, totalItems, totalAmount, vendorGroups } = useInvoiceCart();
  const { bankAccounts } = useBankAccounts();
  const { canEdit } = useAccess();
  const canSubmitInvoice = canEdit('purchasing'); // ⚠️ SESUAIKAN kalau ada access key khusus Invoice

  const { submit: submitInvoice, isSubmitting: invoiceSubmitting } = useInvoiceSubmit({
    invoiceDocTypeId, defaultDescription: INVOICE_CONFIG.DESCRIPTION, onError: alert,
  });
  const { submit: submitPaymentAllocation, isSubmitting: paymentSubmitting } = usePaymentAllocationSubmit({
    paymentDocTypeId, description: 'Pelunasan Invoice', onError: alert,
  });
  
  const {
    pos, loading: posLoading, fetchPOs,
    search, searchValue,
    hasMore, loadingMore, fetchNextPage,
  } = usePOInvoiceLines();
  
  const [showFullyInvoiced, setShowFullyInvoiced] = useState(false);
  const outstandingPOs = pos.filter(po => !po.isFullyInvoiced);
  const visiblePOs = showFullyInvoiced ? pos : outstandingPOs;
  const hiddenCount = pos.length - outstandingPOs.length;
  
  const sentinelRef = useInfiniteScroll({
    fetchMore: fetchNextPage,
    hasMore,
    loading: loadingMore,
  });
  
  useEffect(() => {
    const init = async () => {
      try {
        const info = getLoginInfo();
        const missing = getMissingSessionFields(info);
        if (missing.length) {
          alert(`Data sesi tidak lengkap:\n${missing.map(k => `• ${k}`).join('\n')}\n\nSilakan login kembali.`, 'Sesi Tidak Valid');
          return;
        }
        try {
          const [invDt, payDt] = await Promise.all([
            resolveDocTypeId(DOC_BASE_TYPE.AP_INVOICE, { orgId: info.orgId }),
            resolveDocTypeId(DOC_BASE_TYPE.AP_PAYMENT, { orgId: info.orgId }),
          ]);
          setInvoiceDocTypeId(invDt);
          setPaymentDocTypeId(payDt);
        } catch (err) {
          alert(err.message, 'Document Type Tidak Ditemukan');
        }
        await fetchPOs('');
      } catch (err) {
        alert('Gagal inisialisasi: ' + err.message, 'Error');
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPODetail  = useCallback((po) => { setSelectedPO(po); setDetailOpen(true); }, []);
  const closePODetail = useCallback(() => { setDetailOpen(false); setSelectedPO(null); }, []);
  const handleAddLines  = useCallback((chosenLines) => addItems(chosenLines), [addItems]);
  const handleClearCart = useCallback(() => { clearCart(); setDescription(''); setDateInvoiced(todayLocalISO()); }, [clearCart]);

  const handleModalDraft = async () => {
    setSubmitModalOpen(false);
    const { results, hadError } = await submitInvoice(cart, { description, poReference, dateInvoiced, submitMode: 'draft' });
    if (!results) return;
    setSuccessData(results);
    setSuccessOpen(true);
    if (!hadError) { clearCart(); setDescription(''); setDateInvoiced(todayLocalISO()); fetchPOs(searchValue); }
  };

  const handleModalComplete = async () => {
    setSubmitModalOpen(false);
    const { results, hadError } = await submitInvoice(cart, { description, poReference, dateInvoiced, submitMode: 'complete' });
    if (!results) return;
    setSuccessData(results);
    setSuccessOpen(true);
    if (!hadError) { clearCart(); setDescription(''); setDateInvoiced(todayLocalISO()); fetchPOs(searchValue); }
  };

  // Complete invoice DULU, baru payment+allocation per vendor
  // (1 Invoice per vendor → 1 Payment per vendor juga).
  const handleModalBayar = async () => {
    if (!selectedBankAccountId) {
      alert('Pilih rekening bank untuk pembayaran.', 'Data Belum Lengkap');
      return;
    }
    if (dateInvoiced > todayLocalISO()) {
      alert(
        'Tanggal invoice tidak boleh di masa depan untuk opsi Bayar (pembayaran dilakukan saat itu juga).\n' +
        'Ubah tanggal ke hari ini atau sebelumnya, atau pakai Draft/Complete.',
        'Tanggal Tidak Valid'
      );
      return;
    }
    setSubmitModalOpen(false);
    const { results, hadError } = await submitInvoice(cart, { description, poReference, dateInvoiced, submitMode: 'complete' });
    if (!results) return;
    if (hadError) { setSuccessData(results); setSuccessOpen(true); return; }

    const paymentResults = [];
    for (const inv of results) {
      const pay = await submitPaymentAllocation(
        [{ invoiceId: inv.invoiceId, grandTotal: inv.grandTotal }],
        { vendorId: inv.vendorId, bankAccountId: selectedBankAccountId, dateTrx: dateInvoiced }
      );
      if (pay) paymentResults.push({ ...inv, paymentDocNo: pay.documentNo });
    }

    setSuccessData(paymentResults.length > 0 ? paymentResults : results);
    setSuccessOpen(true);
    clearCart();
    setDescription('');
    setSelectedBankAccountId(null);
    setDateInvoiced(todayLocalISO());
    fetchPOs(searchValue);
  };

  // Tanggal selain hari ini sengaja ditampilkan di ringkasan cart supaya tidak terlewat sebelum submit.
  const isNotToday = dateInvoiced !== todayLocalISO();
  const cartSummaryRight =
    `🧾 ${totalItems} baris` +
    (isNotToday && dateInvoiced ? ` · 📅 ${formatDateID(dateInvoiced)}` : '');

  return (
    <div style={{ flex: 1, minHeight: 0, background: COLOR.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <Dialog isOpen={dialog.isOpen} title={dialog.title} message={dialog.message} onClose={() => setDialog({ isOpen: false, title: '', message: '' })} />

      <POLineDetailSheet isOpen={detailOpen} po={selectedPO} onClose={closePODetail} onConfirm={handleAddLines} />

      <InvoiceSubmitModal
        isOpen={submitModalOpen} onClose={() => setSubmitModalOpen(false)}
        onDraft={handleModalDraft} onComplete={handleModalComplete} onBayar={handleModalBayar}
        bankAccounts={bankAccounts} selectedBankAccountId={selectedBankAccountId} onBankAccountChange={setSelectedBankAccountId}
        isSubmitting={invoiceSubmitting || paymentSubmitting} totalAmount={totalAmount}
      />

      <VendorInvoiceSuccessModal isOpen={successOpen} data={successData} onClose={() => { setSuccessOpen(false); setSuccessData(null); }} />

      <div className='header-content'>
        <span style={{ 
          color: '#0f0101', 
          fontWeight: 700, 
          fontSize: '15px', 
          flex: 1, 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '6px' }}>
          <ShoppingCartIcon /><span>Purchase Invoice</span>
        </span>

        <input
          type="date"
          value={dateInvoiced}
          onChange={e => setDateInvoiced(e.target.value)}
          onBlur={e => { if (!e.target.value) setDateInvoiced(todayLocalISO()); }}
          disabled={!canSubmitInvoice}
          title="Tanggal invoice — pada opsi Bayar juga dipakai sebagai tanggal pembayaran"
          style={{
            background: isNotToday ? 'rgba(247, 20, 20, 0.3)' : 'rgba(255,255,255,0.18)',
            border: `1px solid ${isNotToday ? '#fbbf24' : 'rgba(255,255,255,0.3)'}`,
            borderRadius: '3px',
            padding: '3px 10px',
            fontSize: '11px',
            color: '#020711',
            cursor: canSubmitInvoice ? 'pointer' : 'default',
            outline: 'none',
            maxWidth: isDesktop ? '150px' : '125px',
            colorScheme: 'light',
          }}
        />
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          <div style={{ padding: '12px 14px', background: COLOR.surface, borderBottom: `1px solid ${COLOR.border}`, display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '15px', pointerEvents: 'none' }}>🔍</span>
              <input
                ref={searchRef} type="text" value={searchValue}
                onChange={e => search(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fetchPOs(searchValue.trim()); } }}
                placeholder="Cari No. PO / nama vendor..."
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 34px', border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.md, fontSize: '14px', color: COLOR.textDk, background: COLOR.bg, outline: 'none' }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', paddingBottom: (!isDesktop && cart.length > 0) ? '80px' : '14px' }}>
            {posLoading ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: COLOR.textLt }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>⏳</div><p style={{ margin: 0 }}>Memuat PO...</p>
              </div>
            ) : pos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: COLOR.textLt }}>
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>🧾</div><p style={{ margin: 0 }}>Tidak ada PO Complete ditemukan.</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: COLOR.textMd, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={showFullyInvoiced}
                      onChange={e => setShowFullyInvoiced(e.target.checked)}
                    />
                    Tampilkan semua ({hiddenCount > 0 ? `${hiddenCount} PO lunas disembunyikan` : 'tidak ada yang disembunyikan'})
                  </label>
                </div>

                {visiblePOs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>
                    {showFullyInvoiced ? 'Tidak ada PO ditemukan.' : 'Tidak ada PO dengan sisa tagihan.'}
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(auto-fill, minmax(200px, 1fr))' : 'repeat(2, 1fr)', gap: '10px' }}>
                      {visiblePOs.map(po => <POCard key={po.C_Order_ID} po={po} onClick={openPODetail} />)}
                    </div>

                    {/* sentinel: elemen tak terlihat di ujung list, observer memantau ini */}
                    {hasMore && (
                      <div ref={sentinelRef} style={{ height: '1px' }} />
                    )}

                    {loadingMore && (
                      <div style={{ textAlign: 'center', padding: '16px 0', color: COLOR.textLt, fontSize: '13px' }}>
                        ⏳ Memuat PO lainnya...
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {isDesktop && (
          <POCartSidebar
            isOpen={cartOpen} onClose={() => setCartOpen(false)} title="🧾 Daftar Tagihan (Invoice)"
            vendorGroups={vendorGroups} onRemove={removeItem} onQtyChange={updateQty} onPriceChange={updatePrice}
            onClearCart={canSubmitInvoice ? handleClearCart : undefined}
            totalItems={totalItems} totalAmount={totalAmount} summaryRight={cartSummaryRight}
            onSubmit={canSubmitInvoice ? () => setSubmitModalOpen(true) : undefined}
            isSubmitting={invoiceSubmitting || paymentSubmitting}
            description={description} onDescriptionChange={canSubmitInvoice ? setDescription : undefined}
            descriptionPlaceholder={INVOICE_CONFIG.DESCRIPTION}
            poReference={poReference}
            onPoReferenceChange={setPoReference}
          />
        )}
      </div>

      {!isDesktop && totalItems > 0 && !cartOpen && (
        <CartFab count={totalItems} label="Daftar Tagihan" icon="🧾" onClick={() => setCartOpen(true)} />
      )}

      {!isDesktop && (
        <POCartPanel
          isOpen={cartOpen} onClose={() => setCartOpen(false)} title="🧾 Daftar Tagihan (Invoice)"
          vendorGroups={vendorGroups} onRemove={removeItem} onQtyChange={updateQty} onPriceChange={updatePrice}
          onClearCart={canSubmitInvoice ? handleClearCart : undefined}
          totalItems={totalItems} totalAmount={totalAmount} summaryRight={cartSummaryRight}
          onSubmit={canSubmitInvoice ? () => setSubmitModalOpen(true) : undefined}
          isSubmitting={invoiceSubmitting || paymentSubmitting}
          description={description} onDescriptionChange={canSubmitInvoice ? setDescription : undefined}
          descriptionPlaceholder={INVOICE_CONFIG.DESCRIPTION}
          poReference={poReference}
          onPoReferenceChange={setPoReference}
        />
      )}

      {!canSubmitInvoice && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fef3c7', color: '#92400e', fontSize: '12px', padding: '8px 14px', textAlign: 'center', zIndex: 150 }}>
          ⚠ Role Anda hanya memiliki akses lihat (read-only) untuk Purchase Invoice.
        </div>
      )}
    </div>
  );
};

export default VendorInvoiceContainer;