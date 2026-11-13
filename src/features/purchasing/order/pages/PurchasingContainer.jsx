import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import {
  Dialog, 
  CartFab, 
  ProductCard, 
  ProductDetailSheet, 
  BarcodeScanner,
  ImportIcon, 
  ShoppingCartIcon,
  ScanIcon,
}from '@/shared/components';
import { useAttachments } from '@/shared/hooks/useAttachments';
import AttachmentModal from '@/shared/components/AttachmentModal';

import { 
  useIsDesktop, 
  useBankAccounts, 
  useUomConversion, 
  getLoginInfo, 
  getMissingSessionFields,
  sessionFieldLabel,
} from '@/shared/hooks';

import { 
  VendorPickerModal, 
  RequisitionToPOImportModal, 
  PurchaseOrderSuccessModal, 
  PurchaseSubmitModal,
  CashPurchaseProgressModal, 
} from '@/features/purchasing/order/components';

import { 
  POCartSidebar, 
  POCartPanel 
} from '@/features/purchasing/shared/components';
import { 
  useCashPurchaseSubmit, 
  usePurchaseOrderSubmit,
  usePurchaseDocTypes, 
} from '@/features/purchasing/order/hooks';

import { 
  useProductSearch, 
  usePOCart, 
  lineKey, 
  useProductVendorInfo 
} from '@/shared/hooks';

//import usePurchaseDocTypes from '@/features/purchasing/order/hooks/usePurchaseDocTypes';

import { useAccess } from '@/context/AccessContext';
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { idempiereApi, fkId } from '@/api/idempiereApi';

import { 
  resolveDocTypeId, 
  DOC_BASE_TYPE, 
  IS_SO_TRX, 
  CASH_PO_DOCTYPE_NAME 
} from '@/utils/docTypeResolver';
import { 
  todayLocalISO, 
  toDateOnly, 
  formatDateID 
} from '@/utils/dateOnly';

import '@/css/Header.css';


// ⚠️ WAJIB DISESUAIKAN: ganti dengan C_DocType_ID Document Type "Purchase
// Order" di instance Anda.
// Cek lewat: GET /api/v1/models/c_doctype?$select=C_DocType_ID,Name,DocBaseType&$filter=contains(Name,'Purchase Order')
const PURCHASING_CONFIG = {
  DESCRIPTION:  'Purchase Order via Web',
};


const PurchasingContainer = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const isDesktop = useIsDesktop();

  const [warehouseInfo, setWarehouseInfo] = useState(null);
  const [warehouses, setWarehouses] = useState([]); 

  const [cartOpen, setCartOpen]       = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [importOpen, setImportOpen]   = useState(false);
  const [dialog, setDialog]           = useState({ isOpen: false, title: '', message: '' });
  const [successData, setSuccessData] = useState(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [pendingSuccessOpen, setPendingSuccessOpen] = useState(false);
  const [detailOpen, setDetailOpen]   = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [defaultLocatorId, setDefaultLocatorId] = useState(null);
  const [description, setDescription]         = useState('');
  const [poDocTypeId, setPoDocTypeId]           = useState(null);
  // Document Type PO yang dipilih user (mis. per departemen → document sequence berbeda).
  // poDocTypeId (hasil resolver) jadi default awal / fallback kalau daftar tidak termuat.
  const {
    docTypes: poDocTypes, loading: poDocTypesLoading,
    selectedId: docTypeId, select: selectDocType,
  } = usePurchaseDocTypes({ fallbackId: poDocTypeId });
  const [editDocTypeName, setEditDocTypeName] = useState(null);   // tampilan saja saat mode edit
  const [cashPoDocTypeId, setCashPoDocTypeId] = useState(null); 

  const [receiptDocTypeId, setReceiptDocTypeId] = useState(null);
  const [invoiceDocTypeId, setInvoiceDocTypeId] = useState(null);
  const [paymentDocTypeId, setPaymentDocTypeId] = useState(null);
  const [vendorPickerTarget, setVendorPickerTarget] = useState(null);
  const [editOrderId, setEditOrderId]         = useState(null);
  const [editOrderDocNo, setEditOrderDocNo]   = useState(null);
  const [editOrderStatus, setEditOrderStatus] = useState(null);
  const [loadingEditOrder, setLoadingEditOrder] = useState(false);
  // Tanggal pemesanan — dasar tanggal PO; di Cash Purchase juga dasar Receipt, Invoice & AP Payment.
  const [dateOrdered, setDateOrdered] = useState(todayLocalISO);
  const [attachOpen, setAttachOpen] = useState(false);
  const att = useAttachments('c_order', editOrderId);
  const attachCount = att.staged.length + att.existing.length;
  const searchRef = useRef(null);
  const alert = (message, title = 'Perhatian') => setDialog({ isOpen: true, title, message });

  const { products, loading: productsLoading, fetchProducts, search, searchValue, setSearchValue } = useProductSearch();
  const {
    cart, addItem, addItems, removeItem, updateQty, updatePrice, updateUom, updateVendor,
    clearCart, totalItems, totalAmount, vendorGroups,
  } = usePOCart();
  const { fetchDefaultVendor } = useProductVendorInfo();
  const { toBaseQty } = useUomConversion();
  const { submit, isSubmitting } = usePurchaseOrderSubmit({
    docTypeId,
    defaultDescription: PURCHASING_CONFIG.DESCRIPTION,
    onError:     alert,
  });
  const { canEdit } = useAccess();
  const canSubmitPO = canEdit('purchasing');
  const { bankAccounts } = useBankAccounts();
  const [selectedBankAccountId, setSelectedBankAccountId] = useState(null);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submitModalMode, setSubmitModalMode] = useState('normal'); 
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [progressSteps, setProgressSteps] = useState({});
  const [progressDone, setProgressDone] = useState(false);
  
