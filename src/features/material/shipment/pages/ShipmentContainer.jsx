/** ─────────────────────────────────────────────────────────────────────────────
* ShipmentContainer.jsx
* Material Shipment (Customer), DocBaseType MMS, IsSOTrx = true.
*
* VERSI SO-ONLY: grid utama = daftar Sales Order (SalesOrderPicker), bukan
* grid produk/jasa bebas. Setiap item di cart otomatis membawa C_OrderLine_ID,
* jadi tidak ada lagi peringatan "isi Order Line".
*
*   1. Pilih SO → pilih baris (qty maks = sisa kirim) → masuk Daftar Pengiriman.
*   2. Customer & alamat kirim otomatis dari header SO, DIKUNCI selama cart
*      berisi item (1 dokumen M_InOut = 1 customer). Daftar SO ikut difilter
*      ke customer tsb. Kosongkan cart / "Reset" untuk ganti customer.
*   3. Pengiriman di luar SO (sample / pinjam-pakai) TIDAK didukung di form ini.
*   4. Complete akan mengurangi stok locator — kalau stok kurang, dokumen
*      tetap tersimpan sebagai Draft (lihat useShipmentSubmit).
* ─────────────────────────────────────────────────────────────────────────────
*/

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import SalesOrderPicker from '@/features/material/shipment/components/SalesOrderPicker';
import ShipmentSuccessModal from '@/features/material/shipment/components/ShipmentSuccessModal';
import { useShipmentSubmit } from '@/features/material/shipment/hooks/useShipmentSubmit';
import {
  Dialog,
  CartFab,
  CartPanel,
  CartSidebar,
  DeliveryIcon,
} from '@/shared/components';

import {
  useCart,
  useIsDesktop,
  getLoginInfo,
  getMissingSessionFields,
  sessionFieldLabel,
} from '@/shared/hooks';

import { useAccess } from '@/context/AccessContext';

import { idempiereApi, fkId } from '@/api/idempiereApi';

import {
  resolveDocTypeId,
  DOC_BASE_TYPE, IS_SO_TRX,
  COLOR,
} from '@/utils';

import {
  todayLocalISO,
  formatDateID,
} from '@/utils/dateOnly';

import '@/css/Header.css';

const SHIPMENT_DESCRIPTION = 'Material Shipment';

