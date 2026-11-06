// 1. External
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// 2. Feature Hooks
import { useRequisitionSubmit } from '@/features/requisition/hooks/useRequisitionSubmit';
import { useOfflineRequisitionSync } from '@/features/requisition/hooks/useOfflineRequisitionSync';

// 3. Feature Component
import { RequisitionSuccessModal } from '@/features/requisition/components';

// 4. Shared Hooks
import { 
  getLoginInfo, 
  getMissingSessionFields, 
  useCart, 
  useProductSearch, 
  useIsDesktop,
  useScannerInput,
  sessionFieldLabel, 
} from '@/shared/hooks'; 

// 5. Shared Components
import { 
  Dialog, 
  CartFab, 
  CartPanel, 
  CartSidebar, 
  ProductDetailSheet, 
  BarcodeScanner, 
  RequisitionIcon,
  ScanIcon, 
  ProductGrid 
} from '@/shared/components';

// 6. Utils
import { idempiereApi, fkId } from '@/api/idempiereApi';
import { resolveDocTypeId, DOC_BASE_TYPE } from '@/utils/docTypeResolver';
import { COLOR, RADIUS } from '@/utils/styleTokens';

// 7. Context
import { useAccess } from '@/context/AccessContext';

// 8. Styles
import '@/css/Header.css';

const REQUISITION_CONFIG = {
  DESCRIPTION:  'Purchase Requisition via REST API',
};