//   const { submit: submitCashPurchase, isSubmitting: cashPurchaseSubmitting } = useCashPurchaseSubmit({
//     poDocTypeId: cashPoDocTypeId,          // ← bukan poDocTypeId
//     receiptDocTypeId, invoiceDocTypeId, paymentDocTypeId,
//     description: 'Cash Purchase',
//     onError: alert,
//     onStepUpdate: (stepKey, status, meta) => { /* tetap */ },
// });
const { submit: submitCashPurchase, isSubmitting: cashPurchaseSubmitting, steps: cashSteps } =
  useCashPurchaseSubmit({
    poDocTypeId: cashPoDocTypeId,
    receiptDocTypeId, invoiceDocTypeId, paymentDocTypeId,
    description: 'Cash Purchase',
    onError: alert,
    onStepUpdate: (stepKey, status) => {
      if (status === 'error') setProgressDone(true);
    },
  });
  const handleModalDraft = () => {
      setSubmitModalOpen(false);
      handleSubmit('draft');   // fungsi submit draft yang sudah ada sebelumnya
  };

const handleModalComplete = () => {
    setSubmitModalOpen(false);
    handleSubmit('complete'); // fungsi submit complete yang sudah ada sebelumnya
};

const handleModalCashPurchase = async () => {
    if (vendorGroups.length > 1) {
        alert('Cash Purchase hanya mendukung 1 vendor per transaksi.\nPisahkan item vendor lain ke Draft/Complete biasa.', 'Tidak Didukung');
        return;
    }
    const singleVendorGroup = vendorGroups[0];
    if (!singleVendorGroup) {
        alert('Keranjang masih kosong.');
        return;
    }
    if (!singleVendorGroup.C_BPartner_ID) {
        alert('Item di cart belum memiliki vendor. Pilih vendor dulu (badge 🚚) sebelum Cash Purchase.', 'Vendor Belum Dipilih');
        return;
    }

    // ⬅️ TAMBAHKAN fallback — sama pola seperti usePurchaseOrderSubmit
    let vendorLocationId = singleVendorGroup.C_BPartner_Location_ID;
    if (!vendorLocationId) {
        try {
            const locRes = await idempiereApi(
                `/models/c_bpartner_location?$select=C_BPartner_Location_ID&$filter=C_BPartner_ID eq ${singleVendorGroup.C_BPartner_ID} and IsActive eq true&$top=1`
            );
            const locRecords = Array.isArray(locRes.records) ? locRes.records : [];
            vendorLocationId = locRecords[0] ? (fkId(locRecords[0].C_BPartner_Location_ID) ?? locRecords[0].id) : null;
        } catch (err) {
            console.error('Gagal fetch lokasi vendor:', err.message);
        }
    }
    if (!vendorLocationId) {
        alert(`Vendor "${singleVendorGroup.VendorName}" tidak memiliki alamat aktif (C_BPartner_Location).\nTambahkan alamat vendor terlebih dahulu di Business Partner.`, 'Data Tidak Lengkap');
        return;
    }

    setSubmitModalOpen(false);
    setProgressSteps({});
    setProgressDone(false);
    setProgressModalOpen(true);

    const result = await submitCashPurchase(singleVendorGroup.items, {
        warehouseId:      warehouseInfo?.id,
        locatorId:        defaultLocatorId,
        vendorId:         singleVendorGroup.C_BPartner_ID,
        vendorLocationId, // ⬅️ sekarang sudah pasti terisi (fetched atau dari cart)
        vendorName:       singleVendorGroup.VendorName,
        bankAccountId:    selectedBankAccountId,
        dateOrdered,      // ⬅️ dasar tanggal PO, Receipt, Invoice & Payment
    });

    setProgressDone(true);
    if (result) {
        clearCart();
        setSelectedBankAccountId(null);
        setDateOrdered(todayLocalISO());
        fetchProducts(searchValue.trim()); 
    }
};
const openNormalSubmitModal = () => {
    setSubmitModalMode('normal');
    setSubmitModalOpen(true);
};
 
