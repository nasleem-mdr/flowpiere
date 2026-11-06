import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from "react-router-dom";
import { usePOSOrderSubmit }   from '@/features/sales/order/hooks/usePOSOrderSubmit';
import { usePOSPaymentSubmit } from '@/features/sales/order/hooks/usePOSPaymentSubmit';
import { usePOSARSubmit } from '@/features/sales/order/hooks/usePOSARSubmit';
import { useSalesOrderSubmit }    from '@/features/sales/order/hooks/useSalesOrderSubmit';
import { useSalesShipmentSubmit } from '@/features/sales/order/hooks/useSalesShipmentSubmit';
import DOModal from '@/features/sales/order/components/DOModal';
import DOSuccessModal from '@/features/sales/order/components/DOSuccessModal';
import { 
    ConfirmModal, 
    PaymentModal, 
    ARModal, 
    ReceiptModal, 
    CartItemPOS,
} from '@/features/sales/order/components';
import { 
    ProductCard, 
    ShoppingCartIcon, 
    SearchBar, 
    ScanIcon, 
    ProductGrid, 
    CartPanel, 
    CartSidebar, 
    BarcodeScanner,
} from '@/shared/components';
import { useAccess } from '@/context/AccessContext';
import { idempiereApi, fkId } from '@/api/idempiereApi';
import { 
    useIsDesktop, 
    useScannerInput, 
    getLoginInfo, 
} from '@/shared/hooks';
import '@/css/Header.css';
// Key window POS untuk pembatasan field (kolom RestrictedFields di AD_Role),
// mis. "pos.PriceEntered". Samakan dengan key di windowAccessMap / CartItemPOS.
const POS_WINDOW_KEY = 'posOrder';

// ─── Tombol DO: pengaman Order yang sudah dibuat tapi belum tuntas ──────────
// Sama pola SalesOrderContainer — disimpan di localStorage supaya tidak hilang
// saat refresh / login ulang (401). Key dipisah dari halaman Sales Order.
const DO_AWAITING_KEY = 'pos_do_awaiting_orders';
const loadAwaiting = () => { try { return JSON.parse(localStorage.getItem(DO_AWAITING_KEY) || '[]'); } catch { return []; } };
const saveAwaiting = (list) => { try { localStorage.setItem(DO_AWAITING_KEY, JSON.stringify(list)); } catch { /* abaikan */ } };
const AWAITING_LABEL = {
    approval: 'menunggu approval (workflow) — jangan submit ulang',
    shipment: 'sudah Complete, Shipment belum terbuat',
    unknown:  'status belum pasti — cek dulu sebelum submit ulang',
};
const refCode = (v) => (v && typeof v === 'object' ? v.id : v);
const isAuthError = (e) => /\b401\b/.test(e?.message || '');
const describeError = (err, prefix) => isAuthError(err)
    ? `${prefix}\n\nSesi login habis (HTTP 401). Login ulang, lalu tekan "Cek status" pada banner DO. Jangan submit ulang sebelum status SO dicek.`
    : `${prefix}\n${err?.message || err}`;