const RequisitionContainer = () => {
  const navigate   = useNavigate();
  const location   = useLocation();
  const isDesktop  = useIsDesktop();
  const searchRef  = useRef(null);
  const [docTypeId, setDocTypeId] = useState(null);
  // ── state ─────────────────────────────────────────────────────────────────
  const [warehouses, setWarehouses]           = useState([]);         // list semua WH
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);   // {id, name}
  const [requesterName, setRequesterName]     = useState('');
  // Description manual — diisi user lewat textarea di CartSidebar/CartPanel,
  // dikirim ke submit() menggantikan REQUISITION_CONFIG.DESCRIPTION yang
  // sebelumnya hardcode. Kosong = fallback ke default di useRequisitionSubmit.
  const [description, setDescription]         = useState('');
  const [cartOpen, setCartOpen]               = useState(false);
  const [scannerOpen, setScannerOpen]         = useState(false);
  const [dialog, setDialog]                   = useState({ isOpen: false, title: '', message: '' });
  const [successData, setSuccessData]         = useState(null);
  const [successOpen, setSuccessOpen]         = useState(false);
  const [detailOpen, setDetailOpen]           = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  const [dateRequired, setDateRequired] = useState(
    () => new Date().toISOString().split('T')[0]
  );
  // ── edit mode state ─────────────────────────────────────────────────────────
  const [editRequisitionId, setEditRequisitionId] = useState(null);
  const [isEditMode, setIsEditMode]               = useState(false);

  // Distabilkan dengan useCallback — sebelumnya function baru dibuat tiap
  // render, ikut jadi salah satu sumber referensi tidak stabil yang dikirim
  // ke useRequisitionSubmit/useOfflineRequisitionSync di bawah.
  const alert = useCallback((message, title = 'Perhatian') =>
    setDialog({ isOpen: true, title, message }), []);

  // ── hooks ─────────────────────────────────────────────────────────────────
  const {
    products, loading: productsLoading, loadingMore, hasMore,
    fetchProducts, loadMore, search, searchValue, setSearchValue,
    searchByUPC,
  } = useProductSearch();

  const { cart, addToCart, removeFromCart, updateQty, updateUom, clearCart, setCart, totalQty, totalItems } = useCart();

  // Options di-memo — sebelumnya object literal baru dibuat tiap render,
  // jadi kalau useRequisitionSubmit punya effect internal yang depend ke
  // object ini utuh (bukan field-nya satu-satu), effect itu ikut jalan
  // tiap render juga.
  const requisitionSubmitOptions = useMemo(() => ({
    docTypeId,
    description: REQUISITION_CONFIG.DESCRIPTION,
    dateRequired,
    onError: alert,
  }), [docTypeId, dateRequired, alert]);

  const { submit, isSubmitting } = useRequisitionSubmit(requisitionSubmitOptions);

  // ── auto-sync antrean Requisition offline ───────────────────────────────
  // Berjalan saat mount (kalau kebetulan online dan ada sisa antrean) dan
  // setiap kali koneksi kembali online. Guard concurrency + persist-reqId-
  // partial ada di dalam hook ini, jadi tidak akan menduplikasi dokumen di
  // server maupun menghapus antrean kalau sync-nya sendiri gagal.
  const handleOfflineSyncComplete = useCallback((successCount, failCount) => {
    if (failCount === 0) {
      alert(`${successCount} requisition offline berhasil disinkronkan ke server.`, 'Sinkronisasi Offline');
    } else {
      alert(
        `${successCount} berhasil disinkronkan, ${failCount} gagal dan akan dicoba lagi otomatis saat online berikutnya.`,
        'Sinkronisasi Offline'
      );
    }
  }, [alert]);

  const offlineSyncOptions = useMemo(() => ({
    submit,
    onSyncComplete: handleOfflineSyncComplete,
  }), [submit, handleOfflineSyncComplete]);

  const { pendingCount, isSyncing } = useOfflineRequisitionSync(offlineSyncOptions);

  const { canEdit } = useAccess();
  const canSubmitRequisition = canEdit('requisition');
  
  // ── init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const info    = getLoginInfo();
        const missing = getMissingSessionFields(info);
        if (missing.length) {
          alert(
            `Data sesi tidak lengkap:\n${missing.map(k => `• ${sessionFieldLabel(k)}`).join('\n')}\n\nSilakan login kembali.`,
            'Sesi Tidak Valid'
          );
          return;
        }
        try {
            const dt = await resolveDocTypeId(DOC_BASE_TYPE.PURCHASE_REQUISITION, { orgId: info.orgId });
              setDocTypeId(dt);
            } catch (err) {
              alert(err.message, 'Document Type Tidak Ditemukan');
            }
        // Fetch daftar warehouse aktif untuk org ini
        const whData = await idempiereApi(
          `/models/m_warehouse?$select=M_Warehouse_ID,Name` +
          `&$filter=IsActive eq true and AD_Org_ID eq ${info.orgId}` +
          `&$orderby=Name&$top=50`
        );
        const whList = (whData.records || []).map(w => ({
          id:   w.id ?? fkId(w.M_Warehouse_ID),   // fallback ke PK flat dulu
          name: w.Name,
        }));
        setWarehouses(whList);

        // Default: warehouse dari session login
        const defaultWh = whList.find(w => String(w.id) === String(info.warehouseId))
          ?? (whList.length > 0 ? whList[0] : null);
        setSelectedWarehouse(defaultWh);

        // Fetch requester name
        try {
          const u = await idempiereApi(`/models/ad_user/${info.userId}?$select=AD_User_ID,Name`);
          setRequesterName(u.Name || info.userName);
        } catch {
          setRequesterName(info.userName);
        }

        // Fetch produk dengan filter warehouse default
        if (defaultWh) {
          await fetchProducts('', defaultWh.id);
        } else {
          await fetchProducts('');
        }
      } catch (err) {
        alert('Gagal inisialisasi: ' + err.message, 'Error');
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── load draft requisition jika datang dari RequisitionList ────────────────
  useEffect(() => {
    if (warehouses.length === 0) return;

    const editRequisition = location.state?.editRequisition;
    if (!editRequisition) return;

    const incomingId = editRequisition.id ?? editRequisition.M_Requisition_ID;
    if (editRequisitionId === incomingId) return;

    const loadDraftRequisition = async () => {
      try {
        const reqId = editRequisition.id ?? editRequisition.M_Requisition_ID;
        setEditRequisitionId(reqId);
        setIsEditMode(true);

        const whId   = fkId(editRequisition.M_Warehouse_ID);
        const whName = editRequisition.M_Warehouse_ID?.identifier
          || editRequisition.M_Warehouse_ID?.Name;
        const matchedWh = warehouses.find(w => String(w.id) === String(whId));
        const resolvedWh = matchedWh ?? (whId ? { id: whId, name: whName || `Gudang #${whId}` } : null);
        if (resolvedWh) setSelectedWarehouse(resolvedWh);

        // Fetch header requisition (khususnya Description) — editRequisition
        // yang dikirim dari RequisitionList.jsx belum tentu menyertakan
        // Description lengkap, jadi diambil ulang langsung dari server.
        try {
          const headerRes = await idempiereApi(
            `/models/m_requisition/${reqId}?$select=Description,DateRequired`
          );
          setDescription(headerRes.Description || '');
          setDateRequired(
            headerRes.DateRequired
              ? headerRes.DateRequired.split('T')[0]
              : new Date().toISOString().split('T')[0]
          );
        } catch (err) {
          console.error('[RequisitionContainer] gagal ambil Description draft:', err);
          setDescription('');
        }

        // Fetch requisition lines
        const linesRes = await idempiereApi(
          `/models/m_requisitionline?$filter=M_Requisition_ID eq ${reqId}` +
          `&$select=M_RequisitionLine_ID,M_Product_ID,Qty,C_UOM_ID,C_BPartner_ID`
        );
        const lines = Array.isArray(linesRes.records) ? linesRes.records : [];

        const cartItems = lines.map((line) => {
          const productId   = fkId(line.M_Product_ID);
          const productName = line.M_Product_ID?.identifier || line.M_Product_ID?.Name || `Product #${productId}`;
          const uomId        = fkId(line.C_UOM_ID);
          const uomName      = line.C_UOM_ID?.identifier || line.C_UOM_ID?.Name || 'EA';
          const qty          = parseFloat(line.Qty || 1);
          const vendorId     = fkId(line.C_BPartner_ID);
          const vendorName   = line.C_BPartner_ID?.identifier || line.C_BPartner_ID?.Name || null;
          const lineId       = line.id ?? line.M_RequisitionLine_ID;

          const selectedUom = { C_UOM_ID: uomId, Name: uomName, multiplyRate: 1 };

          return {
            M_RequisitionLine_ID: lineId,
            M_Product_ID:         productId,
            Name:                 productName,
            Value:                '',
            VendorId:             vendorId,
            VendorName:           vendorName,
            Qty:                  qty,
            C_UOM_ID:             uomId,
            C_UOM_Name:           uomName,
            uomOptions:           [selectedUom],
            selectedUom,
          };
        });

        setCart(cartItems);
      } catch (err) {
        alert('Gagal memuat draft requisition: ' + err.message, 'Error');
      }
    };

    loadDraftRequisition();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouses, location.state]);

  // ── batal edit ───────────────────────────────────────────────────────────
  const cancelEditMode = useCallback(() => {
    setIsEditMode(false);
    setEditRequisitionId(null);
    setDescription('');
    setDateRequired(new Date().toISOString().split('T')[0]);
    clearCart();
    navigate('/requisition', { replace: true, state: {} });
  }, [clearCart, navigate]);

  // ── warehouse change ──────────────────────────────────────────────────────
  const handleWarehouseChange = useCallback((e) => {
    const id   = Number(e.target.value);
    const found = warehouses.find(w => w.id === id) ?? null;
    setSelectedWarehouse(found);
    fetchProducts(searchValue, found?.id ?? null);
  }, [warehouses, fetchProducts, searchValue]);

  // ── product detail ────────────────────────────────────────────────────────
  const openProductDetail = useCallback((product) => {
    setSelectedProduct(product);
    setDetailOpen(true);
  }, []);

  const closeProductDetail = useCallback(() => {
    setDetailOpen(false);
    setSelectedProduct(null);
  }, []);

  const handleConfirmAddToCart = useCallback((product, qty, uom) => {
    addToCart(product, qty, uom);
    closeProductDetail();
  }, [addToCart, closeProductDetail]);

    // ── input search: lokal, terpisah dari trigger request ──
 
// ── 1. handler-handler-nya di-useCallback duluan supaya referensinya stabil ──
// (sebelumnya inline arrow function baru tiap render, jadi object options
// di bawah juga baru tiap render -> effect internal useScannerInput yang
// depend ke options ini ikut jalan tiap render -> potensi infinite loop
// kalau effect itu setState).
const handleScanDetected = useCallback(
  (code) => handleBarcodeDetectedRef.current(code), // panggil lewat ref, ref-nya sendiri stabil
  []
);
const handleManualSearch = useCallback(
  (value) => search(value, selectedWarehouse?.id ?? null),
  [search, selectedWarehouse]
);
const scannerInputOptions = useMemo(() => ({
  onScanDetected: handleScanDetected,
  onManualSearch: handleManualSearch,
}), [handleScanDetected, handleManualSearch]);

// ── 2. Panggil useScannerInput dengan options yang sudah stabil ──
const {
  value: searchInput,
  inputRef: scanInputRef,
  handleChange: handleSearchInputChange,
  handleKeyDown: handleSearchKeyDown,
  reset: resetSearchInput,
} = useScannerInput(scannerInputOptions);

// ── 3. handleBarcodeDetected didefinisikan seperti biasa, tanpa peduli urutan ──
const handleBarcodeDetected = useCallback(async (code) => {
  setScannerOpen(false);
  const trimmed = code.trim();
  if (!trimmed) return;

  const whId = selectedWarehouse?.id ?? null;

  let found = await searchByUPC(trimmed);
  if (!found) {
    found = products.find(p => p.Value?.toUpperCase() === trimmed.toUpperCase()) ?? null;
  }

  if (found) {
    addToCart(found, 1, { C_UOM_ID: found.C_UOM_ID, Name: found.C_UOM_Name, multiplyRate: 1 });
    resetSearchInput();
    fetchProducts('', whId);
    scanInputRef.current?.focus();
  } else {
    fetchProducts(trimmed, whId);
  }
}, [products, addToCart, fetchProducts, searchByUPC, selectedWarehouse, resetSearchInput]);

// ── 4. Ref jembatan, selalu sinkron ke versi terbaru ──
const handleBarcodeDetectedRef = useRef(handleBarcodeDetected);
useEffect(() => {
  handleBarcodeDetectedRef.current = handleBarcodeDetected;
}, [handleBarcodeDetected]);

// ── submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (mode = 'complete') => {
    const result = await submit(
      cart, requesterName, selectedWarehouse?.id,
      editRequisitionId, description, dateRequired, mode
    );
    // submit() sekarang selalu mengembalikan object dengan flag `success`
    // (bukan null saat gagal), jadi cek eksplisit di sini — sebelumnya
    // `if (result)` akan selalu true dan modal sukses tetap tampil walau
    // gagal, karena hasil errornya pun berupa object truthy.
    if (result?.success) {
      setSuccessData({ ...result, warehouseName: selectedWarehouse?.name });
      clearCart();
      setCartOpen(false);
      setSuccessOpen(true);
      setIsEditMode(false);
      setEditRequisitionId(null);
      setDescription('');
      setDateRequired(new Date().toISOString().split('T')[0]);
      navigate('/requisition', { replace: true, state: {} });
    }
    // result.success === false: dialog error sudah ditampilkan oleh
    // onError di dalam useRequisitionSubmit, tidak perlu ditangani lagi di sini.
  };
  
  const cartSummaryRight = `📦 ${selectedWarehouse?.name || '...'}${pendingCount > 0 ? ` · ⏳ ${pendingCount} offline` : ''}`;

  useEffect(() => {
    const t = setTimeout(() => scanInputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);
  
  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      flex: 1, minHeight: 0, background: COLOR.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
      display: 'flex', flexDirection: 'column', position: 'relative',
      overflow: 'hidden',
    }}>

      <Dialog
        isOpen={dialog.isOpen} title={dialog.title} message={dialog.message}
        onClose={() => setDialog({ isOpen: false, title: '', message: '' })}
      />

      <ProductDetailSheet
        isOpen={detailOpen}
        product={selectedProduct}
        onClose={closeProductDetail}
        onConfirm={handleConfirmAddToCart}
        confirmLabel="Tambah ke Keranjang"
      />

      <RequisitionSuccessModal
        isOpen={successOpen}
        data={successData}
        onClose={() => {
          setSuccessOpen(false);
          setSuccessData(null);
          fetchProducts('', selectedWarehouse?.id ?? null);
          resetSearchInput();
          setTimeout(() => scanInputRef.current?.focus(), 150);
        }}
      />

      <BarcodeScanner
        isOpen={scannerOpen}
        onDetected={handleBarcodeDetected}
        onClose={() => setScannerOpen(false)}
      />

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div className='header-content'>
       
        <span style={{ 
          color: '#374151', 
          fontWeight: 700, 
          fontSize: '15px', 
          flex: 1,
          display: 'inline-flex', 
          alignItems: 'center',   
          gap: '6px'              
        }}>
          <RequisitionIcon />
          <span>Requisition</span>
          {isSyncing && (
            <span style={{ fontSize: '11px', fontWeight: 500, color: '#374151' }}>
              (menyinkronkan offline...)
            </span>
          )}
        </span>
        {/* ── Date Required + Warehouse ─────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

        {/* Date Required */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: '3px',
          padding: '3px 10px 3px 12px',
          height: '25px',
        }}>
          <span style={{
            fontSize: '10px',
            fontWeight: 600,
            color: '#374151',
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
            whiteSpace: 'nowrap',
          }}>
            Date :
          </span>
          <input
            type="date"
            value={dateRequired}
            onChange={(e) => setDateRequired(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '2px 0',
              fontSize: '11px',
              fontWeight: 500,
              color: '#374151',
              outline: 'none',
              colorScheme: 'light',
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Warehouse */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: '3px',
          padding: '3px 10px 3px 12px',
          height: '25px',
        }}>
          <span style={{
            fontSize: '10px',
            fontWeight: 600,
            color: '#374151',
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
            whiteSpace: 'nowrap',
          }}>
            Warehouse:
          </span>
          <select
            value={selectedWarehouse?.id ?? ''}
            onChange={handleWarehouseChange}
            disabled={warehouses.length <= 1}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '2px 0',
              fontSize: '11px',
              fontWeight: 500,
              color: '#374151',
              cursor: warehouses.length <= 1 ? 'default' : 'pointer',
              outline: 'none',
              maxWidth: isDesktop ? '160px' : '110px',
              colorScheme: 'dark',
            }}
          >
            {warehouses.length === 0 && (
              <option value="" style={{ background: '#1e3a5f', color: '#e0eaff' }}>
                Memuat...
              </option>
            )}
            {warehouses.map((wh, idx) => (
              <option
                key={wh.id || `wh-null-${idx}`}
                value={wh.id ?? ''}
                style={{ background: '#1e3a5f', color: '#e0eaff' }}
              >
                🏭 {wh.name}
              </option>
            ))}
          </select>
        </div>

        </div>
      </div>

      {/* ── Banner Edit Mode ─────────────────────────────────────────────── */}
      {isEditMode && (
        <div style={{
          backgroundColor: '#fff3e0', borderBottom: '1px solid #f57c00',
          padding: '8px 16px', fontSize: '13px', flexShrink: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: '8px',
        }}>
          <span>✏️ <strong>Mode Edit</strong> — Requisition Draft ID: {editRequisitionId}</span>
          <button
            onClick={cancelEditMode}
            style={{
              background: 'none', border: '1px solid #f57c00', color: '#f57c00',
              borderRadius: '4px', padding: '3px 10px', cursor: 'pointer', fontSize: '12px',
            }}
          >
            Batalkan Edit
          </button>
        </div>
      )}

      {/* ── Banner Antrean Offline ───────────────────────────────────────── */}
      {pendingCount > 0 && (
        <div style={{
          backgroundColor: '#e3f2fd', borderBottom: '1px solid #1976d2',
          padding: '6px 16px', fontSize: '12px', flexShrink: 0,
          color: '#0d47a1',
        }}>
          ⏳ {pendingCount} requisition menunggu sinkronisasi
          {isSyncing ? ' — sedang mengirim...' : ' (akan dikirim otomatis saat online).'}
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Kolom kiri: search + grid produk */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Search bar */}
          <div style={{
            padding: '10px 50px 10px 30px', background: COLOR.surface,
            borderBottom: `1px solid ${COLOR.border}`,
            display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0,
          }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{
                position: 'absolute', left: '10px', top: '50%',
                transform: 'translateY(-50%)', fontSize: '15px', pointerEvents: 'none',
              }}>🔍</span>
              <input
                ref={scanInputRef}
                type="text"
                value={searchInput}
                onChange={handleSearchInputChange}
                onKeyDown={handleSearchKeyDown}
                placeholder="Cari nama / kode produk..."
                  style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 12px 10px 34px',
                  border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.md,
                  fontSize: '14px', color: COLOR.textDk, background: COLOR.bg, outline: 'none',
                }}
              />
              {searchValue && (
                <button
                  onClick={() => {
                    resetSearchInput();
                    fetchProducts('', selectedWarehouse?.id ?? null);
                  }}
                  style={{
                    position: 'absolute', right: '8px', top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: COLOR.textLt, fontSize: '16px', padding: '2px',
                  }}
                >✕</button>
              )}
            </div>

            <button
              onClick={() => setScannerOpen(true)}
              title="Scan QR / Barcode"
              style={{
                background: COLOR.primary, border: 'none', color: '#fff',
                borderRadius: RADIUS.md, padding: '10px 14px', cursor: 'pointer',
                fontSize: '20px', lineHeight: 1, flexShrink: 0,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
            <ScanIcon />
            </button>
          </div>

          {/* Product Grid */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '12px 14px',
            paddingBottom: (!isDesktop && cart.length > 0) ? '80px' : '14px',
          }}>
            <ProductGrid
              products={products}
              loading={productsLoading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              fetchMore={loadMore}
              onProductClick={openProductDetail}
              isDesktop={isDesktop}
              selectedWarehouse={selectedWarehouse}
            />

          </div>
        </div>

        {/* Kolom kanan: cart sidebar — HANYA di desktop */}
        {isDesktop && (
          <CartSidebar
            cart={cart}
            onRemove={removeFromCart}
            onQtyChange={updateQty}
            onUomChange={updateUom}
            onClearCart={canSubmitRequisition ? clearCart : undefined}
            totalItems={totalItems}
            totalQty={totalQty}
            summaryRight={cartSummaryRight}
            title={isEditMode ? '📝 Edit Permintaan' : '📝 Daftar Permintaan'}
            submitLabel={isEditMode ? '💾 SIMPAN PERUBAHAN' : '📤 KIRIM FPB'}
            onSubmitDraft={canSubmitRequisition ? () => handleSubmit('draft') : undefined}
            onSubmitComplete={canSubmitRequisition ? () => handleSubmit('complete') : undefined}
            isSubmitting={isSubmitting}
            description={description}
            onDescriptionChange={canSubmitRequisition ? setDescription : undefined}
          />
        )}
      </div>

      {/* Mobile: FAB + bottom sheet cart */}
      {!isDesktop && cart.length > 0 && !cartOpen && (
        <CartFab count={totalItems} label={isEditMode ? 'Edit Permintaan' : 'Daftar Permintaan'} onClick={() => setCartOpen(true)} />
      )}

      {!isDesktop && (
        <CartPanel
          isOpen={cartOpen}
          onClose={() => setCartOpen(false)}
          cart={cart}
          onRemove={removeFromCart}
          onQtyChange={updateQty}
          onUomChange={updateUom}
          onClearCart={canSubmitRequisition ? clearCart : undefined}
          totalItems={totalItems}
          totalQty={totalQty}
          summaryRight={cartSummaryRight}
          title={isEditMode ? '📝 Edit Permintaan' : '📝 Daftar Permintaan'}
          submitLabel={isEditMode ? '💾 SIMPAN PERUBAHAN' : '📤 KIRIM FPB'}
          onSubmitDraft={canSubmitRequisition ? () => handleSubmit('draft') : undefined}
          onSubmitComplete={canSubmitRequisition ? () => handleSubmit('complete') : undefined}
          isSubmitting={isSubmitting}
          description={description}
          onDescriptionChange={canSubmitRequisition ? setDescription : undefined}
        />
      )}

      {!canSubmitRequisition && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#fef3c7', color: '#92400e', fontSize: '12px',
          padding: '8px 14px', textAlign: 'center', zIndex: 150,
        }}>
          ⚠ Role Anda hanya memiliki akses lihat (read-only) untuk Requisition.
        </div>
      )}
    </div>
  );
};

export default RequisitionContainer;