const openCashSubmitModal = () => {
    if (vendorGroups.length > 1) {
        alert('Cash Purchase hanya mendukung 1 vendor per transaksi.\nPisahkan item vendor lain ke Draft/Complete biasa.', 'Tidak Didukung');
        return;
    }
    setSubmitModalMode('cash');
    setSubmitModalOpen(true);
};
  
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
          const [poDt, receiptDt, invoiceDt, paymentDt] = await Promise.all([
            resolveDocTypeId(DOC_BASE_TYPE.PURCHASE_ORDER, {
              orgId: info.orgId,
              isSOTrx: IS_SO_TRX.PURCHASE,
              excludeName: CASH_PO_DOCTYPE_NAME,   // PO biasa tidak boleh ikut DocType tunai
            }),
            resolveDocTypeId(DOC_BASE_TYPE.MATERIAL_RECEIPT, { orgId: info.orgId }),
            resolveDocTypeId(DOC_BASE_TYPE.AP_INVOICE,       { orgId: info.orgId }),
            resolveDocTypeId(DOC_BASE_TYPE.AP_PAYMENT,       { orgId: info.orgId }),
          ]);
          setPoDocTypeId(poDt);
          setReceiptDocTypeId(receiptDt);
          setInvoiceDocTypeId(invoiceDt);
          setPaymentDocTypeId(paymentDt);
        } catch (err) {
          alert(err.message, 'Document Type Tidak Ditemukan');
        }
        
        try {
          const cashDt = await resolveDocTypeId(DOC_BASE_TYPE.PURCHASE_ORDER, {
            orgId: info.orgId,
            isSOTrx: IS_SO_TRX.PURCHASE,
            name: CASH_PO_DOCTYPE_NAME,
          });
          setCashPoDocTypeId(cashDt);
        } catch (err) {
          console.warn('[Purchasing] DocType Cash Purchase tidak ditemukan:', err.message);
          setCashPoDocTypeId(null);
        }

      let resolvedWarehouseId = info.warehouseId;
      try {
        const whData = await idempiereApi(
          `/models/m_warehouse?$select=M_Warehouse_ID,Name` +
          `&$filter=IsActive eq true and AD_Org_ID eq ${info.orgId}` +
          `&$orderby=Name&$top=50`
        );
        const whList = (whData.records || []).map(w => ({
          id:   w.id ?? fkId(w.M_Warehouse_ID),
          name: w.Name,
        }));
        setWarehouses(whList);

        const defaultWh = whList.find(w => String(w.id) === String(info.warehouseId))
          ?? (whList.length > 0 ? whList[0] : null);
        setWarehouseInfo(defaultWh || { id: info.warehouseId, name: `WH #${info.warehouseId}` });
        resolvedWarehouseId = defaultWh?.id ?? info.warehouseId;
      } catch {
        setWarehouseInfo({ id: info.warehouseId, name: `WH #${info.warehouseId}` });
      }

      // ⬅️ PINDAH KE SINI — masih di dalam try block yang sama, `info` masih in-scope
      try {
        const defRes = await idempiereApi(
          `/models/m_locator?$select=M_Locator_ID&$filter=M_Warehouse_ID eq ${resolvedWarehouseId} and IsDefault eq true and IsActive eq true&$top=1`
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

      await fetchProducts('');
    } catch (err) {
      alert('Gagal inisialisasi: ' + err.message, 'Error');
    }
  };
  init();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  // ── Load PO untuk mode edit (dikirim dari PurchasingList.jsx) ──────────
  // editOrder yang dikirim HANYA berisi field header C_Order (lihat
  // handleEdit() di PurchasingList.jsx) — TIDAK ada line item-nya. Jadi di
  // sini kita fetch C_OrderLine + cari M_RequisitionLine yang masih
  // ter-link (kalau ada) supaya link FPB tidak hilang saat di-submit ulang.
  useEffect(() => {
    const editOrder = location.state?.editOrder;
    if (!editOrder) return;

    const loadEditOrder = async () => {
      setLoadingEditOrder(true);
      try {
        const orderId    = editOrder.id ?? editOrder.C_Order_ID;
        const vendorId    = fkId(editOrder.C_BPartner_ID) ?? editOrder.C_BPartner_ID?.id;
        const vendorName  = editOrder.C_BPartner_ID?.identifier || editOrder.C_BPartner_ID?.Name || '';
        const vendorLocId = fkId(editOrder.C_BPartner_Location_ID) ?? editOrder.C_BPartner_Location_ID?.id ?? null;

        if (!orderId || !vendorId) {
          throw new Error('Data PO tidak lengkap (ID atau vendor tidak ditemukan).');
        }

        // ── Ambil semua line PO ini ──────────────────────────────────────
        const linesRes = await idempiereApi(
          `/models/c_orderline?$filter=C_Order_ID eq ${orderId}` +
          `&$select=C_OrderLine_ID,M_Product_ID,C_UOM_ID,QtyEntered,QtyOrdered,PriceEntered,PriceActual`
        );
        const lines = Array.isArray(linesRes.records) ? linesRes.records : [];
        if (lines.length === 0) {
          throw new Error('PO ini tidak memiliki baris item — tidak bisa diedit dari sini.');
        }

        // ── Cari FPB (M_RequisitionLine) yang masih ter-link ke line² ini ─
        // supaya kalau nanti disubmit ulang, link-nya tidak hilang begitu
        // saja (lihat usePurchaseOrderSubmit.jsx mode edit).
        const lineIds = lines.map(l => l.id ?? l.C_OrderLine_ID);
        const filterStr = lineIds.map(id => `C_OrderLine_ID eq ${id}`).join(' or ');
        const linkedRes = await idempiereApi(
          `/models/m_requisitionline?$filter=${filterStr}&$select=M_RequisitionLine_ID,C_OrderLine_ID`
        );
        const linkedReqLines = Array.isArray(linkedRes.records) ? linkedRes.records : [];
        const reqLineByOrderLine = new Map();
        linkedReqLines.forEach(rl => {
          const olId = fkId(rl.C_OrderLine_ID) ?? rl.C_OrderLine_ID?.id;
          if (olId != null) reqLineByOrderLine.set(String(olId), rl.id ?? rl.M_RequisitionLine_ID);
        });

        // ── Detail produk (Name, UOM dasar) per produk unik di line² ini ─
        const productIds = [...new Set(lines.map(l => fkId(l.M_Product_ID) ?? l.M_Product_ID?.id))];
        const productMap = new Map();
        await Promise.all(productIds.map(async (pid) => {
          try {
            const p = await idempiereApi(`/models/m_product/${pid}?$select=M_Product_ID,Name,C_UOM_ID`);
            productMap.set(String(pid), p);
          } catch { /* fallback pakai identifier dari line kalau gagal */ }
        }));

        const cartItems = lines.map(line => {
          const lineId     = line.id ?? line.C_OrderLine_ID;
          const productId  = fkId(line.M_Product_ID) ?? line.M_Product_ID?.id;
          const product    = productMap.get(String(productId));
          const uomId       = fkId(line.C_UOM_ID) ?? line.C_UOM_ID?.id;
          const baseUomId   = product?.C_UOM_ID ? (fkId(product.C_UOM_ID) ?? product.C_UOM_ID?.id) : uomId;
          const qtyEntered  = parseFloat(line.QtyEntered ?? line.QtyOrdered ?? 0);
          const qtyOrdered  = parseFloat(line.QtyOrdered ?? qtyEntered);
          const reqLineId   = reqLineByOrderLine.get(String(lineId)) || null;

          return {
            M_Product_ID: productId,
            Name:         product?.Name || line.M_Product_ID?.identifier || `Produk #${productId}`,
            C_UOM_ID:     uomId,
            UomName:      line.C_UOM_ID?.identifier || '',
            BaseUOM_ID:   baseUomId,
            BaseUOMName:  '',
            UnitsPerBaseUom: (qtyEntered > 0 && qtyOrdered > 0) ? (qtyOrdered / qtyEntered) : 1,
            Qty:          qtyEntered,
            Price:        parseFloat(line.PriceEntered ?? line.PriceActual ?? 0),
            C_BPartner_ID: vendorId,
            VendorName:    vendorName,
            C_BPartner_Location_ID: vendorLocId,
            // Kalau line ini masih ter-link ke FPB, bawa referensinya supaya
            // usePurchaseOrderSubmit.jsx bisa re-link/re-mark saat submit ulang.
            ...(reqLineId ? { sourceRequisitionLineId: reqLineId, BaseQty: qtyOrdered } : {}),
          };
        });

        clearCart();
        addItems(cartItems);
        setDescription(editOrder.Description || '');
        // Tanggal PO yang diedit (kalau header dari PurchasingList tidak membawa DateOrdered, ambil langsung).
        let orderDate = toDateOnly(editOrder.DateOrdered);
        if (!orderDate) {
          try {
            const o = await idempiereApi(`/models/c_order/${orderId}?$select=DateOrdered`);
            orderDate = toDateOnly(o?.DateOrdered);
          } catch { /* fallback hari ini */ }
        }
        setDateOrdered(orderDate || todayLocalISO());
        // Document Type PO yang diedit tidak bisa diganti — hanya ditampilkan.
        let dtName = editOrder.C_DocTypeTarget_ID?.identifier || editOrder.C_DocType_ID?.identifier || null;
        if (!dtName) {
          try {
            const o = await idempiereApi(`/models/c_order/${orderId}?$select=C_DocTypeTarget_ID`);
            dtName = o?.C_DocTypeTarget_ID?.identifier ?? null;
          } catch { /* label saja, abaikan */ }
        }
        setEditDocTypeName(dtName);
        setEditOrderId(orderId);
        setEditOrderDocNo(editOrder.DocumentNo || `#${orderId}`);
        setEditOrderStatus(editOrder.DocStatus?.id ?? editOrder.DocStatus ?? null);

        // PO yang diedit mengikat ke gudangnya sendiri (M_Warehouse_ID) —
        // pakai itu, bukan gudang default user login, supaya konsisten.
        const orderWarehouseId = fkId(editOrder.M_Warehouse_ID) ?? editOrder.M_Warehouse_ID?.id;
        if (orderWarehouseId) {
          try {
            const wh = await idempiereApi(`/models/m_warehouse/${orderWarehouseId}?$select=M_Warehouse_ID,Name`);
            setWarehouseInfo({ id: orderWarehouseId, name: wh.Name || `WH #${orderWarehouseId}` });
          } catch {
            setWarehouseInfo({ id: orderWarehouseId, name: `WH #${orderWarehouseId}` });
          }
        }

        // Bersihkan location.state supaya refresh/back tidak reload ulang.
        navigate(location.pathname, { replace: true, state: {} });
      } catch (err) {
        alert('Gagal memuat data PO untuk diedit:\n' + err.message, 'Error');
      } finally {
        setLoadingEditOrder(false);
      }
    };

    loadEditOrder();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const handleCancelEdit = useCallback(() => {
    clearCart();
    setDescription('');
    setDateOrdered(todayLocalISO());
    setEditOrderId(null);
    setEditOrderDocNo(null);
    setEditOrderStatus(null);
    setEditDocTypeName(null);
  }, [clearCart]);

  const openProductDetail = useCallback((product) => {
    setSelectedProduct(product);
    setDetailOpen(true);
  }, []);
  const closeProductDetail = useCallback(() => {
    setDetailOpen(false);
    setSelectedProduct(null);
  }, []);

  // Tambah produk manual — vendor & harga di-suggest otomatis dari
  // M_Product_PO/M_PriceList kalau ada; kalau tidak ada, item masuk cart
  // tanpa vendor dan ditandai perlu dilengkapi (lihat badge merah di
  // POCartItem).
  //
  // ── HARGA HARUS DI-SCALE KE UOM YANG DIPILIH USER ──────────────────────
  // suggestion.default.Price dari useProductVendorInfo SELALU harga per UOM
  // DASAR produk. toBaseQty(1, uom) dipakai untuk dapat "berapa base unit
  // per 1 entered unit", dipakai ulang untuk scale harga (rumus sama yang
  // sudah terbukti benar untuk qty).
  //
  // UnitsPerBaseUom disimpan di item (= unitsPerEntered) supaya POCartItem
  // bisa tampilkan preview hasil konversi ("≈ 6 pcs") yang tetap akurat
  // walau Qty diedit lagi di cart. BaseUOMName untuk teks preview itu.
  //
  // BaseUOM_ID: SELALU product.C_UOM_ID (UOM dasar produk), dibutuhkan
  // usePurchaseOrderSubmit.jsx untuk konversi saat submit PO.
  const handleConfirmAddToCart = useCallback(async (product, qty, uom) => {
    closeProductDetail();
    const suggestion = await fetchDefaultVendor(product.M_Product_ID);
    const basePrice = suggestion.default?.Price ?? 0;
    const unitsPerEntered = toBaseQty(1, uom); // 1 6-Pack → 6 (base unit per 1 entered unit)
    const priceForEnteredUom = unitsPerEntered > 0 ? basePrice * unitsPerEntered : basePrice;

    addItem({
      M_Product_ID: product.M_Product_ID,
      Name:         product.Name,
      C_UOM_ID:     uom?.C_UOM_ID || product.C_UOM_ID,
      UomName:      uom?.Name || product.C_UOM_Name,
      BaseUOM_ID:   product.C_UOM_ID,
      BaseUOMName:  product.C_UOM_Name,
      UnitsPerBaseUom: unitsPerEntered,
      uomOptions:   product.uomOptions,   // ⬅️ TAMBAHKAN — supaya UomSelector bisa render dropdown
      Qty:          qty,
      Price:        priceForEnteredUom,
      C_BPartner_ID: suggestion.default?.C_BPartner_ID ?? null,
      VendorName:    suggestion.default?.VendorName ?? '',
    });
  }, [addItem, fetchDefaultVendor, closeProductDetail, toBaseQty]);

  const handleBarcodeDetected = useCallback(async (code) => {
    const found = products.find(p => p.Value?.toUpperCase() === code.toUpperCase());
    setScannerOpen(false);
    if (found) {
      const suggestion = await fetchDefaultVendor(found.M_Product_ID);
      // Barcode selalu tambah dalam UOM DASAR produk (tidak ada langkah
      // pilih UOM di alur scan cepat ini) — jadi harga TIDAK perlu
      // di-scale, dan UnitsPerBaseUom = 1 (tidak ada konversi, tidak perlu
      // preview di cart).
      addItem({
        M_Product_ID: found.M_Product_ID,
        Name:         found.Name,
        C_UOM_ID:     found.C_UOM_ID,
        UomName:      found.C_UOM_Name,
        BaseUOM_ID:   found.C_UOM_ID,
        BaseUOMName:  found.C_UOM_Name,
        UnitsPerBaseUom: 1,
        uomOptions:   found.uomOptions,   // ⬅️ TAMBAHKAN
        Qty:          1,
        Price:        suggestion.default?.Price ?? 0,
        C_BPartner_ID: suggestion.default?.C_BPartner_ID ?? null,
        VendorName:    suggestion.default?.VendorName ?? '',
      });
    } else {
      setSearchValue(code);
      fetchProducts(code);
    }
  }, [products, addItem, fetchDefaultVendor, fetchProducts, setSearchValue]);
  
  const handleClearCart = useCallback(() => {
    clearCart();
    setDescription('');
    setDateOrdered(todayLocalISO());
  }, [clearCart]);

  const handleImportFromRequisition = useCallback((cartItems, requisition) => {
    addItems(cartItems);
    setDescription(prev => prev.trim() ? prev : (requisition.Description || `Import dari FPB ${requisition.DocumentNo}`));
  }, [addItems]);
  
  const handleVendorClick = useCallback((item, itemKey) => {
    if (editOrderId) {
      alert(
        'Vendor tidak bisa diganti saat mode edit PO.\nBatalkan edit dulu (tombol "Batalkan Edit") kalau memang perlu vendor lain.',
        'Mode Edit'
      );
      return;
    }
    setVendorPickerTarget(itemKey);
  }, [editOrderId]);

  const handleVendorPicked = useCallback((vendor) => {
    if (vendorPickerTarget) updateVendor(vendorPickerTarget, vendor);
    setVendorPickerTarget(null);
  }, [vendorPickerTarget, updateVendor]);

  const handleWarehouseChange = useCallback(async (e) => {
  const id    = Number(e.target.value);
  const found = warehouses.find(w => w.id === id) ?? null;
  if (!found) {
    console.warn('[handleWarehouseChange] warehouse id tidak ditemukan:', id, warehouses);
    return;
  }
    setWarehouseInfo(found);
  
    // Locator default ikut gudang yang baru dipilih — dipakai saat submit PO.
    try {
      const defRes = await idempiereApi(
        `/models/m_locator?$select=M_Locator_ID&$filter=M_Warehouse_ID eq ${found.id} and IsDefault eq true and IsActive eq true&$top=1`
      );
      const defRecords = Array.isArray(defRes.records) ? defRes.records : [];
      if (defRecords.length > 0) {
        setDefaultLocatorId(fkId(defRecords[0].M_Locator_ID) ?? defRecords[0].id);
      } else {
        const anyRes = await idempiereApi(
          `/models/m_locator?$select=M_Locator_ID&$filter=M_Warehouse_ID eq ${found.id} and IsActive eq true&$top=1`
        );
        const anyRecords = Array.isArray(anyRes.records) ? anyRes.records : [];
        setDefaultLocatorId(anyRecords[0] ? (fkId(anyRecords[0].M_Locator_ID) ?? anyRecords[0].id) : null);
      }
    } catch {
      setDefaultLocatorId(null);
    }
  }, [warehouses]);

  const handleCartUomChange = useCallback((itemKey, chosenUom) => {
    const target = cart.find(i => lineKey(i) === itemKey);
    if (!target) return;
  
    const unitsPerEnteredOld = target.UnitsPerBaseUom || 1;
    const unitsPerEnteredNew = toBaseQty(1, chosenUom); // base-unit per 1 unit UOM baru
  
    const newPrice = unitsPerEnteredOld
      ? (target.Price || 0) * unitsPerEnteredNew / unitsPerEnteredOld
      : target.Price;
  
    updateUom(itemKey, {
      C_UOM_ID: chosenUom.C_UOM_ID,
      Name: chosenUom.Name,
      UnitsPerBaseUom: unitsPerEnteredNew,
      Price: Math.max(newPrice, 0),
    });
  }, [cart, toBaseQty, updateUom]);

  const handleSubmit = async (submitMode = 'complete') => {
    if (!editOrderId && !docTypeId) {
      alert('Document Type Purchase Order belum dipilih / tidak ditemukan.\nPilih Document Type di bar atas, atau muat ulang halaman.', 'Document Type');
      return;
    }
    const { results, hadError } = await submit(cart, {
      warehouseId: warehouseInfo?.id,
      description,
      submitMode,
      editOrderId,   // ← null di mode normal, terisi di mode edit
      dateOrdered,
      attachments: att.stagedFiles,   // File[] — diunggah ke tiap PO oleh hook
    });
    if (!results || results.length === 0) return;
  
    setSuccessData(results);
    clearCart();
    att.clearStaged();
    setCartOpen(false);
    setEditOrderId(null);
    setEditOrderDocNo(null);
    setEditOrderStatus(null);
    setEditDocTypeName(null);
  
    setDateOrdered(todayLocalISO());

    if (hadError) setPendingSuccessOpen(true);
    else setSuccessOpen(true);
  };
  
  const handleSubmitDraft    = () => handleSubmit('draft');
  const handleSubmitComplete = () => handleSubmit('complete');

  // Tanggal selain hari ini sengaja ditampilkan di ringkasan cart supaya tidak terlewat sebelum submit.
  const isNotToday = dateOrdered !== todayLocalISO();
  const cartSummaryRight =
    `📦 ${warehouseInfo?.name || '...'}` +
    (isNotToday && dateOrdered ? ` · 📅 ${formatDateID(dateOrdered)}` : '');

  return (
    <div style={{
      flex: 1, minHeight: 0, background: COLOR.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
    }}>
      <Dialog
        isOpen={dialog.isOpen} title={dialog.title} message={dialog.message}
        onClose={() => {
          setDialog({ isOpen: false, title: '', message: '' });
          // Kalau ada success modal yang ditunda (kasus partial success +
          // error), tampilkan sekarang setelah user selesai baca errornya.
          if (pendingSuccessOpen) {
            setPendingSuccessOpen(false);
            setSuccessOpen(true);
          }
        }}
      />

      <ProductDetailSheet
        isOpen={detailOpen}
        product={selectedProduct}
        onClose={closeProductDetail}
        onConfirm={handleConfirmAddToCart}
        confirmLabel="Tambah ke PO"
      />

      <VendorPickerModal
        isOpen={vendorPickerTarget !== null}
        onClose={() => setVendorPickerTarget(null)}
        onSelect={handleVendorPicked}
      />

      <PurchaseOrderSuccessModal
        isOpen={successOpen}
        data={successData}
        onClose={() => {
          setSuccessOpen(false);
          setSuccessData(null);
          setDescription(''); // ← tambahan
          fetchProducts('');
          setSearchValue('');
          setTimeout(() => searchRef.current?.focus(), 150);
        }}
      />

      <BarcodeScanner
        isOpen={scannerOpen}
        onDetected={handleBarcodeDetected}
        onClose={() => setScannerOpen(false)}
      />

      <RequisitionToPOImportModal
        isOpen={importOpen}
        warehouseId={warehouseInfo?.id}
        onClose={() => setImportOpen(false)}
        onImport={handleImportFromRequisition}
      />
      <AttachmentModal
        isOpen={attachOpen} onClose={() => setAttachOpen(false)}
        att={att} canEdit={canSubmitPO} title="📎 Lampiran Purchase Order"
      />
      {/* Top Bar */}
      <div className='header-content'>
      <span style={{ 
        color: '#000', 
        fontWeight: 700, 
        fontSize: '15px', 
        flex: 1,
        display: 'inline-flex', 
        alignItems: 'center',   
          gap: '6px'              
      }}>
      <ShoppingCartIcon />
      <span>Purchasing</span>
      </span>
      <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '3px',
            padding: '2px 8px 2px 10px', // Padding kiri sedikit lebih besar untuk label
          }}
        >
          <button
          type="button"
          onClick={() => setAttachOpen(true)}
          title="Lampiran (gambar / PDF)"
          style={{
            display: 'flex', alignItems: 'center', gap: '4px', height: '25px',
            background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: '3px', padding: '3px 10px', fontSize: '11px', fontWeight: 600,
            color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          📎 Lampiran{attachCount > 0 ? ` (${attachCount})` : ''}
        </button>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: '#000',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              whiteSpace: 'nowrap',
            }}
          >
            Warehouse:
          </span>

          <select
            value={warehouseInfo?.id ?? ''}
            onChange={handleWarehouseChange}
            disabled={warehouses.length <= 1 || !!editOrderId}
            title={editOrderId ? 'Gudang mengikuti PO yang sedang diedit' : undefined}
            style={{
              background: 'transparent', 
              border: 'none',            
              padding: '2px 4px',
              fontSize: '11px',
              color: '#000f',
              cursor: (warehouses.length <= 1 || !!editOrderId) ? 'default' : 'pointer',
              outline: 'none',
              maxWidth: isDesktop ? '160px' : '110px',
              colorScheme: 'dark',
            }}
          >
            {warehouses.length === 0 && <option value="">Memuat...</option>}
            {warehouses.map((wh, idx) => (
              <option key={wh.id || `wh-null-${idx}`} value={wh.id ?? ''} style={{ background: '#1e3a5f', color: '#e0eaff' }}>
                🏭 {wh.name}
              </option>
            ))}
          </select>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '3px',
            padding: '2px 8px 2px 10px',
          }}
        >
          <span
            style={{
              fontSize: '10px', fontWeight: 600, color: '#000',
              textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap',
            }}
          >
            Doc Type:
          </span>
          {editOrderId ? (
            <select
              disabled
              value="edit"
              title="Document Type mengikuti PO yang sedang diedit"
              style={{
                background: 'transparent', border: 'none', padding: '2px 4px', fontSize: '11px',
                color: '#000f', cursor: 'default', outline: 'none',
                maxWidth: isDesktop ? '200px' : '130px', colorScheme: 'dark',
              }}
            >
              <option value="edit">{editDocTypeName || '—'}</option>
            </select>
          ) : (
            <select
              value={docTypeId ?? ''}
              onChange={e => selectDocType(e.target.value)}
              disabled={!canSubmitPO || poDocTypes.length <= 1}
              title="Document Type Purchase Order (menentukan nomor dokumen / departemen)"
              style={{
                background: 'transparent', border: 'none', padding: '2px 4px', fontSize: '11px',
                color: '#000f', cursor: (!canSubmitPO || poDocTypes.length <= 1) ? 'default' : 'pointer',
                outline: 'none', maxWidth: isDesktop ? '200px' : '130px', colorScheme: 'dark',
              }}
            >
              {poDocTypes.length === 0 && (
                <option value={docTypeId ?? ''}>{poDocTypesLoading ? 'Memuat...' : '—'}</option>
              )}
              {poDocTypes.map(dt => (
                <option key={dt.id} value={dt.id} style={{ background: '#1e3a5f', color: '#e0eaff' }}>
                  {dt.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '3px',
            padding: '2px 8px 2px 10px', // Padding kiri sedikit lebih besar untuk label
          }}
        >
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: '#000',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              whiteSpace: 'nowrap',
            }}
          >
            Date:
          </span>

          <input
              type="date"
              value={dateOrdered}
              onChange={e => setDateOrdered(e.target.value)}
              onBlur={e => { if (!e.target.value) setDateOrdered(todayLocalISO()); }}
              disabled={!canSubmitPO}
              title="Tanggal pemesanan — pada Cash Purchase juga dipakai untuk Receipt, Invoice & Payment"
              style={{
                background: isNotToday ? 'red' : 'transparent',
                border: `0px solid ${isNotToday ? '#fbbf24' : 'rgba(255,255,255,0.3)'}`,
                padding: '2px 4px',
                fontSize: '11px',
                color: '#000',
                cursor: (warehouses.length <= 1 || !!editOrderId) ? 'default' : 'pointer',
                outline: 'none',
                maxWidth: isDesktop ? '160px' : '110px',
              }}
            />
        </div>
            
      </div>

      {loadingEditOrder && (
        <div style={{
          background: '#e0f2fe', color: '#075985', fontSize: '12px', fontWeight: 600,
          padding: '8px 14px', textAlign: 'center', flexShrink: 0,
        }}>
          ⏳ Memuat data PO untuk diedit...
        </div>
      )}

      {editOrderId && !loadingEditOrder && (
        <div style={{
          background: '#fff3cd', color: '#856404', fontSize: '12px', fontWeight: 600,
          padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid #ffe69c', flexShrink: 0,
        }}>
          <span>
            ✏️ Mode Edit — PO {editOrderDocNo}
            {editOrderStatus === 'NA' ? ' (Revisi dokumen ditolak)' : ''}
          </span>
          <button
            onClick={handleCancelEdit}
            style={{
              background: 'transparent', border: '1px solid #856404', color: '#856404',
              borderRadius: RADIUS.sm, padding: '4px 10px', fontSize: '11px',
              cursor: 'pointer', fontWeight: 700, WebkitTapHighlightColor: 'transparent',
            }}
          >Batalkan Edit</button>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Search + Scan + Import FPB */}
          <div style={{
            padding: '12px 14px', background: COLOR.surface, borderBottom: `1px solid ${COLOR.border}`,
            display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0,
          }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '15px', pointerEvents: 'none' }}>🔍</span>
              <input
                ref={searchRef}
                type="text"
                value={searchValue}
                onChange={e => search(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fetchProducts(searchValue.trim()); } }}
                placeholder="Cari nama / kode produk (tambahan manual)..."
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 34px',
                  border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.md,
                  fontSize: '14px', color: COLOR.textDk, background: COLOR.bg, outline: 'none',
                }}
              />
              {searchValue && (
                <button
                  onClick={() => { setSearchValue(''); fetchProducts(''); }}
                  style={{
                    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textLt,
                    fontSize: '16px', padding: '2px',
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
                fontSize: '20px', lineHeight: 1, flexShrink: 0, WebkitTapHighlightColor: 'transparent',
              }}
            >
              <ScanIcon />
            </button>

            <button
              onClick={() => { if (!editOrderId) setImportOpen(true); }}
              disabled={!!editOrderId}
              title={editOrderId
                ? 'Import FPB tidak tersedia saat mode edit PO (batalkan edit dulu)'
                : 'Import dari FPB yang sudah Approved'}
              style={{
                background: editOrderId ? '#9ca3af' : COLOR.success, border: 'none', color: '#fff',
                borderRadius: RADIUS.md, padding: '10px 14px',
                cursor: editOrderId ? 'not-allowed' : 'pointer',
                fontSize: '18px', lineHeight: 1, flexShrink: 0, WebkitTapHighlightColor: 'transparent',
                opacity: editOrderId ? 0.7 : 1,
              }}
            ><ImportIcon /></button>
          </div>

          {/* Product Grid */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '12px 14px',
            paddingBottom: (!isDesktop && cart.length > 0) ? '80px' : '14px',
          }}>
            {productsLoading ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: COLOR.textLt }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>⏳</div>
                <p style={{ margin: 0 }}>Memuat produk...</p>
              </div>
            ) : products.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: COLOR.textLt }}>
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>🧾</div>
                <p style={{ margin: 0 }}>Tidak ada produk ditemukan.</p>
              </div>
            ) : (
              <>
                <div style={{ fontSize: '12px', color: COLOR.textLt, marginBottom: '8px' }}>
                  {products.length} produk ditemukan
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isDesktop ? 'repeat(auto-fill, minmax(170px, 1fr))' : 'repeat(2, 1fr)',
                  gap: '10px',
                }}>
                  {products.map((p, idx) => (
                    <ProductCard key={`${p.M_Product_ID}-${idx}`} product={p} onClick={openProductDetail} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <PurchaseSubmitModal
          isOpen={submitModalOpen}
          mode={submitModalMode}          
          onClose={() => setSubmitModalOpen(false)}
          onDraft={handleModalDraft}
          onComplete={handleModalComplete}
          onCashPurchase={handleModalCashPurchase}
          bankAccounts={bankAccounts}
          selectedBankAccountId={selectedBankAccountId}
          onBankAccountChange={setSelectedBankAccountId}
          isSubmitting={isSubmitting || cashPurchaseSubmitting}
          totalAmount={totalAmount}
        />
        
        <CashPurchaseProgressModal
          isOpen={progressModalOpen}
          steps={cashSteps}          // ← sebelumnya steps={progressSteps}
          isDone={progressDone}
          onClose={() => setProgressModalOpen(false)}
        />
                 
          {isDesktop && (
          <POCartSidebar
            isOpen={cartOpen}
            onClose={() => setCartOpen(false)}
            title={editOrderId ? `✏️ Edit PO ${editOrderDocNo}` : '🧾 Daftar Purchase Order'}
            vendorGroups={vendorGroups}
            onRemove={removeItem}
            onQtyChange={updateQty}
            onUomChange={handleCartUomChange}
            onPriceChange={updatePrice}
            onVendorClick={handleVendorClick}
            onClearCart={canSubmitPO ? handleClearCart : undefined}
            totalItems={totalItems}
            totalAmount={totalAmount}
            summaryRight={cartSummaryRight}
            //onSubmit={canSubmitPO ? openNormalSubmitModal : undefined}
            //onSubmitCash={canSubmitPO ? openCashSubmitModal : undefined}
            onSubmitDraft={canSubmitPO ? handleSubmitDraft : undefined}
            onSubmitComplete={canSubmitPO ? handleSubmitComplete : undefined}
            isSubmitting={isSubmitting}
            description={description}
            onDescriptionChange={canSubmitPO ? setDescription : undefined}
            descriptionPlaceholder={PURCHASING_CONFIG.DESCRIPTION}
          />
        )}
      </div>

      {!isDesktop && totalItems > 0 && !cartOpen && (
        <CartFab count={totalItems} label="Daftar PO" icon="🧾" onClick={() => setCartOpen(true)} />
      )}

      {!isDesktop && (
        <POCartPanel
          isOpen={cartOpen}
          onClose={() => setCartOpen(false)}
          title={editOrderId ? `✏️ Edit PO ${editOrderDocNo}` : '🧾 Daftar Purchase Order'}
          vendorGroups={vendorGroups}
          onRemove={removeItem}
          onQtyChange={updateQty}
          onPriceChange={updatePrice}
          onUomChange={handleCartUomChange}
          onVendorClick={handleVendorClick}
          onClearCart={canSubmitPO ? handleClearCart : undefined}
          totalItems={totalItems}
          totalAmount={totalAmount}
          summaryRight={cartSummaryRight}         
          // onSubmit={canSubmitPO ? openNormalSubmitModal : undefined}
          // onSubmitCash={canSubmitPO ? openCashSubmitModal : undefined}
          onSubmitDraft={canSubmitPO ? handleSubmitDraft : undefined}
          onSubmitComplete={canSubmitPO ? handleSubmitComplete : undefined}
          isSubmitting={isSubmitting}
          description={description}
          onDescriptionChange={canSubmitPO ? setDescription : undefined}
          descriptionPlaceholder={PURCHASING_CONFIG.DESCRIPTION}
        />
      )}

      {!canSubmitPO && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#fef3c7', color: '#92400e', fontSize: '12px',
          padding: '8px 14px', textAlign: 'center', zIndex: 150,
        }}>
          ⚠ Role Anda hanya memiliki akses lihat (read-only) untuk Purchasing.
        </div>
      )}
    </div>
  );
};

export default PurchasingContainer;