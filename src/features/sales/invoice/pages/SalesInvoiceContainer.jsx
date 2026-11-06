import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom'; 

import {
  Dialog,
  CartFab,
  ProductCard,
  ProductDetailSheet,
  BarcodeScanner,
  ShoppingCartIcon,
  ScanIcon
} from '@/shared/components';

import {
  useIsDesktop,
  getLoginInfo,
  getMissingSessionFields,
  useColumnSupport
} from '@/shared/hooks';

import { useSalesProductSearch } from '@/features/sales/shared/hooks/useSalesProductSearch';
import {
  useUomConversion
} from '@/shared/hooks';
import { useBankAccounts } from '@/shared/hooks/useBankAccounts'; // sesuaikan path

import { useCustomerSearch } from '@/shared/hooks/useCustomerSearch';
import { useAccess } from '@/context/AccessContext';
import SalesInvoiceSubmitModal from '@/features/sales/invoice/components/SalesInvoiceSubmitModal';
import SalesInvoiceSuccessModal from '@/features/sales/invoice/components/SalesInvoiceSuccessModal';
import SalesInvoiceImportFromShipment from '@/features/sales/invoice/components/SalesInvoiceImportFromShipment';

import { useSalesCart, lineKey } from '@/features/sales/invoice/hooks/useSalesCart';
import { useSalesInvoiceSubmit } from '@/features/sales/invoice/hooks/useSalesInvoiceSubmit';

import { SICartSidebar, SICartPanel } from '@/features/sales/shared/components';

import { idempiereApi, fkId } from '@/api/idempiereApi';
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { resolveDocTypeId, DOC_BASE_TYPE } from '@/utils/docTypeResolver';
import { todayLocalISO, toDateOnly, formatDateID } from '@/utils/dateOnly';
import '@/css/Header.css';
import { formStyles } from '@/utils/formStyles';
const SALES_INVOICE_CONFIG = {
  DESCRIPTION: 'POReference',
};

// Key window untuk pembatasan field (kolom RestrictedFields di AD_Role),
// mis. "salesInvoice.PriceEntered". Samakan dengan key di windowAccessMap.
const SI_WINDOW_KEY = 'salesInvoice';

// Produk bertipe Service (M_Product.ProductType = 'S') tidak punya stok —
// jangan pernah dicek QtyOnHand-nya.
const isServiceProduct = (p) =>
  p?.isService === true || (p?.ProductType?.id ?? p?.ProductType) === 'S';

