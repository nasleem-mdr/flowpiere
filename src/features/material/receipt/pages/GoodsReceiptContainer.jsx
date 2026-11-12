/** ─────────────────────────────────────────────────────────────────────────────
* GoodsReceiptContainer.jsx (REVISI 2 — grid berisi PO)
*
* Konsep baru (mengikuti VendorInvoiceContainer):
*   1. Grid utama = daftar PO Complete yang barangnya BELUM diterima penuh
*      (usePOReceiptLines), BUKAN lagi grid produk.
*   2. TIDAK ada entry manual / pilih produk dari grid. Satu-satunya cara
*      mengisi Daftar Penerimaan (cart) adalah klik PO → lihat sisa → tambah.
*   3. Tombol import di sebelah search dihapus (grid-nya sendiri sudah daftar PO).
*   4. Search memfilter PO (No. PO / nama vendor), bukan produk.
*   5. Vendor selalu berasal dari PO; terkunci selama cart berisi item.
*      PO milik vendor lain di-dim & ditolak sampai cart dikosongkan.
*   6. Tombol Scan tetap ada tapi sekarang untuk scan QR/barcode No. PO →
*      mengisi kolom search & memuat ulang daftar PO.
* ─────────────────────────────────────────────────────────────────────────────
*/

import React, { useState, useEffect, useRef, useCallback } from 'react';

import { GoodsReceiptSuccessModal } from '@/features/material/receipt/components';
import POReceiptCard from '@/features/material/receipt/components/POReceiptCard';
import POReceiptDetailModal from '@/features/material/receipt/components/POReceiptDetailModal';
import { useGoodsReceiptSubmit } from '@/features/material/receipt/hooks/useGoodsReceiptSubmit';
import { usePOReceiptLines } from '@/features/material/receipt/hooks/usePOReceiptLines';

import {
  Dialog,
  CartFab,
  CartPanel,
  CartSidebar,
  BarcodeScanner,
  DeliveryIcon,
  ScanIcon,
} from '@/shared/components';

import {
  useCart,
  useIsDesktop,
  useInfiniteScroll,
  getLoginInfo,
  getMissingSessionFields,
  sessionFieldLabel,
} from '@/shared/hooks';

import { useAccess } from '@/context/AccessContext';

import { idempiereApi, fkId } from '@/api/idempiereApi';

import {
  resolveDocTypeId,
  DOC_BASE_TYPE, IS_SO_TRX,
  COLOR, RADIUS
} from '@/utils';

import {
  todayLocalISO,
  formatDateID,
} from '@/utils/dateOnly';

import '@/css/Header.css';


const GOODS_RECEIPT_DESCRIPTION = 'Goods Receipt';