const ShipmentContainer = () => {
  const isDesktop = useIsDesktop();

  const [warehouseInfo, setWarehouseInfo]       = useState(null);
  const [defaultLocatorId, setDefaultLocatorId] = useState(null);
  const [docTypeId, setDocTypeId]               = useState(null);

  // Customer penerima — SELALU berasal dari header SO yang dipilih.
  const [selectedCustomer, setSelectedCustomer] = useState(null); // { C_BPartner_ID, Name, locationId }

  const [cartOpen, setCartOpen]       = useState(false);
  const [dialog, setDialog]           = useState({ isOpen: false, title: '', message: '' });
  const [successData, setSuccessData] = useState(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [movementDate, setMovementDate] = useState(todayLocalISO);
  const [pickerRefresh, setPickerRefresh] = useState(0); // naik setelah submit → picker muat ulang

  const alert = (message, title = 'Perhatian') => setDialog({ isOpen: true, title, message });

  const { cart, setCart, removeFromCart, updateQty, updateUom, clearCart, totalQty, totalItems } = useCart();
  const { submit, isSubmitting } = useShipmentSubmit({
    docTypeId,
    description: SHIPMENT_DESCRIPTION,
    onError:     alert,
  });
  const { canEdit } = useAccess();
  const canSubmitShipment = canEdit('shipment');

  // Semua item cart berasal dari SO → customer terkunci selama cart tidak kosong.
  const customerLocked = cart.length > 0;
  const cartLineIds = useMemo(
    () => new Set(cart.map(i => i.sourceOrderLineId).filter(Boolean)),
    [cart]
  );

  // Cart dikosongkan (hapus manual satu per satu, Clear, atau setelah submit)
  // → lepas kunci customer supaya SO customer lain bisa dipilih.
  useEffect(() => {
    if (cart.length === 0) setSelectedCustomer(null);
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

        // Resolve C_DocType_ID dinamis: DocBaseType 'MMS' (Material Delivery /
        // Shipment) + IsSOTrx = true. BUKAN hardcode.
        try {
          const dt = await resolveDocTypeId(DOC_BASE_TYPE.MATERIAL_SHIPMENT, { orgId: info.orgId, isSOTrx: IS_SO_TRX.SALES });
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
      } catch (err) {
        alert('Gagal inisialisasi: ' + err.message, 'Error');
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tambah baris SO ke Daftar Pengiriman ────────────────────────────────
  // Customer otomatis diisi dari header SO. Picker sudah memfilter SO ke
  // customer yang sama saat cart berisi item; pengecekan di sini = sabuk pengaman.
  const handleAddFromSO = useCallback((cartItems, order) => {
    if (!order.C_BPartner_Location_ID) {
      alert(`SO ${order.DocumentNo} tidak memiliki alamat kirim (C_BPartner_Location).\nLengkapi dulu di Sales Order.`, 'Tidak Bisa Ditambahkan');
      return;
    }
    if (selectedCustomer && selectedCustomer.C_BPartner_ID !== order.C_BPartner_ID) {
      alert(`Daftar pengiriman sudah berisi item untuk ${selectedCustomer.Name}.\nSatu dokumen Shipment hanya untuk satu customer.`, 'Customer Berbeda');
      return;
    }

    setCart(prev => {
      const existing = new Set(prev.map(i => i.sourceOrderLineId));
      return [...prev, ...cartItems.filter(i => !existing.has(i.sourceOrderLineId))];
    });
    setSelectedCustomer({
      C_BPartner_ID: order.C_BPartner_ID,
      Name:          order.CustomerName,
      locationId:    order.C_BPartner_Location_ID,
    });
  }, [setCart, selectedCustomer]);

  // Kosongkan cart + lepas customer.
  const handleReset = useCallback(() => {
    clearCart();
    setSelectedCustomer(null);
  }, [clearCart]);

  const handleSubmit = async (submitMode = 'complete') => {
    if (!docTypeId) {
      alert('Document Type belum siap (gagal di-resolve). Cek konfigurasi Document Type "MMS" (Material Delivery) di iDempiere, lalu muat ulang halaman.', 'Error');
      return;
    }
    if (!selectedCustomer) {
      alert('Pilih Sales Order dan tambahkan barang yang akan dikirim terlebih dahulu.', 'Daftar Pengiriman Kosong');
      return;
    }
    if (!movementDate) {
      alert('Tanggal pengiriman belum diisi.', 'Data Belum Lengkap');
      return;
    }
    const result = await submit(cart, {
      warehouseId:        warehouseInfo?.id,
      locatorId:          defaultLocatorId,
      customerId:         selectedCustomer.C_BPartner_ID,
      customerLocationId: selectedCustomer.locationId,
      customerName:       selectedCustomer.Name,
      movementDate,
      submitMode,
    });
    if (result) {
      setSuccessData(result);
      handleReset();
      setMovementDate(todayLocalISO());
      setCartOpen(false);
      setSuccessOpen(true);
    }
  };

  const handleSubmitDraft    = () => handleSubmit('draft');
  const handleSubmitComplete = () => handleSubmit('complete');

  const isNotToday = movementDate !== todayLocalISO();
  const cartSummaryRight =
    `📦 ${warehouseInfo?.name || '...'}` +
    (isNotToday && movementDate ? ` · 📅 ${formatDateID(movementDate)}` : '');

  return (
    <div style={styles.container}>
      {/* Modals & Dialogs */}
      <Dialog
        isOpen={dialog.isOpen} title={dialog.title} message={dialog.message}
        onClose={() => setDialog({ isOpen: false, title: '', message: '' })}
      />

      <ShipmentSuccessModal
        isOpen={successOpen}
        data={successData}
        onClose={() => {
          setSuccessOpen(false);
          setSuccessData(null);
          setPickerRefresh(n => n + 1); // sisa kirim SO sudah berubah → muat ulang
        }}
      />

      {/* Top Bar */}
      <div className='header-content'>
        <span style={styles.headerTitle}>
          <DeliveryIcon />
          <span>Material Shipment</span>
        </span>

        {/* Customer strip */}
        <div style={styles.customerStrip}>
          <span>🧑‍💼</span>

          {customerLocked && selectedCustomer ? (
            <>
              <div style={{ fontSize: '12px' }}>
                Customer (dari SO): <strong style={{ color: COLOR.textDk }}>{selectedCustomer.Name}</strong>
                <span style={{ marginLeft: '6px', color: COLOR.success }}>🔒</span>
              </div>
              {canSubmitShipment && (
                <button
                  onClick={handleReset}
                  title="Kosongkan daftar pengiriman & ganti customer"
                  style={styles.btnReset}
                >✕ Kosongkan & Ganti Customer</button>
              )}
            </>
          ) : (
            <span style={{ color: COLOR.textLt, fontSize: '11px' }}>
              Pilih Sales Order di bawah — customer terisi otomatis
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
              disabled={!canSubmitShipment}
              title="Tanggal pengiriman barang (MovementDate)"
              style={{
                background: isNotToday ? 'rgba(196, 11, 51, 0.98)' : 'transparent',
                border: `0px solid ${isNotToday ? '#fbbf24' : 'rgba(255,255,255,0.3)'}`,
                padding: '3px 10px',
                fontSize: '11px',
                color: '#010611',
                cursor: canSubmitShipment ? 'pointer' : 'default',
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
          <div style={{
            flex: 1, overflowY: 'auto', padding: '12px 14px',
            paddingBottom: (!isDesktop && cart.length > 0) ? '80px' : '14px',
          }}>
            <SalesOrderPicker
              warehouseId={warehouseInfo?.id}
              customerId={selectedCustomer?.C_BPartner_ID}
              customerName={selectedCustomer?.Name}
              cartLineIds={cartLineIds}
              refreshKey={pickerRefresh}
              onAddLines={handleAddFromSO}
            />
          </div>
        </div>

        {/* Kolom kanan: Cart Sidebar (Desktop) */}
        {isDesktop && (
          <CartSidebar
            cart={cart}
            onRemove={removeFromCart}
            onQtyChange={updateQty}
            onUomChange={updateUom}
            onClearCart={canSubmitShipment ? handleReset : undefined}
            totalItems={totalItems}
            totalQty={totalQty}
            summaryRight={cartSummaryRight}
            title="🚚 Daftar Pengiriman"
            submitLabel="✅ KIRIM BARANG"
            onSubmitDraft={canSubmitShipment ? handleSubmitDraft : undefined}
            onSubmitComplete={canSubmitShipment ? handleSubmitComplete : undefined}
            isSubmitting={isSubmitting}
          />
        )}
      </div>

      {/* Mobile Cart FAB & Sheet */}
      {!isDesktop && cart.length > 0 && !cartOpen && (
        <CartFab count={totalItems} label="Daftar Pengiriman" onClick={() => setCartOpen(true)} />
      )}

      {!isDesktop && (
        <CartPanel
          isOpen={cartOpen}
          onClose={() => setCartOpen(false)}
          cart={cart}
          onRemove={removeFromCart}
          onQtyChange={updateQty}
          onUomChange={updateUom}
          onClearCart={canSubmitShipment ? handleReset : undefined}
          totalItems={totalItems}
          totalQty={totalQty}
          summaryRight={cartSummaryRight}
          title="🚚 Daftar Pengiriman"
          submitLabel="✅ KIRIM BARANG"
          onSubmitDraft={canSubmitShipment ? handleSubmitDraft : undefined}
          onSubmitComplete={canSubmitShipment ? handleSubmitComplete : undefined}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Read-Only Banner */}
      {!canSubmitShipment && (
        <div style={styles.readOnlyBanner}>
          ⚠ Role Anda hanya memiliki akses lihat (read-only) untuk Shipment.
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
  customerStrip: {
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
  readOnlyBanner: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    background: '#fef3c7', color: '#92400e', fontSize: '12px',
    padding: '8px 14px', textAlign: 'center', zIndex: 150,
  }
};

export default ShipmentContainer;