const POSContainer = () => {
    // 1. State untuk kontrol Loading & Data POS
    const [posConfig, setPosConfig]               = useState(null);
    const [cart, setCart]                         = useState([]);
    const [products, setProducts]                 = useState([]);
    const [loading, setLoading]                   = useState(true);
    const [currentVersionId, setCurrentVersionId] = useState(null);
    const [versionMissing, setVersionMissing]     = useState(false);
    const [bPartnerList, setBPartnerList]   = useState([]);
    const [priceListList, setPriceListList] = useState([]);
    const [selectedBPartner, setSelectedBPartner] = useState(null);
    const [selectedPriceList, setSelectedPriceList] = useState(null);

    const {
        isProcessingCheckout,
        currentOrderData,
        setCurrentOrderData,
        submitOrder,
    } = usePOSOrderSubmit({ posConfig, cart, selectedBPartner, selectedPriceList });
    const {
        isSettlingPayment,
        completeAndSettle,
    } = usePOSPaymentSubmit();
    const {
        isProcessingAR,
        completeAsAR,
    } = usePOSARSubmit();

    // ─── DO (Delivery Order): Sales Order + Shipment saja, tanpa Payment/Invoice ──
    const [doDocTypeId, setDoDocTypeId]             = useState(null);
    const [doLocatorId, setDoLocatorId]             = useState(null);
    const [doSuccessModal, setDoSuccessModal]       = useState(null);
    const [awaitingList, setAwaitingList]           = useState(loadAwaiting);
    const [isProcessingDO, setIsProcessingDO]       = useState(false);
    const submitLockRef = useRef(false); // sinkron — klik ke-2 langsung ditolak
    const [isDOModalOpen, setIsDOModalOpen]       = useState(false);
    const {
        submitOrder: submitSalesOrder,
        completeOrder: completeSalesOrder,
        isSubmitting: isSubmittingSalesOrder,
    } = useSalesOrderSubmit({
        docTypeId: doDocTypeId,
        description: 'Sales Order - Batch Invoice',
        onError: (msg, title) => triggerAlert(msg, title),
    });
    const { createShipmentFromOrder, isSubmitting: isSubmittingShipment } = useSalesShipmentSubmit();
    const [editOrderId, setEditOrderId] = useState(null); // ID order draft yang sedang diedit
    const [isEditMode, setIsEditMode]   = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const [isCartOpen, setIsCartOpen] = useState(false);
    const { canEdit, canEditField } = useAccess();
    const canSubmitRequisition = canEdit('requisition');
    // Pembatasan field: false jika role ini dilarang mengubah PriceEntered
    // (atau aturan belum selesai dimuat → fail-closed sementara).
    const canEditPrice = canEditField(POS_WINDOW_KEY, 'PriceEntered');
    const [scannerOpen, setScannerOpen] = useState(false);
    const [offset, setOffset]           = useState(0);
    const [hasMore, setHasMore]         = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const pageSize = 20;
    const [isARModalOpen, setIsARModalOpen] = useState(false);
    const DIALOG_CLOSED = {
        isOpen: false,
        mode: "alert",
        title: "",
        message: "",
        product: null,
        onConfirmAction: null
    };
    const [dialog, setDialog] = useState(DIALOG_CLOSED);
    const triggerAlert = (message, title = "Perhatian", onConfirmAction = null) => {
        setDialog({
            isOpen: true,
            mode: "alert",
            title,
            message,
            product: null,
            onConfirmAction // ← Simpan fungsi redirect ke dashboard di sini jika ada
        });
    };

    const triggerConfirm = (product) => {
        setDialog({
            isOpen:  true,
            mode:    "confirm",
            title:   "Produk Tanpa Harga",
            message: null,
            product,
            onConfirmAction: null // ← Untuk konfirmasi produk biasa, kosongkan saja
        });
    };

    const closeDialog = () => setDialog(DIALOG_CLOSED);

    const uomCacheRef = useRef({});

    // ─── 1. Init (mengambil data C_POS) ──────────────────────────────────────
    useEffect(() => {
        const initPOS = async () => {
            try {
                const { userId: loginUserId, orgId } = getLoginInfo();

                if (!loginUserId) { triggerAlert("Sesi user tidak ditemukan."); setLoading(false); return; }
                if (!orgId) { triggerAlert("Organisasi aktif tidak ditemukan di sesi login. Coba login ulang."); setLoading(false); return; }

                const data = await idempiereApi(
                    `/models/c_pos?$filter=SalesRep_ID eq ${loginUserId} and AD_Org_ID eq ${orgId}`
                );

                if (data?.records?.length > 0) {
                    const terminalConfig = data.records[0];
                    setPosConfig(terminalConfig);
                    const priceListId = terminalConfig.M_PriceList_ID?.id ?? terminalConfig.M_PriceList_ID;
                    if (priceListId) {
                        const plName = terminalConfig.M_PriceList_ID?.identifier || terminalConfig.M_PriceList_ID?.Name || `PriceList #${priceListId}`;
                        setSelectedPriceList({ id: priceListId, name: plName });
                        setOffset(0);
                        await fetchProducts("", priceListId, terminalConfig, "replace", 0);
                    } else {
                        triggerAlert("M_PriceList_ID tidak ditemukan pada konfigurasi terminal.");
                    }

                    const bpId = terminalConfig.C_BPartnerCashTrx_ID?.id ?? terminalConfig.C_BPartnerCashTrx_ID;
                    if (bpId) {
                        const bpName = terminalConfig.C_BPartnerCashTrx_ID?.identifier || terminalConfig.C_BPartnerCashTrx_ID?.Name || `BPartner #${bpId}`;
                        setSelectedBPartner({ id: bpId, name: bpName });
                    }

                    await Promise.all([
                        fetchBPartnerOptions(),
                        fetchPriceListOptions(terminalConfig),
                    ]);
                } else {
                    triggerAlert(
                        `Terminal POS tidak ditemukan untuk SalesRep ID: ${loginUserId} di Org aktif (${orgId}). Pastikan C_POS sudah di-setup untuk Org ini.`,
                        "Perhatian",
                        () => navigate("/dashboard")
                    );
                }
            } catch (err) {
                console.error("Error loading C_POS:", err.message);
                triggerAlert("Gagal memuat POS: " + err.message, "Error");
            } finally {
                setLoading(false);
            }
        };
        initPOS().catch((err) => {
            if (err?.name === 'AbortError') return; // abaikan, ini normal (StrictMode dev / unmount)
            console.error("initPOS gagal:", err.message);
        });
    }, []);

    // ─── DO: resolve DocType Sales Order (SOO) — sama dengan SalesOrderContainer ──
    useEffect(() => {
        const resolveDoDocType = async () => {
            try {
                const dtRes = await idempiereApi(
                    `/models/c_doctype?$select=C_DocType_ID,Name&$filter=DocBaseType eq 'SOO' and IsActive eq true&$orderby=Name`
                );
                const dtList = (dtRes.records || []).map(d => ({ id: fkId(d.C_DocType_ID) ?? d.id, name: d.Name }));
                const standard = dtList.find(d => /standard/i.test(d.name));
                setDoDocTypeId((standard || dtList[0])?.id ?? null);
            } catch (err) {
                console.warn("Gagal resolve DocType Sales Order untuk DO:", err.message);
            }
        };
        resolveDoDocType();
    }, []);

    // ─── DO: resolve Locator default dari Warehouse terminal POS ─────────────
    useEffect(() => {
        const warehouseId = posConfig?.M_Warehouse_ID?.id ?? posConfig?.M_Warehouse_ID;
        if (!warehouseId) return;
        const resolveLocator = async () => {
            try {
                const defRes = await idempiereApi(
                    `/models/m_locator?$select=M_Locator_ID&$filter=M_Warehouse_ID eq ${warehouseId} and IsDefault eq true and IsActive eq true&$top=1`
                );
                const defRecords = Array.isArray(defRes.records) ? defRes.records : [];
                if (defRecords.length > 0) {
                    setDoLocatorId(fkId(defRecords[0].M_Locator_ID) ?? defRecords[0].id);
                    return;
                }
                const anyRes = await idempiereApi(
                    `/models/m_locator?$select=M_Locator_ID&$filter=M_Warehouse_ID eq ${warehouseId} and IsActive eq true&$top=1`
                );
                const anyRecords = Array.isArray(anyRes.records) ? anyRes.records : [];
                setDoLocatorId(anyRecords[0] ? (fkId(anyRecords[0].M_Locator_ID) ?? anyRecords[0].id) : null);
            } catch {
                setDoLocatorId(null);
            }
        };
        resolveLocator();
    }, [posConfig]);

    // ─── Load draft order jika dari SalesOrderPage ────────────────────────────
    useEffect(() => {
        if (!posConfig) return;

        const editOrder = location.state?.editOrder;
        if (!editOrder) return;

        const loadDraftOrder = async () => {
            try {
                setLoading(true);
                const orderId = editOrder.id ?? editOrder.C_Order_ID;
                setEditOrderId(orderId);
                setIsEditMode(true);

                const bpId   = editOrder.C_BPartner_ID?.id ?? editOrder.C_BPartner_ID;
                const bpName = editOrder.C_BPartner_ID?.identifier || editOrder.C_BPartner_ID?.Name || `BPartner #${bpId}`;
                if (bpId) setSelectedBPartner({ id: bpId, name: bpName });

                const plId   = editOrder.M_PriceList_ID?.id ?? editOrder.M_PriceList_ID;
                const plName = editOrder.M_PriceList_ID?.identifier || `PriceList #${plId}`;
                if (plId) setSelectedPriceList({ id: plId, name: plName });

                const linesRes = await idempiereApi(
                    `/models/c_orderline?$filter=C_Order_ID eq ${orderId}` +
                    `&$select=C_OrderLine_ID,M_Product_ID,QtyEntered,PriceActual,PriceEntered,C_UOM_ID`
                );
                const lines = Array.isArray(linesRes.records) ? linesRes.records : [];

                const cartItems = lines.map((line) => {
                    const productId   = line.M_Product_ID?.id   ?? line.M_Product_ID;
                    const productName = line.M_Product_ID?.identifier || line.M_Product_ID?.Name || `Product #${productId}`;
                    const uomId       = line.C_UOM_ID?.id   ?? line.C_UOM_ID;
                    const uomName     = line.C_UOM_ID?.identifier || line.C_UOM_ID?.Name || "EA";
                    const price       = parseFloat(line.PriceActual || line.PriceEntered || 0);
                    const qty         = parseFloat(line.QtyEntered || 1);
                    const lineId      = line.id ?? line.C_OrderLine_ID;

                    const selectedUOM = { id: uomId, name: uomName, multiplyRate: 1 };

                    return {
                        C_OrderLine_ID: lineId,
                        M_Product_ID:   productId,
                        Name:           productName,
                        Value:          "",
                        PriceEntered:    price,
                        basePrice:      price,
                        Qty:            qty,
                        QtyEntered:     qty,
                        defaultUOM:     selectedUOM,
                        uomOptions:     [selectedUOM],
                        selectedUOM,
                    };
                });

                setCart(cartItems);

            } catch (err) {
                console.error("Gagal load draft order:", err.message);
            } finally {
                setLoading(false);
            }
        };

        loadDraftOrder().catch((err) => {
            if (err?.name === 'AbortError') return;
            console.error("Gagal load draft order:", err.message);
        });
    }, [posConfig]); // ← trigger setelah posConfig ready

    // ─── 1b. Fetch opsi BPartner untuk combobox ──────────────────────────────
    const fetchBPartnerOptions = async () => {
        try {
            const res = await idempiereApi(
                `/models/c_bpartner?$filter=IsActive eq true and IsCustomer eq true&$select=C_BPartner_ID,Name&$orderby=Name&$top=100`
            );
            const records = Array.isArray(res.records) ? res.records : [];
            const options = records.map(bp => ({
                id:   bp.C_BPartner_ID?.id ?? bp.C_BPartner_ID ?? bp.id,
                name: bp.Name,
            })).filter(o => o.id);
            setBPartnerList(options);
        } catch (err) {
            console.warn("Gagal fetch BPartner list:", err.message);
        }
    };

    // ─── 1c. Fetch opsi PriceList untuk combobox ─────────────────────────────
    const fetchPriceListOptions = async (terminalConfig) => {
        try {
            const config  = terminalConfig || posConfig;
            const adOrgId = config?.AD_Org_ID?.id ?? config?.AD_Org_ID;
            const filter  = adOrgId
                ? `IsActive eq true and (AD_Org_ID eq 0 or AD_Org_ID eq ${adOrgId})`
                : `IsActive eq true`;
            const res = await idempiereApi(
                `/models/m_pricelist?$filter=${filter}&$select=M_PriceList_ID,Name&$orderby=Name&$top=50`
            );
            const records = Array.isArray(res.records) ? res.records : [];
            const options = records.map(pl => ({
                id:   pl.M_PriceList_ID?.id ?? pl.M_PriceList_ID ?? pl.id,
                name: pl.Name,
            })).filter(o => o.id);
            setPriceListList(options);
        } catch (err) {
            console.warn("Gagal fetch PriceList:", err.message);
        }
    };

    // ─── 1d. Handler ganti BPartner ──────────────────────────────────────────
    const handleBPartnerChange = (e) => {
        const id   = parseInt(e.target.value, 10);
        const name = e.target.options[e.target.selectedIndex].text;
        setSelectedBPartner({ id, name });
    };

    // ─── 1e. Handler ganti PriceList → reload produk ─────────────────────────
    const handlePriceListChange = async (e) => {
        const id   = parseInt(e.target.value, 10);
        const name = e.target.options[e.target.selectedIndex].text;
        setSelectedPriceList({ id, name });
        setOffset(0);
        try {
            await fetchProducts("", id, null, "replace", 0);
        } catch (err) {
            if (err?.name !== 'AbortError') console.error(err);
        }
    };

    // Ambil M_PriceList_Version_ID aktif dari sebuah price list
    const fetchActiveVersionId = async (priceListId, signal) => {
        const versionRes = await idempiereApi(
            `/models/m_pricelist_version?$filter=M_PriceList_ID eq ${priceListId}` +
            ` and IsActive eq true&$orderby=ValidFrom desc&$top=1`,
            { signal }
        );
        return versionRes?.records?.[0]?.id
            || versionRes?.records?.[0]?.M_PriceList_Version_ID?.id
            || versionRes?.records?.[0]?.M_PriceList_Version_ID
            || null;
    };

    // Ambil priceListId aktif (helper internal)
    const getActivePriceListId = () =>
        selectedPriceList?.id || posConfig?.M_PriceList_ID?.id || posConfig?.M_PriceList_ID;

    // 7a. Fetch produk by barcode — cari exact match di field Value (SKU/barcode iDempiere)
    const fetchProductByBarcode = async (barcode) => {
        const priceListId = getActivePriceListId();
        if (!priceListId) return null;

        const versionId = await fetchActiveVersionId(priceListId);
        if (!versionId) return null;

        const safeBarcode = barcode.replace(/'/g, "''").toUpperCase();
        const productRes  = await idempiereApi(
            `/models/m_product?$select=M_Product_ID,Name,Value,UPC,ProductType,C_UOM_ID,IsPhantom,IsVerified` +
            `&$filter=IsSold eq true and IsActive eq true and ` +
            `(toupper(Value) eq '${safeBarcode}' or toupper(UPC) eq '${safeBarcode}')&$top=1`
        );
        const productRec = productRes?.records?.[0];
        if (!productRec) return null;
        const pId = productRec.M_Product_ID?.id ?? productRec.M_Product_ID ?? productRec.id;

        const priceRes = await idempiereApi(
            `/models/m_productprice?$filter=M_PriceList_Version_ID eq ${versionId} and M_Product_ID eq ${pId}&$select=M_Product_ID,PriceStd&$top=1`
        );
        const priceRec = priceRes?.records?.[0];

        const defaultUOM = {
            id:           productRec.C_UOM_ID?.id ?? productRec.C_UOM_ID,
            name:         productRec.C_UOM_ID?.Name || productRec.C_UOM_ID?.identifier || 'EA',
            multiplyRate: 1,
        };

        return {
            M_Product_ID: pId,
            Name:         productRec.Name,
            Value:        productRec.Value,
            UPC:          productRec.UPC,
            PriceActual:  priceRec?.PriceStd ?? 0,
            basePrice:    priceRec?.PriceStd ?? 0,
            ProductType:  productRec.ProductType?.id ?? productRec.ProductType ?? null,
            IsPhantom:    productRec.IsPhantom === true || productRec.IsPhantom === 'Y',
            IsVerified:   productRec.IsVerified === true || productRec.IsVerified === 'Y',
            defaultUOM,
        };
    };
    useEffect(() => {
        const t = setTimeout(() => scanInputRef.current?.focus(), 150);
        return () => clearTimeout(t);
      }, []);
    // ── Search + Scan unified (pola sama seperti RequisitionContainer) ──
    const {
        value: searchInput,
        inputRef: scanInputRef,
        handleChange: handleSearchInputChange,
        handleKeyDown: handleSearchKeyDown,
        reset: resetSearchInput,
    } = useScannerInput({
        onScanDetected: (code) => handleBarcodeDetectedRef.current(code), // via ref, hindari TDZ
        onManualSearch: (value) => {
            setOffset(0);
            fetchProducts(value, getActivePriceListId(), null, 'replace', 0)
                .catch((err) => { if (err?.name !== 'AbortError') console.error(err); });
        },
    });

    const handleBarcodeDetected = useCallback(async (code) => {
        setScannerOpen(false);
        const trimmed = code.trim();
        if (!trimmed) return;

        const priceListId = getActivePriceListId();

        try {
            // Langkah 1: exact match barcode/SKU (field Value)
            const barcodeProduct = await fetchProductByBarcode(trimmed);
            if (barcodeProduct) {
                await addToCart(barcodeProduct);   // sudah otomatis nambah qty kalau produk sama
                resetSearchInput();
                setOffset(0);
                await fetchProducts('', priceListId, null, 'replace', 0); // reset grid ke tampilan normal
                scanInputRef.current?.focus();
                return;
            }

            // Langkah 2: tidak exact match → fallback filter teks, biarkan input tetap terisi
            setOffset(0);
            await fetchProducts(trimmed, priceListId, null, 'replace', 0);
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error('Gagal proses barcode:', err.message);
            triggerAlert('Gagal memproses barcode: ' + err.message, 'Error');
        }
        // ⬇️ FIX: `cart` ditambahkan — addToCart membaca `cart` lewat closure untuk
        // menentukan existingIndex (nambah qty vs item baru). Tanpa `cart` di deps,
        // handleBarcodeDetected bisa memakai versi `addToCart` yang basi saat scan
        // berturut-turut, berisiko qty tidak ter-update dengan benar.
        // ⬇️ `canEditPrice` ditambahkan — addToCart membacanya (blok harga 0); tanpa
        // ini scan bisa memakai nilai lama sebelum aturan RestrictedFields selesai dimuat.
    }, [cart, selectedPriceList, posConfig, resetSearchInput, canEditPrice]);

    // ref jembatan — sama persis pola di RequisitionContainer
    const handleBarcodeDetectedRef = useRef(handleBarcodeDetected);
    useEffect(() => {
        handleBarcodeDetectedRef.current = handleBarcodeDetected;
    }, [handleBarcodeDetected]);

    // Ambil produk + harga + stok berdasarkan filter & version yang sudah diketahui.
    const resolveProducts = async (productFilter, versionId, config, signal, top = 20, skip = 0) => {
        const [priceData, productData] = await Promise.all([
            idempiereApi(
                `/models/m_productprice?$filter=M_PriceList_Version_ID eq ${versionId}` +
                `&$select=M_Product_ID,PriceStd`,
                { signal }
            ),
            idempiereApi(
                `/models/m_product?$select=M_Product_ID,Name,Value,UPC,C_UOM_ID,M_Product_Category_ID,ProductType,IsPhantom,IsVerified` +
                `&$filter=${productFilter}&$top=${top}&$skip=${skip}`,
                { signal }
            ),
        ]);

        const productRecords = Array.isArray(productData.records)
            ? productData.records
            : productData.records ? [productData.records] : [];

        const relevantIds = new Set(productRecords.map(p => p.M_Product_ID?.id ?? p.M_Product_ID ?? p.id));
        const rawPriceRecords = Array.isArray(priceData.records)
            ? priceData.records
            : priceData.records ? [priceData.records] : [];

        const priceMap = new Map();
        rawPriceRecords
            .filter(p => relevantIds.has(p.M_Product_ID?.id ?? p.M_Product_ID))
            .forEach(p => {
                const pid = p.M_Product_ID?.id ?? p.M_Product_ID;
                if (pid != null) priceMap.set(pid, p.PriceStd);
            });

        // Kirim juga flag IsPhantom per produk — fetchQtyOnHandBatch yang
        // menentukan apakah stoknya diambil langsung dari M_Storage atau
        // diturunkan dari component BOM-nya (lihat catatan di fungsi itu).
        const productsInfo = productRecords.map(p => ({
            id:        p.M_Product_ID?.id ?? p.M_Product_ID ?? p.id,
            isPhantom: p.IsPhantom === true || p.IsPhantom === 'Y',
        }));
        const qtyOnHandMap = await fetchQtyOnHandBatch(productsInfo, config);

        const list = productRecords.map((p) => {
            const pId  = p.M_Product_ID?.id ?? p.M_Product_ID ?? p.id;
            const price = priceMap.get(pId);
            if (price === undefined) return null;
            const uomName = p.C_UOM_ID?.Name || p.C_UOM_ID?.identifier || 'EA';

            return {
                M_Product_ID:    pId,
                Name:            p.Name,
                Value:           p.Value,
                PriceActual:     price ?? 0,
                basePrice:       price ?? 0,
                C_UOM_Name:      uomName,
                defaultUOM: {
                    id:           p.C_UOM_ID?.id ?? p.C_UOM_ID,
                    name:         uomName,
                    multiplyRate: 1,
                },
                ProductCategory: {
                    id:   p.M_Product_Category_ID?.id ?? p.M_Product_Category_ID,
                    name: p.M_Product_Category_ID?.Name || p.M_Product_Category_ID?.identifier || 'N/A',
                },
                ProductType:  p.ProductType?.id ?? p.ProductType ?? null,
                IsPhantom:    p.IsPhantom === true || p.IsPhantom === 'Y',
                IsVerified:   p.IsVerified === true || p.IsVerified === 'Y',
                QtyOnHand:    qtyOnHandMap.get(pId) ?? 0,
            };
        }).filter(Boolean);

        return { list, count: productRecords.length };
    };

    // ─── 2. Fetch products ────────────────────────────────────────────────────
    const isDesktop = useIsDesktop();
    const abortRef = useRef(null);
    const MAX_SCAN_ROUNDS = 10; // maksimal 10 x pageSize = 200 produk mentah di-scan per aksi

    const fetchProducts = async (query = "", priceListId = null, terminalConfig = null, mode = "replace", currentOffset = 0) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        mode === "append" ? setLoadingMore(true) : setLoading(true);

        try {
            setVersionMissing(false);

            const config           = terminalConfig || posConfig;
            const rawPriceId       = priceListId || config?.M_PriceList_ID;
            const finalPriceListId = typeof rawPriceId === 'object' ? rawPriceId?.id : rawPriceId;
            if (!finalPriceListId) { console.error("PriceList ID tidak ditemukan"); return; }

            const versionId = await fetchActiveVersionId(finalPriceListId, controller.signal);
            if (!versionId) {
                setCurrentVersionId("NOT_FOUND");
                setVersionMissing(true);
                setProducts([]);
                setHasMore(false);
                return;
            }
            setCurrentVersionId(versionId);

            let productFilter = "IsSold eq true and IsActive eq true";
            if (query) {
                const safeQuery = query.toUpperCase().replace(/'/g, "''");
                productFilter += ` and (contains(toupper(Name),'${safeQuery}') or contains(toupper(Value),'${safeQuery}') or contains(toupper(UPC),'${safeQuery}'))`;
            }

            let skip = currentOffset;
            let collected = [];
            let serverExhausted = false;

            for (let round = 0; round < MAX_SCAN_ROUNDS; round++) {
                const { list, count } = await resolveProducts(productFilter, versionId, config, controller.signal, pageSize, skip);
                skip += count;
                collected = collected.concat(list);

                if (count < pageSize) { serverExhausted = true; break; }
                if (collected.length > 0) break;
            }

            if (!serverExhausted && collected.length === 0) {
                console.warn(`[POS] ${MAX_SCAN_ROUNDS * pageSize} produk di-scan tanpa hasil — mayoritas produk mungkin belum punya M_ProductPrice di version ${versionId}.`);
            }

            setOffset(skip);
            setProducts(prev => mode === "append" ? [...prev, ...collected] : collected);
            setHasMore(!serverExhausted);
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error("Fetch Products Error:", err.message);
            if (mode !== "append") setProducts([]);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const loadMore = useCallback(() => {
        fetchProducts(searchInput, getActivePriceListId(), null, "append", offset)
            .catch((err) => {
                if (err?.name !== 'AbortError') console.error("loadMore gagal:", err.message);
            });
    }, [offset, searchInput, selectedPriceList, posConfig]);

    // ─── 3a. Fetch UOM options untuk satu produk ───────────────────────────────
    const fetchUOMOptions = async (product) => {
        const productId = product.M_Product_ID;

        if (uomCacheRef.current[productId]) {
            return uomCacheRef.current[productId];
        }

        const defaultUomId   = product.defaultUOM?.id ?? null;
        const defaultUomName = product.defaultUOM?.name || 'EA';
        const defaultOption  = { id: defaultUomId, name: defaultUomName, multiplyRate: 1 };

        if (!defaultUomId) {
            uomCacheRef.current[productId] = [defaultOption];
            return [defaultOption];
        }

        const options = [defaultOption];

        const buildOptions = (records) => {
            records.forEach(conv => {
                const toId   = conv.C_UOM_To_ID?.id  ?? conv.C_UOM_To_ID;
                const toName = conv.C_UOM_To_ID?.Name || conv.C_UOM_To_ID?.identifier || `UOM #${toId}`;
                const rate   = conv.MultiplyRate ?? 1;
                if (toId && !options.find(o => o.id === toId)) {
                    options.push({ id: toId, name: toName, multiplyRate: rate });
                }
            });
        };

        try {
            const resProduct = await idempiereApi(
                `/models/c_uom_conversion?$filter=C_UOM_ID eq ${defaultUomId} and M_Product_ID eq ${productId} and IsActive eq true&$select=C_UOM_ID,C_UOM_To_ID,MultiplyRate,M_Product_ID`
            );
            buildOptions(Array.isArray(resProduct.records) ? resProduct.records : []);
        } catch (err) {
            console.warn("Gagal fetch UOM spesifik produk", productId, err.message);
        }

        try {
            const resGlobal = await idempiereApi(
                `/models/c_uom_conversion?$filter=C_UOM_ID eq ${defaultUomId} and IsActive eq true&$select=C_UOM_ID,C_UOM_To_ID,MultiplyRate,M_Product_ID&$top=50`
            );
            const globalRecords = (Array.isArray(resGlobal.records) ? resGlobal.records : [])
                .filter(conv => !conv.M_Product_ID || conv.M_Product_ID === null);
            buildOptions(globalRecords);
        } catch (err) {
            console.warn("Gagal fetch UOM global untuk UOM", defaultUomId, err.message);
        }

        uomCacheRef.current[productId] = options;
        return options;
    };

    // ─── 3b. Fetch QtyOnHand dari M_StorageOnHand (dengan dukungan BOM Phantom) ──
    // Produk BOM Phantom (M_Product.IsPhantom = true) TIDAK PERNAH punya baris
    // M_Storage sendiri — di window iDempiere, Qty-nya otomatis diturunkan dari
    // stok component BOM-nya (M_Product_BOM: M_ProductBOM_ID = component,
    // BOMQty = kebutuhan component per 1 unit produk phantom). Kita tiru
    // logika itu di sini: floor(stokComponent / BOMQty), diambil yang PALING
    // KECIL kalau component-nya lebih dari satu baris (standar availability
    // check BOM).
    //
    // `productsInput` boleh array of plain id (angka) — dianggap semua bukan
    // Phantom, supaya tetap kompatibel dengan pemanggilan lama — ATAU array
    // of { id, isPhantom }.
    //
    // CATATAN: nama model REST `m_product_bom` dan field `M_ProductBOM_ID` /
    // `BOMQty` mengikuti konvensi penamaan tabel standar iDempiere
    // (M_Product_BOM), belum saya verifikasi langsung ke instance Anda. Kalau
    // ternyata REST-nya menolak dengan pesan "X is not a valid column/model"
    // (persis seperti kasus OpenAmt kemarin), kabari saya error persisnya.
    const fetchQtyOnHandBatch = async (productsInput, config) => {
        const cfg         = config || posConfig;
        const warehouseId = cfg?.M_Warehouse_ID?.id ?? cfg?.M_Warehouse_ID;

        const normalized = (productsInput || []).map(p =>
            (typeof p === 'object' && p !== null) ? p : { id: p, isPhantom: false }
        );
        const productIds = normalized.map(p => p.id).filter(Boolean);
        if (!warehouseId || productIds.length === 0) return new Map();

        const phantomEntries = normalized.filter(p => p.isPhantom && p.id);

        try {
            const locatorRes = await idempiereApi(
                `/models/m_locator?$filter=M_Warehouse_ID eq ${warehouseId} and IsActive eq true&$select=M_Locator_ID`
            );
            const locatorIds = (locatorRes.records || [])
                .map(l => l.id ?? l.M_Locator_ID)
                .filter(Boolean);
            if (locatorIds.length === 0) return new Map();
            const locatorOrClause = locatorIds.map(lid => `M_Locator_ID eq ${lid}`).join(' or ');

            // ── Ambil baris BOM untuk semua produk Phantom di batch ini ──────
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
                    console.warn("Gagal fetch M_Product_BOM untuk produk Phantom:", err.message);
                }
            }

            // Stok component BOM bisa saja produk yang TIDAK ada di daftar
            // productIds asli (mis. tidak tampil di grid halaman ini) — gabung.
            const allIds = [...new Set([...productIds, ...componentIds])];
            const productOrClause = allIds.map(pid => `M_Product_ID eq ${pid}`).join(' or ');
            const filter = `(${locatorOrClause}) and IsActive eq true and (${productOrClause})`;

            const res = await idempiereApi(
                `/models/m_storage?$filter=${filter}&$select=M_Product_ID,QtyOnHand`
            );
            const map = new Map();
            (res.records || []).forEach(r => {
                const pid = r.M_Product_ID?.id ?? r.M_Product_ID;
                map.set(pid, (map.get(pid) ?? 0) + parseFloat(r.QtyOnHand || 0));
            });

            // ── Override Qty produk Phantom: MIN dari floor(stokComponent / BOMQty) ──
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
            console.error("Gagal fetch QtyOnHand batch:", err.message);
            return new Map();
        }
    };

    // ─── Pengaman BOM Phantom: struktur BOM harus sudah diverifikasi ──────────
    // Produk Phantom yang BOM-nya belum lewat proses "Verify BOM Structure"
    // (org.compiere.process.BOMVerify, tombol ada di ProductDetail) punya
    // M_Product.IsVerified = N, dan explosion BOM-nya tidak bisa diandalkan.
    // Status dicek ULANG ke server tiap add-to-cart (bukan percaya flag di
    // grid) karena user bisa saja baru selesai verify di halaman lain sementara
    // daftar produk di sini masih cache lama. Return: true | false | null
    // (null = gagal cek, diperlakukan sebagai blokir / fail-closed).
    const fetchIsBomVerified = async (productId) => {
        try {
            const res = await idempiereApi(`/models/m_product/${productId}?$select=IsVerified`);
            return res?.IsVerified === true || res?.IsVerified === 'Y';
        } catch (err) {
            console.error('Gagal cek IsVerified produk #' + productId + ':', err.message);
            return null;
        }
    };

    const addToCart = async (product) => {
        // Pengaman BOM Phantom: BOM belum diverifikasi → tidak boleh masuk keranjang.
        {
            const guardId = product.M_Product_ID?.id ?? product.M_Product_ID;
            if (product.IsPhantom === true || product.IsPhantom === 'Y') {
                const verified = await fetchIsBomVerified(guardId);
                if (verified !== true) {
                    triggerAlert(
                        verified === null
                            ? `Status verifikasi BOM produk "${product.Name}" tidak dapat dicek. Produk tidak dapat ditambahkan ke keranjang, coba lagi.`
                            : `Produk "${product.Name}" adalah produk BOM Phantom yang struktur BOM-nya belum diverifikasi. Buka Master Produk > Detail Produk > Bill of Materials, lalu klik "Verify BOM Structure". Produk tidak dapat ditambahkan ke keranjang.`,
                        "BOM Belum Diverifikasi"
                    );
                    return;
                }
            }
        }

        const productTypeId = product.ProductType?.id ?? product.ProductType;
        const isService = productTypeId === 'S';

        let qtyOnHand = 0;

        if (!isService) {
            const productId = product.M_Product_ID?.id ?? product.M_Product_ID;
            const isPhantom = product.IsPhantom === true || product.IsPhantom === 'Y';
            const stockMap = await fetchQtyOnHandBatch([{ id: productId, isPhantom }]);
            qtyOnHand = stockMap.get(productId) ?? 0;

            if (qtyOnHand <= 0) {
                triggerAlert(
                    `Stok produk "${product.Name}" habis (QtyOnHand = ${qtyOnHand}). Produk tidak dapat ditambahkan ke keranjang.`,
                    "Stok Habis"
                );
                return;
            }
        }

        const existingIndex = cart.findIndex(item => item.M_Product_ID === product.M_Product_ID);
        const existingQty = existingIndex >= 0 ? cart[existingIndex].Qty : 0;
        const targetQty = existingQty + 1;

        if (!isService && targetQty > qtyOnHand) {
            triggerAlert(
                `Stok "${product.Name}" tidak mencukupi. Tersedia: ${qtyOnHand}, di keranjang: ${existingQty}.`,
                "Stok Tidak Cukup"
            );
            return;
        }

        if (product.PriceActual === 0) {
            // Produk tanpa harga di Price List: kasir harus mengisi harga manual.
            // Role yang dilarang mengubah PriceEntered tidak boleh menjual dengan
            // harga Rp 0 — blokir, jangan tawarkan dialog konfirmasi.
            if (!canEditPrice) {
                triggerAlert(
                    `Produk "${product.Name}" belum punya harga di Price List ini, dan role Anda tidak dapat mengubah harga. Hubungi admin.`,
                    "Harga Tidak Tersedia"
                );
                return;
            }
            triggerConfirm(product);
            return;
        }

        const uomOptions  = await fetchUOMOptions(product);
        const selectedUOM = uomOptions[0];

        if (existingIndex >= 0) {
            setCart(prev => prev.map((item, i) =>
                i === existingIndex
                    ? { ...item, Qty: targetQty, QtyOnHand: isService ? 0 : qtyOnHand, isService }
                    : item
            ));
        } else {
            setCart(prev => [...prev, {
                ...product,
                Qty:  1,
                PriceEntered: product.PriceActual,
                basePrice:    product.PriceActual,
                uomOptions,
                selectedUOM,
                QtyOnHand:   isService ? 0 : qtyOnHand,
                isService,
            }]);
        }
    };

    // ─── 5. Handler confirm untuk dialog mode "confirm" ───────────────────────
    const handleDialogConfirm = async () => {
        // Penjaga ganda: dialog ini hanya boleh dibuka untuk role yang boleh ubah harga.
        if (!canEditPrice) {
            closeDialog();
            return;
        }
        const product    = dialog.product;
        const uomOptions = await fetchUOMOptions(product);
        setCart(prev => [...prev, {
            ...product,
            Qty:  1,
            PriceEntered: 0, // FIX: sebelumnya undefined → calculateTotal bisa NaN
            PriceActual: product.PriceActual,
            basePrice:   product.PriceActual,
            uomOptions,
            selectedUOM: uomOptions[0],
        }]);
        closeDialog();
    };

    // ─── 6. Cart handlers ─────────────────────────────────────────────────────
    const removeFromCart = (id) => setCart(prev => prev.filter(i => i.M_Product_ID !== id));

    const calculateTotal = () => cart.reduce((s, i) => s + ((i.PriceEntered ?? 0) * i.Qty), 0);

    const updateCartQty = (productId, rawQty) => {
        const newQty = parseFloat(rawQty);
        if (isNaN(newQty)) return;

        setCart(prev => {
            const item = prev.find(i => i.M_Product_ID === productId);
            if (!item) return prev;
            if (!item.isService) {
                const multiplyRate  = item.selectedUOM?.multiplyRate || 1;
                const qtyOnHandBase = item.QtyOnHand ?? Infinity;
                const qtyOrderedBase = newQty * multiplyRate;

                if (qtyOrderedBase > qtyOnHandBase) {
                    setTimeout(() => {
                        triggerAlert(
                            `Kuantitas melebihi stok untuk "${item.Name}". Stok tersedia: ${qtyOnHandBase} ` +
                            `(setara ${(qtyOnHandBase / multiplyRate).toFixed(2)} ${item.selectedUOM?.name || ''}).`,
                            "Stok Tidak Cukup"
                        );
                    }, 0);
                    return prev;
                }
            }

            if (newQty <= 0) return prev.filter(i => i.M_Product_ID !== productId);

            return prev.map(i => i.M_Product_ID === productId ? { ...i, Qty: newQty } : i);
        });
    };

    const updateCartPrice = (id, value) => {
        // Pembatasan field: role tanpa izin edit PriceEntered tidak boleh mengubah
        // harga, walaupun handler ini terpanggil dari jalur lain selain input.
        if (!canEditPrice) return;
        const price = parseFloat(value);
        if (isNaN(price) || price < 0) return;
        setCart(prev => prev.map(i => i.M_Product_ID === id ? { ...i, PriceEntered: price } : i));
    };

    const updateCartUOM = (id, uomOption) => {
        setCart(prev => prev.map(item => {
            if (item.M_Product_ID !== id) return item;
            return {
                ...item,
                selectedUOM:  uomOption,
                PriceEntered: item.basePrice / uomOption.multiplyRate,
            };
        }));
    };

    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
    const [receiptData, setReceiptData]               = useState(null);

    const handleCheckout = async () => {
        if (cart.length === 0) { triggerAlert("Keranjang masih kosong!"); return; }

        try {
            await submitOrder({ isEditMode, editOrderId });
            setIsPaymentModalOpen(true);
        } catch (err) {
            console.error("Proses POS Checkout Gagal:", err.message);
            triggerAlert("Checkout Gagal: " + err.message, "Error");
        }
    };

    const handleCheckoutCash = async () => {
        if (cart.length === 0) { triggerAlert("Keranjang masih kosong!"); return; }
    
        try {
            await submitOrder({ isEditMode, editOrderId });
            setIsPaymentModalOpen(true);
        } catch (err) {
            console.error("Proses POS Checkout Gagal:", err.message);
            triggerAlert("Checkout Gagal: " + err.message, "Error");
        }
    };
    
    const handleCheckoutAR = async () => {
        if (cart.length === 0) { triggerAlert("Keranjang masih kosong!"); return; }
    
        const cashPartnerId = posConfig?.C_BPartnerCashTrx_ID?.id ?? posConfig?.C_BPartnerCashTrx_ID;
        if (!selectedBPartner || (cashPartnerId && selectedBPartner.id === cashPartnerId)) {
            triggerAlert(
                "Piutang wajib menggunakan Customer spesifik (bukan Customer Cash default POS). " +
                "Pilih Customer dulu di bagian atas sebelum memproses Piutang.",
                "Customer Wajib Dipilih"
            );
            return;
        }
    
        try {
            await submitOrder({ isEditMode, editOrderId });
            setIsARModalOpen(true);
        } catch (err) {
            console.error("Proses Piutang Gagal (submit order):", err.message);
            triggerAlert("Gagal menyiapkan order Piutang: " + err.message, "Error");
        }
    };
    
    const handleConfirmAR = async () => {
        if (!currentOrderData) return;
    
        try {
            const { completedOrder, shipment, invoice } = await completeAsAR(currentOrderData);
            const finalDocNo = completedOrder.DocumentNo || currentOrderData.DocumentNo || completedOrder.id;
    
            setReceiptData({
                documentNo:        finalDocNo,
                date:               new Date().toLocaleString("id-ID"),
                posName:            posConfig?.Name || "POS Terminal",
                cashierName:        posConfig?.SalesRep_ID?.identifier || "-",
                bPartnerName:       selectedBPartner?.name || "-",
                items:              [...cart],
                total:              calculateTotal(),
                payments:           [],
                paymentSettledVia:  'ar',
                invoiceNo:          invoice?.DocumentNo || invoice?.id,
                shipmentNo:         shipment?.DocumentNo || shipment?.id,
            });
    
            setIsARModalOpen(false);
            setCurrentOrderData(null);
            setCart([]);
            setIsEditMode(false);
            setEditOrderId(null);
            setIsReceiptModalOpen(true);
        } catch (err) {
            console.error("Proses Piutang Gagal:", err.message);
            triggerAlert("Eror saat memproses Piutang: " + err.message, "Error");
        }
    };
    // ═══════════════════════════════════════════════════════════════════════
    // DO — Sales Order → Complete → Shipment (TANPA Payment & Invoice)
    // Kemampuan sama dengan "COMPLETE + KIRIM" di SalesOrderContainer.
    // Invoice ditagih lewat proses batch akhir bulan di luar aplikasi ini.
    // ═══════════════════════════════════════════════════════════════════════
    const validateBeforeDO = ({ needLocator = true } = {}) => {
        if (cart.length === 0) { triggerAlert("Keranjang masih kosong!"); return false; }
        const cashPartnerId = posConfig?.C_BPartnerCashTrx_ID?.id ?? posConfig?.C_BPartnerCashTrx_ID;
        if (!selectedBPartner || (cashPartnerId && selectedBPartner.id === cashPartnerId)) {
            triggerAlert(
                "DO ditagih lewat batch akhir bulan, jadi wajib menggunakan Customer spesifik (bukan Customer Cash default POS). " +
                "Pilih Customer dulu di bagian atas.",
                "Customer Wajib Dipilih"
            );
            return false;
        }
        const warehouseId = posConfig?.M_Warehouse_ID?.id ?? posConfig?.M_Warehouse_ID;
        if (!warehouseId) { triggerAlert("Gudang terminal POS belum ditentukan.", "Data Belum Lengkap"); return false; }
        if (!doDocTypeId) { triggerAlert("Document Type Sales Order (DocBaseType 'SOO') aktif tidak ditemukan.", "Konfigurasi Tidak Lengkap"); return false; }
        if (needLocator && !doLocatorId) {
            triggerAlert("Locator default untuk gudang ini belum ditemukan — Shipment tidak bisa dibuat otomatis. Cek setup Locator di Warehouse ini.", "Konfigurasi Tidak Lengkap");
            return false;
        }
        return true;
    };

    // redirect=true: DO selesai & modal sukses akan menutup lalu pindah ke /pos-order,
    const resetAfterDO = ({ redirect = false } = {}) => {
        setCart([]);
        setIsEditMode(false);
        setEditOrderId(null);
        if (redirect) return;
        navigate(location.pathname, { replace: true, state: {} });   // ← sebelumnya "/pos"
        setOffset(0);
        fetchProducts('', getActivePriceListId(), null, 'replace', 0)
            .catch((err) => { if (err?.name !== 'AbortError') console.error(err); });
    };
    const handleDOSuccessClose = () => {
        setDoSuccessModal(null);
        resetAfterDO();              // clear cart, navigate("/pos") + bersihkan state edit, fetchProducts('') → QtyOnHand ter-refresh
        resetSearchInput();
        setTimeout(() => scanInputRef.current?.focus(), 150);
    };

    const getOrderStatus = async (orderId) => {
        const o = await idempiereApi(`/models/c_order/${orderId}?$select=DocStatus,DocumentNo`);
        return { docStatus: refCode(o.DocStatus), documentNo: o.DocumentNo };
    };

    const upsertAwaiting = (orderId, patch) => {
        setAwaitingList(prev => {
            const next = prev.some(i => i.orderId === orderId)
                ? prev.map(i => i.orderId === orderId ? { ...i, ...patch } : i)
                : [...prev, { orderId, documentNo: null, kind: 'unknown', ...patch }];
            saveAwaiting(next);
            return next;
        });
    };

    const removeAwaiting = (orderId) => {
        setAwaitingList(prev => {
            const next = prev.filter(i => i.orderId !== orderId);
            saveAwaiting(next);
            return next;
        });
    };

    // Lock sinkron: hanya 1 proses DO/resume yang boleh jalan pada satu waktu.
    const withLock = async (fn) => {
        if (submitLockRef.current) return;
        submitLockRef.current = true;
        setIsProcessingDO(true);
        try { await fn(); }
        finally { submitLockRef.current = false; setIsProcessingDO(false); }
    };

    // Tentukan langkah berikut berdasarkan DocStatus ASLI di server
    // (bukan dari pesan "timeout" waiter — timeout tidak berarti Complete gagal).
    const settleDOOrder = async (orderId, st, { completeErr = null, fromResume = false } = {}) => {
        const docNo = st.documentNo || `#${orderId}`;
        const done  = () => { if (!fromResume) resetAfterDO(); };

        switch (st.docStatus) {
            case 'CO': {
                let shipmentOk = false;
                upsertAwaiting(orderId, { documentNo: st.documentNo, kind: 'shipment' });
                try {
                    const shipment = await createShipmentFromOrder(orderId, { locatorId: doLocatorId });
                    removeAwaiting(orderId);
                    shipmentOk = true;
                    setDoSuccessModal({
                        mode:          'complete',
                        orderDocNo:    st.documentNo,
                        shipmentId:    shipment.shipmentId,
                        shipmentDocNo: shipment.documentNo,
                        bPartnerName:  selectedBPartner?.name,
                        totalAmount:   calculateTotal(),
                    });
                } catch (err) {
                    console.error("Shipment gagal:", err.message);
                    triggerAlert(
                        describeError(err, `Sales Order ${docNo} sudah Complete, tapi Shipment GAGAL dibuat:`) +
                        `\n\nSO tidak akan dibuat ulang. Tekan "Cek status & lanjutkan" pada banner untuk mengulang Shipment saja.`,
                        "Order Complete, Shipment Gagal"
                    );
                }
                if (!fromResume) resetAfterDO({ redirect: shipmentOk });
                return;
            }
            case 'IP':
                upsertAwaiting(orderId, { documentNo: st.documentNo, kind: 'approval' });
                triggerAlert(
                    `Sales Order ${docNo} sedang menunggu approval (workflow), jadi belum bisa Complete.\n\n` +
                    `JANGAN submit ulang. Setelah disetujui, tekan "Cek status & lanjutkan" pada banner di atas — ` +
                    `Shipment akan dibuat dari SO yang sama.`,
                    "Menunggu Approval"
                );
                done();
                return;
            case 'DR':
            case 'IN':
                removeAwaiting(orderId);
                if (fromResume) {
                    triggerAlert(`SO ${docNo} berstatus Draft. Buka dari daftar Sales Order untuk dilanjutkan.`, "Status Order");
                    return;
                }
                // Tetap Draft → pertahankan cart & kunci ke order ini (mode edit),
                // sehingga klik DO berikutnya meng-update SO yang sama, bukan membuat SO baru.
                setIsEditMode(true);
                setEditOrderId(orderId);
                triggerAlert(
                    `SO ${docNo} tersimpan sebagai Draft tetapi belum berhasil Complete` +
                    `${completeErr ? `:\n${completeErr.message}` : '.'}\n\n` +
                    `Perbaiki penyebabnya lalu klik DO lagi — sistem memakai SO yang sama.`,
                    "Complete Belum Berhasil"
                );
                return;
            default: {
                removeAwaiting(orderId);
                const label = { NA: 'ditolak (Not Approved)', VO: 'di-Void', RE: 'di-Reverse', CL: 'di-Close' }[st.docStatus] || `berstatus ${st.docStatus}`;
                triggerAlert(`SO ${docNo} ${label}. Tidak ada proses lanjutan yang dijalankan.`, "Status Order");
                done();
            }
        }
    };

    // Tombol DO di cart → validasi dasar lalu buka modal pilihan Draft / Complete.
    const handleCheckoutDO = () => {
        if (!validateBeforeDO({ needLocator: false })) return;
        setIsDOModalOpen(true);
    };

    // Order sudah ada (mode edit / retry)? Cek status dulu — kalau sudah CO/IP/final,
    // JANGAN di-submit ulang. Return true bila sudah ditangani settleDOOrder.
    const settleIfNotDraft = async () => {
        if (!(isEditMode && editOrderId)) return false;
        const st = await getOrderStatus(editOrderId);
        if (st.docStatus === 'DR' || st.docStatus === 'IN') return false;
        await settleDOOrder(editOrderId, st);
        return true;
    };

    const buildDOParams = () => ({
        customerId:  selectedBPartner.id,
        warehouseId: posConfig?.M_Warehouse_ID?.id ?? posConfig?.M_Warehouse_ID,
        priceListId: selectedPriceList?.id,
        isEditMode, editOrderId,
    });

    // ─── Simpan Draft: Order saja, tidak Complete, tidak ada Shipment ────────
    const handleDODraft = () => {
        setIsDOModalOpen(false);
        return withLock(async () => {
            if (!validateBeforeDO({ needLocator: false })) return;
            try {
                if (await settleIfNotDraft()) return;
                const result = await submitSalesOrder(cart, buildDOParams());
                if (!result) return;
                let docNo = null;
                try { docNo = (await getOrderStatus(result.orderId)).documentNo; } catch { /* nomor hanya info */ }
                setDoSuccessModal({
                    mode:         'draft',
                    orderDocNo:   docNo || `#${result.orderId}`,
                    bPartnerName: selectedBPartner?.name,
                    totalAmount:  calculateTotal(),
                });
                resetAfterDO({ redirect: true });
            } catch (err) {
                console.error("Gagal simpan Draft DO:", err.message);
                triggerAlert(describeError(err, "Gagal menyimpan Draft DO:"), "Proses Terhenti");
            }
        });
    };

    // ─── Complete + Kirim: Order → Complete → Shipment (tanpa Payment/Invoice) ──
    const handleDOComplete = () => {
        setIsDOModalOpen(false);
        return withLock(async () => {
            if (!validateBeforeDO()) return;
            try {
                if (await settleIfNotDraft()) return;
                const result = await submitSalesOrder(cart, buildDOParams());
                if (!result) return;

                const orderId = result.orderId;
                upsertAwaiting(orderId, { kind: 'unknown' });   // tercatat sejak SO terbentuk

                let completeErr = null;
                try { await completeSalesOrder(orderId); } catch (e) { completeErr = e; }

                const st = await getOrderStatus(orderId);        // sumber kebenaran = DocStatus server
                await settleDOOrder(orderId, st, { completeErr });
            } catch (err) {
                console.error("Gagal proses DO:", err.message);
                triggerAlert(describeError(err, "Proses DO terhenti:"), "Proses Terhenti");
            }
        });
    };

    // Banner: cek status & lanjutkan SO yang belum tuntas
    const resumeAwaiting = (item) => withLock(async () => {
        try {
            const st = await getOrderStatus(item.orderId);
            await settleDOOrder(item.orderId, st, { fromResume: true });
        } catch (err) {
            triggerAlert(describeError(err, `Gagal mengecek SO ${item.documentNo || '#' + item.orderId}:`), "Gagal Cek Status");
        }
    });

    const isSubmittingAny = isProcessingCheckout || isSettlingPayment || isProcessingAR
        || isProcessingDO || isSubmittingSalesOrder || isSubmittingShipment;

    const handleCompletePOSPaymentWorkflow = async (cleanPaymentsArray, bankAccountId) => {
        if (!currentOrderData) return;

        try {
            const { completedOrder, invoice, settledVia } =
                await completeAndSettle(currentOrderData, cleanPaymentsArray, bankAccountId);

            if (settledVia === 'manual') {
                console.warn(
                    "⚠️ Payment/Receipt tidak ter-generate otomatis oleh backend — " +
                    "dibuat manual via fallback. Cek setup Bank Account/DocType AR Receipt di client ini."
                );
            }

            const finalDocNo = completedOrder.DocumentNo || currentOrderData.DocumentNo || completedOrder.id;

            setReceiptData({
                documentNo:   finalDocNo,
                date:         new Date().toLocaleString("id-ID"),
                posName:      posConfig?.Name || "POS Terminal",
                cashierName:  posConfig?.SalesRep_ID?.identifier || "-",
                bPartnerName: selectedBPartner?.name || "-",
                items:        [...cart],
                total:        calculateTotal(),
                payments:     cleanPaymentsArray,
                paymentSettledVia: settledVia,
            });

            setIsPaymentModalOpen(false);
            setCurrentOrderData(null);
            setCart([]);
            setIsEditMode(false);
            setEditOrderId(null);
            setIsReceiptModalOpen(true);

        } catch (err) {
            console.error("Proses Pembayaran POS Gagal:", err.message);
            triggerAlert("Eror saat memproses pembayaran final: " + err.message, "Error");
        }
    };

    if (loading && !posConfig) return <p style={{ padding: '20px' }}>Loading Config POS...</p>;

    const handleReceiptClose = async () => {
        setIsReceiptModalOpen(false);
        setCart([]);
        setOffset(0);
        setHasMore(true);

        try {
            await fetchProducts(
                searchInput || "",
                getActivePriceListId(),
                null,
                "replace",
                0
            );
        } catch (err) {
            if (err?.name !== 'AbortError') {
                console.error("Gagal refresh produk setelah struk ditutup:", err.message);
            }
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px', fontFamily: 'Arial, sans-serif', height: '100vh', boxSizing: 'border-box', overflow: 'hidden' }}>
            <ConfirmModal
                isOpen={dialog.isOpen}
                title={dialog.title}
                message={
                dialog.mode === "confirm" ? (
            <>
                Produk <strong>{dialog.product?.Name}</strong> tidak memiliki harga
                di Price List yang dipilih.<br /><br />
                Tetap tambahkan ke cart dengan harga Rp 0?
            </>
            ) : (
                <span style={{ whiteSpace: 'pre-line' }}>{dialog.message}</span>
            )
            }
                confirmLabel={dialog.mode === "confirm" ? "OK, Tambahkan" : null}
                cancelLabel={dialog.mode === "confirm" ? "Batal" : "Tutup"}
                onConfirm={dialog.mode === "confirm" ? handleDialogConfirm : null}
                onCancel={closeDialog}
            />
            <DOModal
                isOpen={isDOModalOpen}
                onClose={() => setIsDOModalOpen(false)}
                totalOrderAmount={calculateTotal()}
                totalItems={cart.length}
                bPartnerName={selectedBPartner?.name}
                onDraft={handleDODraft}
                onComplete={handleDOComplete}
                isSubmitting={isProcessingDO}
            />
            <DOSuccessModal
                isOpen={!!doSuccessModal}
                onClose={handleDOSuccessClose}
                mode={doSuccessModal?.mode}
                orderDocNo={doSuccessModal?.orderDocNo}
                shipmentId={doSuccessModal?.shipmentId}
                shipmentDocNo={doSuccessModal?.shipmentDocNo}
                bPartnerName={doSuccessModal?.bPartnerName}
                totalAmount={doSuccessModal?.totalAmount}
            />
            <div className="header-content">
                <span style={{
                color: '#0c0000', fontWeight: 700, fontSize: '15px', flex: 1,
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                }}>
                <ShoppingCartIcon />
                <span>POS Terminal</span>
                </span>
                {isDesktop && (
                <div style={{ display: 'flex', gap: '16px', color: '#180101', flexShrink: 0 }}>
                    <span><strong>POS:</strong> {posConfig?.Name || '...'}</span>
                    <span><strong>SalesRep:</strong> {posConfig?.SalesRep_ID?.id ?? posConfig?.SalesRep_ID ?? '-'}</span>
                    <span><strong>Version:</strong> {currentVersionId
                        ? <span style={{ color: '#2e7d32' }}>{currentVersionId}</span>
                        : <span style={{ color: '#c62828' }}>Not Found</span>}
                    </span>
                </div>
                )}
            </div>
            {/* Config Bar */}
            <div style={{
                background: '#f0f4ff',
                padding: isDesktop ? '12px 16px' : '10px 12px',
                borderRadius: '1px',
                border: '1px solid #c5d0e8',
                fontSize: '13px'
            }}>
            <div style={{
                display: 'flex',
                alignItems: isDesktop ? 'center' : 'stretch',
                gap: isDesktop ? '24px' : '10px',
                flexWrap: 'wrap',
                flexDirection: isDesktop ? 'row' : 'column'
            }}> 
            <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                flex: isDesktop ? 1 : undefined,
                width: isDesktop ? undefined : '100%',
                minWidth: isDesktop ? '200px' : undefined
                }}>
                <label style={{ fontWeight: 'bold', whiteSpace: 'nowrap', color: '#333' }}>Customer:</label>
                <select
                    value={selectedBPartner?.id || ''}
                    onChange={handleBPartnerChange}
                    style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: '6px', border: '1px solid #bbb', fontSize: '13px', background: selectedBPartner ? '#fff' : '#fff3f3', color: '#333' }}
                >
                    <option value="">-- Pilih Customer --</option>
                    {bPartnerList.map(bp => (
                    <option key={bp.id} value={bp.id}>{bp.name}</option>
                    ))}
                </select>
                {!selectedBPartner && (
                <span style={{ color: '#c62828', fontSize: '11px', whiteSpace: 'nowrap' }}>⚠ Wajib</span>
                )}
            </div>
            <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                flex: isDesktop ? 1 : undefined,
                width: isDesktop ? undefined : '100%',
                minWidth: isDesktop ? '200px' : undefined
                }}>
                <label style={{ fontWeight: 'bold', whiteSpace: 'nowrap', color: '#333' }}>Price List:</label>
                <select
                    value={selectedPriceList?.id || ''}
                    onChange={handlePriceListChange}
                    disabled={loading}
                    style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: '6px', border: '1px solid #bbb', fontSize: '13px', background: '#fff', color: '#333' }}
                >
                    <option value="">-- Pilih Price List --</option>
                    {priceListList.map(pl => (
                    <option key={pl.id} value={pl.id}>{pl.name}</option>
                    ))}
                </select>
            </div>
        </div>
    </div>
    {/* Main Layout */}
    <div style={{
        display: 'flex',
        flexDirection: isDesktop ? 'row' : 'column',
        gap: '0px',
        flex: '1',
        overflow: 'hidden'
        }}>
        {/* Kiri: Search + Product Grid */}
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '0px',
            overflow: 'hidden',
            paddingRight: isDesktop ? '16px' : '0',
            }}>
            {awaitingList.length > 0 && (
            <div style={{ backgroundColor: "#e8f0fe", border: "1px solid #1a237e", borderRadius: "6px", padding: "8px 14px", marginBottom: "10px", fontSize: "13px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {awaitingList.map(item => (
                    <div key={item.orderId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span>⏳ <strong>{item.documentNo || `SO #${item.orderId}`}</strong> — {AWAITING_LABEL[item.kind] || AWAITING_LABEL.unknown}</span>
                        <span style={{ display: "flex", gap: "6px" }}>
                            <button disabled={isProcessingDO} onClick={() => resumeAwaiting(item)}
                                style={{ background: "#1a237e", border: "none", color: "#fff", borderRadius: "4px", padding: "3px 10px", cursor: isProcessingDO ? "not-allowed" : "pointer", fontSize: "12px", opacity: isProcessingDO ? 0.6 : 1 }}>
                                Cek status &amp; lanjutkan
                            </button>
                            <button disabled={isProcessingDO} onClick={() => removeAwaiting(item.orderId)}
                                style={{ background: "none", border: "1px solid #1a237e", color: "#1a237e", borderRadius: "4px", padding: "3px 10px", cursor: "pointer", fontSize: "12px" }}>
                                Sembunyikan
                            </button>
                        </span>
                    </div>
                ))}
            </div>
            )}
            {isEditMode && (
            <div style={{
                backgroundColor: "#fff3e0", border: "1px solid #f57c00", borderRadius: "6px",
                padding: "8px 14px", marginBottom: "10px", fontSize: "13px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                <span>✏️ <strong>Mode Edit</strong> — Draft Order ID: {editOrderId}</span>
                <button
                    onClick={() => {
                    setIsEditMode(false);
                    setEditOrderId(null);
                    setCart([]);
                    navigate(location.pathname, { replace: true, state: {} });   
                    }}
                    style={{ background: "none", border: "1px solid #f57c00", color: "#f57c00", borderRadius: "4px", padding: "3px 10px", cursor: "pointer", fontSize: "12px" }}
                >
                    Batalkan Edit
                </button>
            </div>
            )}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', marginBottom: '10px' }}>
                <div style={{ flex: 1, display: 'flex' }}>
                    <SearchBar
                        value={searchInput}
                        onChange={handleSearchInputChange}
                        onKeyDown={handleSearchKeyDown}
                        inputRef={scanInputRef}
                        disabled={versionMissing}
                        placeholder="Cari nama / kode produk, atau scan barcode..."
                    />
                </div>
                <button
                    onClick={() => setScannerOpen(true)}
                    title="Scan Barcode/QR"
                    style={{
                        background: '#1a237e', color: '#fff', border: 'none',
                        borderRadius: '6px', width: '42px', height: '42px', flexShrink: 0,
                        fontSize: '18px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    ><ScanIcon />
                </button>
            </div>
            <ProductGrid
                products={products}
                loading={loading}
                loadingMore={loadingMore}
                hasMore={hasMore}
                fetchMore={loadMore}
                onProductClick={addToCart}
                isDesktop={isDesktop}
                CardComponent={ProductCard}
                emptyHint={versionMissing ? null : "Tidak ada produk ditemukan dengan harga aktif."}
            />
        </div>
        {isDesktop ? (
            <CartSidebar
                cart={cart}
                onRemove={removeFromCart}
                onQtyChange={updateCartQty}
                onUomChange={updateCartUOM}
                onPriceChange={updateCartPrice}
                totalItems={cart.length}
                totalQty={cart.reduce((s, i) => s + i.Qty, 0)}
                summaryRight={`Rp ${calculateTotal().toLocaleString('id-ID')}`}
                title=" Cart"
                submitDraftLabel=" CASH"
                submitCompleteLabel=" PIUTANG"
                submitExtraLabel=" DO"
                onSubmitDraft={handleCheckoutCash}
                onSubmitComplete={handleCheckoutAR}
                onSubmitExtra={handleCheckoutDO}
                isSubmitting={isSubmittingAny}
                CartItemComponent={CartItemPOS}
            />
            ) : (
            <>
            {cart.length > 0 && (
            <button
                onClick={() => setIsCartOpen(true)}
                style={{
                    position: 'fixed', bottom: '20px', left: '16px', right: '16px',
                    zIndex: 200, background: '#28a745', color: '#fff', border: 'none',
                    borderRadius: '12px', padding: '14px 18px', fontWeight: 700, fontSize: '15px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.2)', cursor: 'pointer',
                    }}
            >
                <span> {cart.length} item</span>
                <span>{calculateTotal().toLocaleString('id-ID')} · Lihat Cart</span>
            </button>
            )}
            <CartPanel
                            isOpen={isCartOpen}
                            onClose={() => setIsCartOpen(false)}
                            cart={cart}
                            onRemove={removeFromCart}
                            onQtyChange={updateCartQty}
                            onUomChange={updateCartUOM}
                            onPriceChange={updateCartPrice}
                            totalItems={cart.length}
                            totalQty={cart.reduce((s, i) => s + i.Qty, 0)}
                            summaryRight={`Rp ${calculateTotal().toLocaleString('id-ID')}`}
                            title=" Cart"
                            submitDraftLabel=" CASH"
                            submitCompleteLabel=" PIUTANG"
                            submitExtraLabel=" DO"
                            onSubmitDraft={handleCheckoutCash}
                            onSubmitComplete={handleCheckoutAR}
                            onSubmitExtra={handleCheckoutDO}
                            isSubmitting={isSubmittingAny}
                            CartItemComponent={CartItemPOS}
                        />
                    </>
                )}
                <ARModal
                    isOpen={isARModalOpen}
                    onClose={() => setIsARModalOpen(false)}
                    totalOrderAmount={calculateTotal()}
                    bPartnerName={selectedBPartner?.name}
                    onConfirm={handleConfirmAR}
                    isSubmitting={isProcessingAR}
                />
                <PaymentModal
                    isOpen={isPaymentModalOpen}
                    //onClose={() => setIsPaymentModalOpen(false)}
                    onClose={() => {
                        setIsPaymentModalOpen(false);
                        //setSuccessData(null);
                        fetchProducts('');
                        resetSearchInput();
                        setTimeout(() => scanInputRef.current?.focus(), 150);
                      }}
                    totalOrderAmount={calculateTotal()}
                    onSubmitPayment={handleCompletePOSPaymentWorkflow}
                    isSubmitting={isSettlingPayment}
                    idempiereApi={idempiereApi}
                    adOrgId={posConfig?.AD_Org_ID?.id ?? posConfig?.AD_Org_ID}
                />
                <ReceiptModal
                    isOpen={isReceiptModalOpen}
                    onClose={handleReceiptClose}
                    receiptData={receiptData}
                />
                <BarcodeScanner
                    isOpen={scannerOpen}
                    onDetected={handleBarcodeDetected}
                    onClose={() => setScannerOpen(false)}
                />
            </div>
        </div>
    );
};

export default POSContainer;