const SalesInvoiceContainer = () => {
  const navigate  = useNavigate();
  const isDesktop = useIsDesktop();

  // Pembatasan field: false jika role dilarang mengubah PriceEntered
  // (atau aturan belum selesai dimuat → fail-closed sementara).
  const { canEditField, isFieldHidden } = useAccess();
  const canEditPrice = canEditField(SI_WINDOW_KEY, 'PriceEntered');
  const priceHidden  = isFieldHidden(SI_WINDOW_KEY, 'PriceEntered');

  const [cartOpen, setCartOpen]       = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [dialog, setDialog]           = useState({ isOpen: false, title: '', message: '' });
  const [successData, setSuccessData] = useState(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [detailOpen, setDetailOpen]   = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [invoiceDocTypeId, setInvoiceDocTypeId] = useState(null);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [importShipmentOpen, setImportShipmentOpen] = useState(false);
    // ...
  const supportsBankAccount = useColumnSupport('c_invoice', 'C_BankAccount_ID');
  const supportsDateService = useColumnSupport('c_invoiceline', 'DateService');
  const [bankAccountId, setBankAccountId] = useState(null);
  const { bankAccounts, loading: bankAccountsLoading } = useBankAccounts();
  
  // ── Inline customer search state (pola GoodsReceiptContainer) ──────────
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerOpen, setCustomerOpen]   = useState(false);
  const { customers, loading: customerLoading, searchCustomer, resolveCustomerPricing } = useCustomerSearch();
  const [dateInvoiced, setDateInvoiced] = useState(todayLocalISO);
  
  const searchRef = useRef(null);
  const customerBoxRef = useRef(null);
  const alert = (message, title = 'Perhatian') => setDialog({ isOpen: true, title, message });

  // ── Stok & BOM Phantom (pola sama seperti SalesOrderContainer) ──────────
  // Sales Invoice tidak punya selector Warehouse sendiri di UI, jadi dipakai
  // Warehouse default dari sesi login (getLoginInfo) untuk cek stok.
  const [warehouseId, setWarehouseId] = useState(null);
  
  const location = useLocation(); // ⬅️ tambahkan setelah navigate
  const [editInvoiceId, setEditInvoiceId]         = useState(null);
  const [editInvoiceDocNo, setEditInvoiceDocNo]   = useState(null);
  const [editInvoiceStatus, setEditInvoiceStatus] = useState(null);
  const [loadingEditInvoice, setLoadingEditInvoice] = useState(false);

  const { products, loading: productsLoading, fetchProducts, search, searchValue, setSearchValue } = useSalesProductSearch();

  // ── Override QtyOnHand grid dengan hasil yang BOM-Phantom-aware ─────────
  // useSalesProductSearch tidak tahu soal Phantom/BOM, jadi field QtyOnHand
  // bawaannya salah untuk produk phantom (0 / negatif). Di sini di-override
  // dengan angka yang benar, pola sama seperti `resolveProducts` di
  // SalesOrderContainer — non-Phantom tetap dihitung ulang juga (hasilnya
  // konsisten, karena basisnya sama-sama M_Storage) supaya satu sumber
  // kebenaran, tidak campur dua cara hitung berbeda.
  // Produk Service dilewati: tidak punya stok, QtyOnHand dibiarkan undefined.
  const [productsEnriched, setProductsEnriched] = useState([]);
  const {
    cart, addItem, addItems, removeItem, updateQty, updatePrice, updateUom, clearCart,
    customer, setCustomer, totalItems, totalAmount, updateDescription, updateDateService,
  } = useSalesCart();
  const { toBaseQty } = useUomConversion();

  const { submit: submitInvoice, isSubmitting } = useSalesInvoiceSubmit({
    invoiceDocTypeId,
    description: description,
    onError: alert,
  });

  // ── Init: validasi sesi + resolve Document Type "Sales Invoice" ─────────
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
          const invDt = await resolveDocTypeId(DOC_BASE_TYPE.AR_INVOICE, { orgId: info.orgId });
          setInvoiceDocTypeId(invDt);
        } catch (err) {
          alert(err.message, 'Document Type Tidak Ditemukan');
        }

        setWarehouseId(info.warehouseId ?? null);

        await fetchProducts('');
      } catch (err) {
        alert('Gagal inisialisasi: ' + err.message, 'Error');
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const editInvoice = location.state?.editInvoice;
    if (!editInvoice) return;
  
    const loadEditInvoice = async () => {
      setLoadingEditInvoice(true);
      try {
        const invoiceId = editInvoice.id ?? editInvoice.C_Invoice_ID;
        const bpId      = fkId(editInvoice.C_BPartner_ID) ?? editInvoice.C_BPartner_ID?.id;
        const bpName    = editInvoice.C_BPartner_ID?.identifier || editInvoice.C_BPartner_ID?.Name || '';
  
        if (!invoiceId || !bpId) {
          throw new Error('Data Invoice tidak lengkap (ID atau customer tidak ditemukan).');
        }
  
        // ── Ambil semua line invoice ini ──────────────────────────────
        const linesRes = await idempiereApi(
          `/models/c_invoiceline?$filter=C_Invoice_ID eq ${invoiceId}` +
          `&$select=C_InvoiceLine_ID,M_Product_ID,QtyEntered,C_UOM_ID,PriceEntered,PriceActual,Description,DateService` +
          `&$orderby=Line`
        );
        const lines = Array.isArray(linesRes.records) ? linesRes.records : [];
        if (lines.length === 0) {
          throw new Error('Invoice ini tidak memiliki baris item — tidak bisa diedit dari sini.');
        }
  
        const cartItems = lines.map(line => ({
          M_Product_ID: fkId(line.M_Product_ID) ?? line.M_Product_ID?.id,
          Name:         line.M_Product_ID?.identifier || `Produk #${fkId(line.M_Product_ID)}`,
          Description:  line.Description || line.M_Product_ID?.identifier || '',
          C_UOM_ID:     fkId(line.C_UOM_ID) ?? line.C_UOM_ID?.id,
          UomName:      line.C_UOM_ID?.identifier || '',
          selectedUom:  { C_UOM_ID: fkId(line.C_UOM_ID) ?? line.C_UOM_ID?.id, Name: line.C_UOM_ID?.identifier },
          Qty:          parseFloat(line.QtyEntered ?? 0),
          Price:        parseFloat(line.PriceEntered ?? line.PriceActual ?? 0),
          DateService:  line.DateService || null,
          // dipakai useSalesCart untuk identity — sesuaikan dengan lineKey() kalau perlu
          sourceInvoiceLineId: line.id ?? line.C_InvoiceLine_ID,
        }));
  
        // ── Resolve lokasi customer (fallback kalau tidak terkirim dari List) ──
        let locationId = fkId(editInvoice.C_BPartner_Location_ID) ?? editInvoice.C_BPartner_Location_ID?.id ?? null;
        if (!locationId) {
          try {
            const locRes = await idempiereApi(
              `/models/c_bpartner_location?$filter=C_BPartner_ID eq ${bpId} and IsActive eq true&$select=C_BPartner_Location_ID&$top=1`
            );
            const locRecords = Array.isArray(locRes.records) ? locRes.records : [];
            locationId = locRecords[0] ? (fkId(locRecords[0].C_BPartner_Location_ID) ?? locRecords[0].id) : null;
          } catch (err) {
            console.error('Gagal fetch lokasi customer:', err.message);
          }
        }
  
        // ── Resolve price list version customer (tidak tersimpan di header invoice) ──
        const { priceListId, priceListVersionId } = await resolveCustomerPricing({ C_BPartner_ID: bpId, Name: bpName });
  
        clearCart();
        setCustomer({ C_BPartner_ID: bpId, Name: bpName, locationId, priceListId, priceListVersionId });
        setCustomerQuery(bpName);
        addItems(cartItems);
        setDescription(editInvoice.Description || '');
        let invDate = toDateOnly(editInvoice.DateInvoiced);
        if (!invDate) {
          try {
            const inv = await idempiereApi(`/models/c_invoice/${invoiceId}?$select=DateInvoiced`);
            invDate = toDateOnly(inv?.DateInvoiced);
          } catch { /* fallback hari ini */ }
        }
        setDateInvoiced(invDate || todayLocalISO());
        const bankAccId = fkId(editInvoice.C_BankAccount_ID) ?? editInvoice.C_BankAccount_ID?.id ?? null;
        if (bankAccId) setBankAccountId(bankAccId);
  
        setEditInvoiceId(invoiceId);
        setEditInvoiceDocNo(editInvoice.DocumentNo || `#${invoiceId}`);
        setEditInvoiceStatus(editInvoice.DocStatus?.id ?? editInvoice.DocStatus ?? null);
  
        // Bersihkan location.state supaya refresh/back tidak reload ulang.
        navigate(location.pathname, { replace: true, state: {} });
      } catch (err) {
        alert('Gagal memuat data Invoice untuk diedit:\n' + err.message, 'Error');
      } finally {
        setLoadingEditInvoice(false);
      }
    };
  
    loadEditInvoice();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);
  
  const handleCancelEditInvoice = useCallback(() => {
    clearCart();
    setCustomer(null);
    setCustomerQuery('');
    setDescription('');
    setBankAccountId(null);
    setEditInvoiceId(null);
    setEditInvoiceDocNo(null);
    setEditInvoiceStatus(null);
    setDateInvoiced(todayLocalISO());
  }, [clearCart, setCustomer]);
  
  const handleImportFromShipment = (chosenLines) => addItems(chosenLines);

  // ── Klik di luar box search customer → tutup dropdown ───────────────────
  useEffect(() => {
    const handler = (e) => {
      if (customerBoxRef.current && !customerBoxRef.current.contains(e.target)) {
        setCustomerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Re-fetch produk (dengan harga baru) saat price list customer berubah ──
  useEffect(() => {
    if (customer?.priceListVersionId) {
      fetchProducts(searchValue, null, customer.priceListVersionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.priceListVersionId]);

  useEffect(() => {
    if (bankAccounts.length > 0 && !bankAccountId) {
      const defaultAcc = bankAccounts.find(b => b.isDefault) || bankAccounts[0];
      setBankAccountId(defaultAcc.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankAccounts]);

  // useSalesProductSearch tidak mengembalikan IsPhantom / ProductType, jadi
  // flag-nya diresolve terpisah di sini. Return: Map<productId, { isPhantom, isService }>.
  const fetchProductFlagsMap = async (productIds) => {
    const ids = (productIds || []).filter(Boolean);
    if (ids.length === 0) return new Map();
    try {
      const filter = ids.map(id => `M_Product_ID eq ${id}`).join(' or ');
      const res = await idempiereApi(`/models/m_product?$filter=${filter}&$select=M_Product_ID,IsPhantom,ProductType`);
      const map = new Map();
      (Array.isArray(res.records) ? res.records : []).forEach(r => {
        const pid = r.M_Product_ID?.id ?? r.M_Product_ID ?? r.id;
        map.set(pid, {
          isPhantom: r.IsPhantom === true || r.IsPhantom === 'Y',
          isService: (r.ProductType?.id ?? r.ProductType) === 'S',
        });
      });
      return map;
    } catch (err) {
      console.error('Gagal fetch flag produk (IsPhantom/ProductType):', err.message);
      return new Map();
    }
  };

  // Produk BOM Phantom (M_Product.IsPhantom = true) TIDAK PERNAH punya baris
  // M_Storage sendiri — stoknya diturunkan dari stok component BOM-nya
  // (M_Product_BOM: M_ProductBOM_ID = component, BOMQty = kebutuhan
  // component per 1 unit produk phantom), sama seperti window iDempiere dan
  // pola yang sama dipakai di SalesOrderContainer.
  // `productsInput` boleh array of id angka biasa (dianggap non-Phantom,
  // kompatibel dengan pemanggilan lama) atau array of { id, isPhantom }.
  // Pemanggil WAJIB sudah membuang produk Service dari input.
  const fetchQtyOnHandBatch = async (productsInput) => {
    const normalized = (productsInput || []).map(p =>
      (typeof p === 'object' && p !== null) ? p : { id: p, isPhantom: false }
    );
    const productIds = normalized.map(p => p.id).filter(Boolean);
    if (!warehouseId || productIds.length === 0) return new Map();

    const phantomEntries = normalized.filter(p => p.isPhantom && p.id);

    try {
      const locatorRes = await idempiereApi(`/models/m_locator?$filter=M_Warehouse_ID eq ${warehouseId} and IsActive eq true&$select=M_Locator_ID`);
      const locatorIds = (locatorRes.records || []).map(l => l.id ?? l.M_Locator_ID).filter(Boolean);
      if (locatorIds.length === 0) return new Map();
      const locatorOrClause = locatorIds.map(lid => `M_Locator_ID eq ${lid}`).join(' or ');

      let phantomBomMap = new Map(); // phantomId -> [{ componentId, bomQty }]
      let componentIds  = [];

      if (phantomEntries.length > 0) {
        const bomFilter = phantomEntries.map(p => `M_Product_ID eq ${p.id}`).join(' or ');
        try {
          const bomRes = await idempiereApi(
            `/models/m_product_bom?$filter=(${bomFilter}) and IsActive eq true` +
            `&$select=M_Product_ID,M_ProductBOM_ID,BOMQty`
          );
          (Array.isArray(bomRes.records) ? bomRes.records : []).forEach(line => {
            const parentId    = line.M_Product_ID?.id ?? line.M_Product_ID;
            const componentId = line.M_ProductBOM_ID?.id ?? line.M_ProductBOM_ID;
            const bomQty      = parseFloat(line.BOMQty || 1);
            if (!parentId || !componentId) return;
            if (!phantomBomMap.has(parentId)) phantomBomMap.set(parentId, []);
            phantomBomMap.get(parentId).push({ componentId, bomQty });
            componentIds.push(componentId);
          });
        } catch (err) {
          console.warn('Gagal fetch M_Product_BOM untuk produk Phantom:', err.message);
        }
      }

      const allIds = [...new Set([...productIds, ...componentIds])];
      const productOrClause = allIds.map(pid => `M_Product_ID eq ${pid}`).join(' or ');
      const filter = `(${locatorOrClause}) and IsActive eq true and (${productOrClause})`;
      const res = await idempiereApi(`/models/m_storage?$filter=${filter}&$select=M_Product_ID,QtyOnHand`);
      const map = new Map();
      (res.records || []).forEach(r => {
        const pid = r.M_Product_ID?.id ?? r.M_Product_ID;
        map.set(pid, (map.get(pid) ?? 0) + parseFloat(r.QtyOnHand || 0));
      });

      phantomBomMap.forEach((lines, phantomId) => {
        const derivedQty = lines.reduce((min, { componentId, bomQty }) => {
          const componentStock = map.get(componentId) ?? 0;
          const possibleQty = bomQty > 0 ? Math.floor(componentStock / bomQty) : 0;
          return Math.min(min, possibleQty);
        }, Infinity);
        map.set(phantomId, derivedQty === Infinity ? 0 : derivedQty);
      });

      return map;
    } catch (err) {
      if (err.name === 'AbortError') return new Map();
      console.error('Gagal fetch QtyOnHand batch:', err.message);
      return new Map();
    }
  };

  // Enrich SELURUH grid (bukan cuma produk yang dibuka detailnya) supaya
  // kartu produk menampilkan Stok yang benar, termasuk hasil derivasi BOM
  // untuk produk Phantom — sama seperti yang dilihat user di SalesOrderContainer.
  // Produk Service: tidak dicek stoknya, ditandai isService dan QtyOnHand
  // dibiarkan undefined (bukan 0/null, supaya tidak dianggap "stok habis").
  useEffect(() => {
    let cancelled = false;
    const enrich = async () => {
      if (!products.length) { setProductsEnriched([]); return; }
      setProductsEnriched(products); // tampilkan grid dulu tanpa nunggu enrichment, hindari kedip kosong
      try {
        const ids = products.map(p => p.M_Product_ID).filter(Boolean);
        const flagsMap = await fetchProductFlagsMap(ids);
        const stockInput = ids
          .filter(id => !(flagsMap.get(id)?.isService))
          .map(id => ({ id, isPhantom: flagsMap.get(id)?.isPhantom ?? false }));
        const qtyMap = (warehouseId && stockInput.length > 0)
          ? await fetchQtyOnHandBatch(stockInput)
          : new Map();
        if (cancelled) return;
        setProductsEnriched(products.map(p => {
          const f = flagsMap.get(p.M_Product_ID);
          const isService = f?.isService ?? false;
          return {
            ...p,
            IsPhantom: f?.isPhantom ?? false,
            isService,
            QtyOnHand: isService ? undefined : (qtyMap.get(p.M_Product_ID) ?? 0),
          };
        }));
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.error('Gagal enrich stok/phantom grid produk:', err.message);
        if (!cancelled) setProductsEnriched(products);
      }
    };
    enrich();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, warehouseId]);

  const openProductDetail = (product) => {
    setSelectedProduct(product);
    setDetailOpen(true);

    // Resolve flag (Phantom/Service) + QtyOnHand untuk produk yang benar-benar
    // dibuka, secara async — sheet tetap langsung terbuka, lalu data dipasang
    // begitu hasilnya datang. Service tidak dicek stoknya.
    const productId = product?.M_Product_ID;
    if (!productId) return;
    (async () => {
      try {
        const flags = (await fetchProductFlagsMap([productId])).get(productId);
        const isPhantom = flags?.isPhantom ?? false;
        const isService = flags?.isService ?? false;
        let qtyOnHand;
        if (!isService) {
          const stockMap = await fetchQtyOnHandBatch([{ id: productId, isPhantom }]);
          qtyOnHand = stockMap.get(productId) ?? 0;
        }
        setSelectedProduct(prev =>
          (prev && prev.M_Product_ID === productId)
            ? { ...prev, IsPhantom: isPhantom, isService, QtyOnHand: qtyOnHand }
            : prev
        );
      } catch (err) {
        console.error('Gagal resolve stok/phantom produk:', err.message);
      }
    })();
  };
  const closeProductDetail = () => { setDetailOpen(false); setSelectedProduct(null); };

  const handleConfirmAddToCart = async (product, qty, chosenUom) => {
    // Tentukan apakah produk Service. Kalau flag belum diketahui (grid belum
    // selesai di-enrich), resolve dulu — jangan sampai Service terblokir cek stok.
    let isService = isServiceProduct(product);
    if (product.isService === undefined && product.ProductType === undefined) {
      const flags = (await fetchProductFlagsMap([product.M_Product_ID])).get(product.M_Product_ID);
      isService = flags?.isService ?? false;
    }

    if (!isService) {
      const qtyOnHand = product.QtyOnHand;
      if (warehouseId && qtyOnHand !== undefined && qtyOnHand !== null) {
        if (qtyOnHand <= 0) {
          alert(`Stok produk "${product.Name}" habis (QtyOnHand = ${qtyOnHand}).`, 'Stok Habis');
          return;
        }
        if (qty > qtyOnHand) {
          alert(`Qty melebihi stok tersedia untuk "${product.Name}" (Stok: ${qtyOnHand}).`, 'Stok Tidak Cukup');
          return;
        }
      }
    }

    // Pembatasan field: produk tanpa harga di Price List hanya boleh ditambahkan
    // oleh role yang boleh mengubah harga — kalau tidak, invoice bisa terbit Rp 0.
    const unitPrice = parseFloat(product.PriceActual || product.Price || 0);
    if (unitPrice === 0 && !canEditPrice) {
      alert(
        `Produk "${product.Name}" belum punya harga di Price List ini, dan role Anda tidak dapat mengubah harga. Hubungi admin.`,
        'Harga Tidak Tersedia'
      );
      return;
    }

    const uom = chosenUom || { C_UOM_ID: product.C_UOM_ID, Name: product.UomName, multiplyRate: 1 };
    addItem({
      M_Product_ID: product.M_Product_ID,
      Name:         product.Name,
      Description:  product.Name,
      C_UOM_ID:     uom.C_UOM_ID,
      UomName:      uom.Name,
      selectedUom:  uom,
      DateService:  new Date().toISOString().slice(0, 10),
      Qty:          qty,
      Price:        unitPrice,
    });
    closeProductDetail();
  };

  // Pembatasan field: handler harga dijaga di sini, jadi walaupun SICartSidebar/
  // SICartPanel masih menampilkan input yang bisa diketik, nilainya tidak berubah.
  const handlePriceChange = (...args) => {
    if (!canEditPrice) return;
    return updatePrice(...args);
  };

  const handleBarcodeDetected = async (code) => {
    setScannerOpen(false);
    await fetchProducts(code, null, customer?.priceListVersionId);
  };

  const handleCartUomChange = (itemKey, chosenUom) => {
    const target = cart.find(i => lineKey(i) === itemKey);
    if (!target) return;
    const unitsPerEnteredOld = target.UnitsPerBaseUom || 1;
    const unitsPerEnteredNew = toBaseQty(1, chosenUom);
    const newPrice = unitsPerEnteredOld
      ? (target.Price || 0) * unitsPerEnteredNew / unitsPerEnteredOld
      : target.Price;
    updateUom(itemKey, {
      C_UOM_ID: chosenUom.C_UOM_ID,
      UomName:  chosenUom.Name,
      UnitsPerBaseUom: unitsPerEnteredNew,
      Price: Math.max(newPrice, 0),
    });
  };
  
  // ── Pilih customer dari hasil search — fetch lokasi aktifnya sekalian ──
  // (sebelumnya ini kerjaan CustomerPickerModal; sekarang dilakukan di sini
  // begitu user klik salah satu hasil dropdown).
  const handleSelectCustomer = async (bp) => {
    const bpId = fkId(bp.C_BPartner_ID) ?? bp.id;
    setCustomerQuery(bp.Name);
    setCustomerOpen(false);
  
    if (customer?.C_BPartner_ID && customer.C_BPartner_ID !== bpId && cart.length > 0) {
      clearCart();
    }
  
    try {
      const locRes = await idempiereApi(
        `/models/c_bpartner_location?$filter=C_BPartner_ID eq ${bpId} and IsActive eq true&$select=C_BPartner_Location_ID&$top=1`
      );
      const locRecords = Array.isArray(locRes.records) ? locRes.records : [];
      const locationId = locRecords[0] ? (fkId(locRecords[0].C_BPartner_Location_ID) ?? locRecords[0].id) : null;
      if (!locationId) {
        alert(`Customer "${bp.Name}" tidak memiliki alamat aktif...`, 'Data Tidak Lengkap');
      }
  
      // ── Resolve price list version customer ini ──
      const { priceListId, priceListVersionId } = await resolveCustomerPricing(bp);
      if (!priceListVersionId) {
        alert(`Customer "${bp.Name}" tidak memiliki Price List aktif.\nHarga produk mungkin tidak akurat.`, 'Price List Tidak Ditemukan');
      }
  
      setCustomer({
        C_BPartner_ID: bpId,
        Name: bp.Name,
        locationId,
        priceListId,
        priceListVersionId,   // ← simpan ini di state customer
      });
    } catch (err) {
      console.error('Gagal fetch lokasi customer:', err.message);
      setCustomer({ C_BPartner_ID: bpId, Name: bp.Name, locationId: null });
    }
  };

  const handleClearCustomer = () => {
    setCustomer(null);
    setCustomerQuery('');
  };

  const handleSubmit = async (submitMode) => {
    if (!customer?.C_BPartner_ID || !customer?.locationId) {
      alert('Pilih customer dulu sebelum submit invoice.', 'Data Belum Lengkap');
      return;
    }
    if (!bankAccountId) {
      alert('Pilih rekening bank dulu sebelum submit invoice.', 'Data Belum Lengkap');
      return;
    }
    if (!dateInvoiced) {
      alert('Tanggal invoice belum diisi.', 'Data Belum Lengkap');
      return;
    }
    const result = await submitInvoice(cart, {
      customerId:         customer.C_BPartner_ID,
      customerLocationId: customer.locationId,
      customerName:       customer.Name,
      bankAccountId,
      dateInvoiced,          // ← BARU
      submitMode,
      editInvoiceId,
    });
    if (!result) return;
  
    setSubmitModalOpen(false);
    setSuccessData([result]);
    setSuccessOpen(true);
    clearCart();
    setCartOpen(false);
    setDescription('');
    setCustomerQuery('');
    setBankAccountId(null);
    setCustomer(null);
    setEditInvoiceId(null);
    setEditInvoiceDocNo(null);
    setEditInvoiceStatus(null);
    setDateInvoiced(todayLocalISO());
  };

  const isNotToday = dateInvoiced !== todayLocalISO();
  const cartSummaryRight =
    (customer?.Name ? `👤 ${customer.Name}` : '👤 Belum dipilih') +
    (isNotToday && dateInvoiced ? ` · 📅 ${formatDateID(dateInvoiced)}` : '');

  return (
    <div style={{
      flex: 1, minHeight: 0, background: COLOR.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
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
        confirmLabel="Tambah ke Invoice"
      />

      <SalesInvoiceSubmitModal
        isOpen={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
        onDraft={() => handleSubmit('draft')}
        onComplete={() => handleSubmit('complete')}
        customerName={customer?.Name}
        isSubmitting={isSubmitting}
        totalAmount={totalAmount}
      />

      <SalesInvoiceSuccessModal
        isOpen={successOpen}
        data={successData}
        onClose={() => {
          setSuccessOpen(false);
          setSuccessData(null);
          fetchProducts('', null, customer?.priceListVersionId);
          setSearchValue('');
          setTimeout(() => searchRef.current?.focus(), 150);
        }}
      />

      <BarcodeScanner
        isOpen={scannerOpen}
        onDetected={handleBarcodeDetected}
        onClose={() => setScannerOpen(false)}
      />     
      {/* Top Bar + Customer Search + Description + Bank + Tanggal Invoice */}
      <div
        className="header-content"
        style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
          height: 'auto', minHeight: '48px', padding: '6px 14px',
          overflow: 'visible', position: 'relative', zIndex: 20, // supaya dropdown customer tidak terpotong
        }}
      >
        <span style={{
          color: '#0c0101', fontWeight: 700, fontSize: '15px', flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', gap: '6px',
        }}>
          <ShoppingCartIcon />
          <span>Sales Invoice</span>
        </span>
      
        {/* Customer search inline */}
        <div ref={customerBoxRef} style={{ 
          position: 'relative', 
          flex: '1 1 200px', 
          minWidth: '180px', 
          maxWidth: '320px' 
          }}>
          <input
            type="text"
            value={customerQuery}
            onChange={e => {
              setCustomerQuery(e.target.value);
              setCustomerOpen(true);
              searchCustomer(e.target.value);
              if (customer) setCustomer(null); // mengetik lagi = batalkan pilihan lama
            }}
            onFocus={() => setCustomerOpen(true)}
            placeholder="Cari customer..."
            style={{
              width: '100%', boxSizing: 'border-box', padding: '3px 10px 3px 10px',
              border: `1.5px solid ${customer ? COLOR.success : 'rgba(255,255,255,0.3)'}`,
              borderRadius: RADIUS.sm, fontSize: '12px', outline: 'none', background: '#fff',
              color: COLOR.textDk,
            }}
          />
          {customer && (
            <button
              onClick={handleClearCustomer}
              title="Ganti customer"
              style={{
                position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: COLOR.textLt, fontSize: '14px',
              }}
            >✕</button>
          )}
      
          {customerOpen && customerQuery && !customer && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
              background: COLOR.surface, border: `1px solid ${COLOR.border}`,
              borderRadius: RADIUS.md, boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
              maxHeight: '220px', overflowY: 'auto', zIndex: 200,
            }}>
              {customerLoading ? (
                <div style={{ padding: '10px', fontSize: '12px', color: COLOR.textLt }}>Mencari...</div>
              ) : customers.length === 0 ? (
                <div style={{ padding: '10px', fontSize: '12px', color: COLOR.textLt }}>Customer tidak ditemukan.</div>
              ) : (
                customers.map(c => (
                  <div
                    key={c.id ?? c.C_BPartner_ID}
                    onClick={() => handleSelectCustomer(c)}
                    style={{ padding: '8px 12px', fontSize: '12px', cursor: 'pointer', color: COLOR.textDk }}
                    onMouseDown={e => e.preventDefault()}
                  >
                    <strong>{c.Name}</strong> {c.Value ? <span style={{ color: COLOR.textLt }}>({c.Value})</span> : null}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <button
            onClick={() => setImportShipmentOpen(true)}
            disabled={!customer}
            title={!customer ? 'Pilih customer dulu' : 'Import dari Shipment'}
            style={{ background: !customer ? '#9ca3af' : COLOR.primary, border: 'none', color: '#130101', borderRadius: RADIUS.md, padding: '10px 14px', cursor: !customer ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '13px', flexShrink: 0 }}
          >
            📥 Import DO
          </button>
          {/* Description (PO Reference) — Diberi marginLeft: 'auto' agar semua elemen setelah ini ikut terdorong ke kanan */}
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={SALES_INVOICE_CONFIG.DESCRIPTION}
            style={{
              marginLeft: 'auto', // 👈 Pindahkan 'auto' ke sini! Mendorong grup ini ke paling kanan
              flex: '0 1 180px',   // flex '0 1' agar ukurannya stabil dan tidak membesar memenuhi ruang kosong
              minWidth: '140px', 
              maxWidth: '200px', 
              boxSizing: 'border-box',
              padding: '3px 10px', 
              border: '1.5px solid rgba(255,255,255,0.3)',
              borderRadius: RADIUS.sm, 
              fontSize: '12px', 
              color: COLOR.textDk, 
              outline: 'none', 
              background: '#fff',
            }}
          />

          {/* Rekening bank — otomatis ikut ke kanan di samping PO Reference */}
          {supportsBankAccount && (
            <select
              value={bankAccountId ?? ''}
              onChange={e => setBankAccountId(e.target.value ? parseInt(e.target.value, 10) : null)}
              style={{
                minWidth: '160px', 
                boxSizing: 'border-box', 
                padding: '5px 10px', // disesuaikan agar tinggi sama dengan input lainnya
                border: `1.5px solid ${bankAccountId ? COLOR.success : 'rgba(255,255,255,0.3)'}`,
                borderRadius: RADIUS.sm, 
                fontSize: '12px', 
                color: COLOR.textDk,
                outline: 'none', 
                background: '#fff',
              }}
            >
              <option value="">
                {bankAccountsLoading ? 'Memuat rekening...' : '— Pilih Rekening Bank —'}
              </option>
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}{b.isDefault ? ' (Default)' : ''}
                </option>
              ))}
            </select>
          )}

          {/* Tanggal Invoice — hapus marginLeft: 'auto' dari sini */}
          <input
            type="date"
            value={dateInvoiced}
            onChange={e => setDateInvoiced(e.target.value)}
            onBlur={e => { if (!e.target.value) setDateInvoiced(todayLocalISO()); }}
            title="Tanggal Invoice (DateInvoiced)"
            style={{
              /* marginLeft: 'auto' -> Dihapus dari sini */
              background: isNotToday ? 'rgba(251,191,36,0.30)' : 'rgba(255,255,255,0.18)',
              border: `1px solid ${isNotToday ? '#fbbf24' : 'rgba(255,255,255,0.3)'}`,
              borderRadius: '3px',
              padding: '3px 10px',
              fontSize: '11px',
              color: '#e0eaff',
              cursor: 'pointer',
              outline: 'none',
              maxWidth: isDesktop ? '150px' : '125px',
              colorScheme: 'dark',
            }}
          />
      </div>
      {loadingEditInvoice && (
        <div style={{
          background: '#e0f2fe', color: '#075985', fontSize: '12px', fontWeight: 600,
          padding: '8px 14px', textAlign: 'center', flexShrink: 0,
        }}>
          ⏳ Memuat data Invoice untuk diedit...
        </div>
      )}

      {editInvoiceId && !loadingEditInvoice && (
        <div style={{
          background: '#fff3cd', color: '#856404', fontSize: '12px', fontWeight: 600,
          padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid #ffe69c', flexShrink: 0,
        }}>
          <span>✏️ Mode Edit — Invoice {editInvoiceDocNo}</span>
          <button
            onClick={handleCancelEditInvoice}
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
        
          {/* Search Produk + Scan */}
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
                onChange={e => search(e.target.value, null, customer?.priceListVersionId)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fetchProducts(searchValue.trim(), null, customer?.priceListVersionId); } }}
                placeholder="Cari nama / kode produk..."
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 34px',
                  border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.md,
                  fontSize: '14px', color: COLOR.textDk, background: COLOR.bg, outline: 'none',
                }}
              />
              {searchValue && (
                <button
                onClick={() => { setSearchValue(''); fetchProducts('', null, customer?.priceListVersionId); }}
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
            ) : productsEnriched.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: COLOR.textLt }}>
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>🧾</div>
                <p style={{ margin: 0 }}>Tidak ada produk ditemukan.</p>
              </div>
            ) : (
              <>
                <div style={{ fontSize: '12px', color: COLOR.textLt, marginBottom: '8px' }}>
                  {productsEnriched.length} produk ditemukan
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isDesktop ? 'repeat(auto-fill, minmax(170px, 1fr))' : 'repeat(2, 1fr)',
                  gap: '10px',
                }}>
                  {productsEnriched.map((p, idx) => (
                    <ProductCard key={`${p.M_Product_ID}-${idx}`} product={p} onClick={openProductDetail} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <SalesInvoiceImportFromShipment
          isOpen={importShipmentOpen}
          onClose={() => setImportShipmentOpen(false)}
          customerId={customer?.C_BPartner_ID}
          customerName={customer?.Name}
          onImport={handleImportFromShipment}
        />
        {isDesktop && (
          <SICartSidebar
            isOpen={cartOpen}
            onClose={() => setCartOpen(false)}
            title="🧾 Sales Invoice"
            items={cart}
            onRemove={removeItem}
            onQtyChange={updateQty}
            onPriceChange={handlePriceChange}
            priceLocked={!canEditPrice}
            priceHidden={priceHidden}
            onUomChange={handleCartUomChange}
            onClearCart={clearCart}
            totalItems={totalItems}
            totalAmount={totalAmount}
            summaryRight={cartSummaryRight}
            customerName={customer?.Name}
            onSubmit={() => setSubmitModalOpen(true)}
            isSubmitting={isSubmitting}
            description={description}
            onLineDescriptionChange={updateDescription}  
            onDateServiceChange={updateDateService}   
            showDateService={supportsDateService}  
            descriptionPlaceholder={SALES_INVOICE_CONFIG.DESCRIPTION}
          />
        )}
      </div>

      {!isDesktop && totalItems > 0 && !cartOpen && (
        <CartFab count={totalItems} label="Invoice" icon="🧾" onClick={() => setCartOpen(true)} />
      )}

      {!isDesktop && (
        <SICartPanel
          isOpen={cartOpen}
          onClose={() => setCartOpen(false)}
          title="🧾 Sales Invoice"
          items={cart}
          onRemove={removeItem}
          onQtyChange={updateQty}
          onPriceChange={handlePriceChange}
          priceLocked={!canEditPrice}
          priceHidden={priceHidden}
          onUomChange={handleCartUomChange}
          onClearCart={clearCart}
          totalItems={totalItems}
          totalAmount={totalAmount}
          summaryRight={cartSummaryRight}
          customerName={customer?.Name}
          onSubmit={() => setSubmitModalOpen(true)}
          isSubmitting={isSubmitting}
          description={description}
          onLineDescriptionChange={updateDescription}  
          onDateServiceChange={updateDateService}   
          showDateService={supportsDateService}  
          descriptionPlaceholder={SALES_INVOICE_CONFIG.DESCRIPTION}
        />
      )}
    </div>
  );
};

export default SalesInvoiceContainer;