const GoodsReceiptContainer = () => {
  const isDesktop  = useIsDesktop();

  const [warehouseInfo, setWarehouseInfo] = useState(null);
  const [defaultLocatorId, setDefaultLocatorId] = useState(null);
  const [docTypeId, setDocTypeId] = useState(null);

  // Vendor SELALU berasal dari PO yang ditambahkan ke cart.
  // { C_BPartner_ID, Name, locationId }
  const [selectedVendor, setSelectedVendor] = useState(null);

  const [cartOpen, setCartOpen]       = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [dialog, setDialog]           = useState({ isOpen: false, title: '', message: '' });
  const [successData, setSuccessData] = useState(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [detailOpen, setDetailOpen]   = useState(false);
  const [selectedPO, setSelectedPO]   = useState(null);
  const [movementDate, setMovementDate] = useState(todayLocalISO);
  const searchRef = useRef(null);

  const alert = (message, title = 'Perhatian') => setDialog({ isOpen: true, title, message });

  const {
    pos, loading: posLoading, fetchPOs,
    search, searchValue, setSearchValue,
    hasMore, loadingMore, fetchNextPage,
  } = usePOReceiptLines();

  const { cart, setCart, removeFromCart, updateQty, updateUom, clearCart, totalQty, totalItems } = useCart();
  const { submit, isSubmitting } = useGoodsReceiptSubmit({
    docTypeId,
    description: GOODS_RECEIPT_DESCRIPTION,
    onError:     alert,
  });
  const { canEdit } = useAccess();
  const canSubmitReceipt = canEdit('goodsReceipt');

  const sentinelRef = useInfiniteScroll({
    fetchMore: fetchNextPage,
    hasMore,
    loading: loadingMore,
  });

  // Vendor terkunci selama cart berisi item — header M_InOut hanya boleh
  // 1 vendor, sesuai line yang sudah ter-link C_OrderLine_ID.
  const vendorLocked = cart.length > 0;

  // Cart dikosongkan (mis. hapus item satu per satu) → lepas kunci vendor.
  useEffect(() => {
    if (cart.length === 0) setSelectedVendor(null);
  }, [cart.length]);

  useEffect(() => {
    const init = async () => {
      try {
        const info = getLoginInfo();
        const missing = getMissingSessionFields(info);
        if (missing.length) {
          alert(
            `Data sesi tidak lengkap:\n${missing.map(k => `• ${sessionFieldLabel(k)}`).join('\n')}\n\nSilakan login kembali.`,
            'Sesi Tidak Valid'
          );
          return;
        }

        try {
          const wh = await idempiereApi(`/models/m_warehouse/${info.warehouseId}?$select=M_Warehouse_ID,Name`);
          setWarehouseInfo({ id: info.warehouseId, name: wh.Name || `WH #${info.warehouseId}` });
        } catch {
          setWarehouseInfo({ id: info.warehouseId, name: `WH #${info.warehouseId}` });
        }

        // Resolve C_DocType_ID dinamis berdasarkan DocBaseType 'MMR' (Material Receipt).
        try {
          const dt = await resolveDocTypeId(DOC_BASE_TYPE.MATERIAL_RECEIPT, { orgId: info.orgId, isSOTrx: IS_SO_TRX.PURCHASE });
          setDocTypeId(dt);
        } catch (err) {
          alert(err.message, 'Document Type Tidak Ditemukan');
        }

        // Locator default gudang ini — fallback ke locator aktif pertama.
        try {
          const defRes = await idempiereApi(
            `/models/m_locator?$select=M_Locator_ID&$filter=M_Warehouse_ID eq ${info.warehouseId} and IsDefault eq true and IsActive eq true&$top=1`
          );
          const defRecords = Array.isArray(defRes.records) ? defRes.records : [];
          if (defRecords.length > 0) {
            setDefaultLocatorId(fkId(defRecords[0].M_Locator_ID) ?? defRecords[0].id);
          } else {
            const anyRes = await idempiereApi(
              `/models/m_locator?$select=M_Locator_ID&$filter=M_Warehouse_ID eq ${info.warehouseId} and IsActive eq true&$top=1`
            );
            const anyRecords = Array.isArray(anyRes.records) ? anyRes.records : [];
            setDefaultLocatorId(anyRecords[0] ? (fkId(anyRecords[0].M_Locator_ID) ?? anyRecords[0].id) : null);
          }
        } catch {
          setDefaultLocatorId(null);
        }

        // Daftar PO difilter ke gudang sesi (disimpan di hook untuk muat berikutnya).
        await fetchPOs('', info.warehouseId);
      } catch (err) {
        alert('Gagal inisialisasi: ' + err.message, 'Error');
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Klik PO di grid ─────────────────────────────────────────────────────
  const openPODetail = useCallback((po) => {
    if (selectedVendor && String(selectedVendor.C_BPartner_ID) !== String(po.C_BPartner_ID)) {
      alert(
        `Daftar Penerimaan berisi barang dari vendor "${selectedVendor.Name}".\n` +
        `PO ${po.DocumentNo} milik vendor "${po.VendorName}".\n\n` +
        `Satu dokumen penerimaan hanya boleh 1 vendor. Selesaikan atau kosongkan daftar dulu.`,
        'Vendor Berbeda'
      );
      return;
    }
    setSelectedPO(po);
    setDetailOpen(true);
  }, [selectedVendor]);

  const closePODetail = useCallback(() => {
    setDetailOpen(false);
    setSelectedPO(null);
  }, []);

  // ── Konfirmasi sisa PO → masuk cart ─────────────────────────────────────
  // Baris dengan sourceOrderLineId yang sama DIGANTI (bukan dijumlah), supaya
  // membuka PO yang sama dua kali tidak menggandakan qty melebihi sisa.
  const handleConfirmPO = useCallback((cartItems, order) => {
    const incoming = new Set(cartItems.map(i => String(i.sourceOrderLineId)));
    setCart(prev => [
      ...prev.filter(i => !incoming.has(String(i.sourceOrderLineId))),
      ...cartItems,
    ]);
    setSelectedVendor({
      C_BPartner_ID: order.C_BPartner_ID,
      Name:          order.VendorName,
      locationId:    order.C_BPartner_Location_ID,
    });
    closePODetail();
  }, [setCart, closePODetail]);

  // ── Scan QR/barcode: dianggap No. PO → cari di daftar PO ────────────────
  const handleBarcodeDetected = useCallback((code) => {
    setScannerOpen(false);
    setSearchValue(code);
    fetchPOs(code.trim());
  }, [setSearchValue, fetchPOs]);

  // Kosongkan cart + lepas vendor supaya bisa mulai sesi penerimaan baru.
  const handleResetVendor = useCallback(() => {
    setSelectedVendor(null);
    clearCart();
  }, [clearCart]);

  const handleSubmit = async (submitMode = 'complete') => {
    if (!docTypeId) {
      alert('Document Type belum siap (gagal di-resolve). Cek konfigurasi Document Type "MMR" di iDempiere, lalu muat ulang halaman.', 'Error');
      return;
    }
    if (!selectedVendor) {
      alert('Vendor belum ditentukan. Pilih PO dari daftar terlebih dahulu.', 'Vendor Belum Dipilih');
      return;
    }
    if (!movementDate) {
      alert('Tanggal penerimaan belum diisi.', 'Data Belum Lengkap');
      return;
    }
    const result = await submit(cart, {
      warehouseId:      warehouseInfo?.id,
      locatorId:        defaultLocatorId,
      vendorId:         selectedVendor.C_BPartner_ID,
      vendorLocationId: selectedVendor.locationId,
      vendorName:       selectedVendor.Name,
      movementDate,
      submitMode,
    });
    if (result) {
      setSuccessData(result);
      handleResetVendor();
      setMovementDate(todayLocalISO());
      setCartOpen(false);
      setSuccessOpen(true);
      // Sisa PO berubah (Complete → QtyDelivered naik, Draft → reserved naik).
      fetchPOs(searchValue.trim());
    }
  };

  const handleSubmitDraft    = () => handleSubmit('draft');
  const handleSubmitComplete = () => handleSubmit('complete');

  const isNotToday = movementDate !== todayLocalISO();
  const cartSummaryRight =
    `📦 ${warehouseInfo?.name || '...'}` +
    (isNotToday && movementDate ? ` · 📅 ${formatDateID(movementDate)}` : '');

  const isCardDisabled = (po) =>
    !!selectedVendor && String(selectedVendor.C_BPartner_ID) !== String(po.C_BPartner_ID);

  return (
    <div style={styles.container}>
      {/* Modals & Dialogs */}
      <Dialog
        isOpen={dialog.isOpen} title={dialog.title} message={dialog.message}
        onClose={() => setDialog({ isOpen: false, title: '', message: '' })}
      />

      <POReceiptDetailModal
        isOpen={detailOpen}
        order={selectedPO}
        onClose={closePODetail}
        onConfirm={handleConfirmPO}
      />

      <GoodsReceiptSuccessModal
        isOpen={successOpen}
        data={successData}
        onClose={() => {
          setSuccessOpen(false);
          setSuccessData(null);
          setTimeout(() => searchRef.current?.focus(), 150);
        }}
      />

      <BarcodeScanner
        isOpen={scannerOpen}
        onDetected={handleBarcodeDetected}
        onClose={() => setScannerOpen(false)}
      />

      {/* Top Bar */}
      <div className='header-content'>
        <span style={styles.headerTitle}>
          <DeliveryIcon />
          <span>Material Receipt</span>
        </span>

        {/* Vendor strip — read-only, selalu dari PO */}
        <div style={styles.vendorStrip}>
          <span>🚚</span>

          {vendorLocked && selectedVendor ? (
            <>
              <div style={{ fontSize: '12px' }}>
                Vendor (dari PO): <strong style={{ color: COLOR.textDk }}>{selectedVendor.Name}</strong>
                <span style={{ marginLeft: '6px', color: COLOR.success }}>🔒</span>
              </div>
              <button
                onClick={handleResetVendor}
                title="Kosongkan daftar penerimaan & ganti vendor/PO"
                style={styles.btnReset}
              >✕ Reset & Ganti PO</button>
            </>
          ) : (
            <span style={{ color: COLOR.textLt, fontSize: '11px' }}>
              Pilih PO dari daftar — vendor terisi otomatis
            </span>
          )}

          {/* Warehouse Badge */}
          <div style={styles.badgeWrapper}>
            <span style={styles.badgeLabel}>Warehouse:</span>
            <span style={styles.badgeContent}>🏭 {warehouseInfo?.name || '...'}</span>
          </div>

          {/* Movement Date Picker */}
          <div style={styles.badgeWrapper}>
            <input
              type="date"
              value={movementDate}
              onChange={e => setMovementDate(e.target.value)}
              onBlur={e => { if (!e.target.value) setMovementDate(todayLocalISO()); }}
              disabled={!canSubmitReceipt}
              title="Tanggal penerimaan barang (MovementDate)"
              style={{
                background: isNotToday ? 'rgba(196, 11, 51, 0.98)' : 'transparent',
                border: `0px solid ${isNotToday ? '#fbbf24' : 'rgba(255,255,255,0.3)'}`,
                padding: '3px 10px',
                fontSize: '11px',
                color: '#010611',
                cursor: canSubmitReceipt ? 'pointer' : 'default',
                outline: 'none',
                maxWidth: isDesktop ? '150px' : '125px',
                colorScheme: 'light',
              }}
            />
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div style={styles.mainBody}>
        <div style={styles.leftColumn}>

          {/* Search bar (filter PO) + Scan */}
          <div style={styles.searchBarContainer}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={styles.searchIcon}>🔍</span>
              <input
                ref={searchRef}
                type="text"
                value={searchValue}
                onChange={e => search(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fetchPOs(searchValue.trim()); } }}
                placeholder="Cari No. PO / nama vendor..."
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 34px',
                  border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.md,
                  fontSize: '14px', color: COLOR.textDk, background: COLOR.bg, outline: 'none',
                }}
              />
              {searchValue && (
                <button onClick={() => { setSearchValue(''); fetchPOs(''); }} style={styles.btnClearSearch}>
                  ✕
                </button>
              )}
            </div>

            {/* Scan Button — scan No. PO */}
            <button
              onClick={() => setScannerOpen(true)}
              title="Scan QR / Barcode No. PO"
              style={{ ...styles.iconButton(COLOR.primary), fontSize: '20px' }}
            >
              <ScanIcon />
            </button>
          </div>

          {/* PO Grid */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '12px 14px',
            paddingBottom: (!isDesktop && cart.length > 0) ? '80px' : '14px',
          }}>
            {posLoading ? (
              <div style={styles.emptyState}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>⏳</div>
                <p style={{ margin: 0 }}>Memuat PO...</p>
              </div>
            ) : pos.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>📭</div>
                <p style={{ margin: 0 }}>
                  {searchValue.trim()
                    ? 'Tidak ada PO yang belum diterima untuk pencarian ini.'
                    : 'Tidak ada PO yang menunggu penerimaan.'}
                </p>
              </div>
            ) : (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isDesktop ? 'repeat(auto-fill, minmax(220px, 1fr))' : 'repeat(2, 1fr)',
                  gap: '10px',
                }}>
                  {pos.map(po => (
                    <POReceiptCard
                      key={po.C_Order_ID}
                      po={po}
                      onClick={openPODetail}
                      disabled={isCardDisabled(po)}
                    />
                  ))}
                </div>

                {/* sentinel infinite scroll */}
                {hasMore && <div ref={sentinelRef} style={{ height: '1px' }} />}

                {loadingMore && (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: COLOR.textLt, fontSize: '13px' }}>
                    ⏳ Memuat PO lainnya...
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Kolom kanan: Cart Sidebar (Desktop) */}
        {isDesktop && (
          <CartSidebar
            cart={cart}
            onRemove={removeFromCart}
            onQtyChange={updateQty}
            onUomChange={updateUom}
            onClearCart={canSubmitReceipt ? handleResetVendor : undefined}
            totalItems={totalItems}
            totalQty={totalQty}
            summaryRight={cartSummaryRight}
            title="📦 Daftar Penerimaan"
            submitLabel="✅ TERIMA BARANG"
            onSubmitDraft={canSubmitReceipt ? handleSubmitDraft : undefined}
            onSubmitComplete={canSubmitReceipt ? handleSubmitComplete : undefined}
            isSubmitting={isSubmitting}
          />
        )}
      </div>

      {/* Mobile Cart FAB & Sheet */}
      {!isDesktop && cart.length > 0 && !cartOpen && (
        <CartFab count={totalItems} label="Daftar Penerimaan" onClick={() => setCartOpen(true)} />
      )}

      {!isDesktop && (
        <CartPanel
          isOpen={cartOpen}
          onClose={() => setCartOpen(false)}
          cart={cart}
          onRemove={removeFromCart}
          onQtyChange={updateQty}
          onUomChange={updateUom}
          onClearCart={canSubmitReceipt ? handleResetVendor : undefined}
          totalItems={totalItems}
          totalQty={totalQty}
          summaryRight={cartSummaryRight}
          title="📦 Daftar Penerimaan"
          submitLabel="✅ TERIMA BARANG"
          onSubmitDraft={canSubmitReceipt ? handleSubmitDraft : undefined}
          onSubmitComplete={canSubmitReceipt ? handleSubmitComplete : undefined}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Read-Only Banner */}
      {!canSubmitReceipt && (
        <div style={styles.readOnlyBanner}>
          ⚠ Role Anda hanya memiliki akses lihat (read-only) untuk Goods Receipt.
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    flex: 1, minHeight: 0, background: COLOR.bg,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
    display: 'flex', flexDirection: 'column', position: 'relative',
    overflow: 'hidden',
  },
  headerTitle: {
    color: '#374151',
    fontWeight: 700,
    fontSize: '15px',
    flex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  vendorStrip: {
    background: '#f4f6fb',
    padding: '8px 16px',
    fontSize: '12px',
    color: COLOR.textMd,
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap',
    flexShrink: 0,
    position: 'relative',
  },
  btnReset: {
    background: 'none', border: 'none', color: COLOR.danger,
    fontSize: '11px', cursor: 'pointer', fontWeight: 600, padding: 0,
  },
  badgeWrapper: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    background: 'rgba(255,255,255,0.18)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '3px',
    padding: '2px 8px 2px 10px',
  },
  badgeLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    whiteSpace: 'nowrap',
  },
  badgeContent: {
    background: 'transparent',
    padding: '3px 10px', fontSize: '11px', color: '#000b22', whiteSpace: 'nowrap',
  },
  mainBody: { flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 },
  leftColumn: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  searchBarContainer: {
    padding: '12px 14px', background: COLOR.surface, borderBottom: `1px solid ${COLOR.border}`,
    display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0,
  },
  searchIcon: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '15px', pointerEvents: 'none' },
  btnClearSearch: {
    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textLt,
    fontSize: '16px', padding: '2px',
  },
  iconButton: (bg) => ({
    background: bg, border: 'none', color: '#fff',
    borderRadius: RADIUS.md, padding: '10px 14px', cursor: 'pointer',
    lineHeight: 1, flexShrink: 0, WebkitTapHighlightColor: 'transparent',
  }),
  emptyState: { textAlign: 'center', padding: '48px 0', color: COLOR.textLt },
  readOnlyBanner: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    background: '#fef3c7', color: '#92400e', fontSize: '12px',
    padding: '8px 14px', textAlign: 'center', zIndex: 150,
  },
};

export default GoodsReceiptContainer;