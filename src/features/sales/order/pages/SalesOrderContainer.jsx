/**  ─────────────────────────────────────────────────────────────────────────────
 * SalesOrderContainer.jsx
 * Standard Order untuk customer datang ambil barang di lokasi — BUKAN POS.
 * Halaman ini HANYA menangani Sales Order (Draft / Complete). TIDAK membuat
 * Shipment, Payment, maupun Invoice. Pembuatan Shipment dilakukan dari tombol
 * DO di POSContainer (useSalesShipmentSubmit); penagihan via proses BATCH
 * akhir bulan di luar aplikasi ini (PaymentRule 'P' / On Credit).
 *
 * Diadaptasi dari POSContainer.jsx (product grid, search, cart, UOM, stok)
 * tapi sumber Warehouse/DocType BUKAN dari C_POS — dipilih manual, sama
 * pola seperti resolusi Warehouse di PurchasingContainer.jsx.
 * ─────────────────────────────────────────────────────────────────────────────
*/
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from "react-router-dom";
import { useSalesOrderSubmit }    from '@/features/sales/order/hooks/useSalesOrderSubmit';
import { ConfirmModal, CartItemPOS } from '@/features/sales/order/components';
import { ProductCard, SearchBar, DeliveryIcon, ScanIcon, ProductGrid, CartPanel, CartSidebar, BarcodeScanner } from '@/shared/components';
import { useAccess } from '@/context/AccessContext';
import { idempiereApi, fkId } from '@/api/idempiereApi';
import { useIsDesktop, useScannerInput, getLoginInfo } from '@/shared/hooks';
import '@/css/Header.css';
const SO_WINDOW_KEY = 'salesOrder';
const CartItemSO = (props) => <CartItemPOS {...props} windowKey={SO_WINDOW_KEY} />;

// ─── Pengaman: SO yang sudah dibuat di iDempiere tapi belum tuntas ─────────
// Disimpan di localStorage supaya tidak hilang saat refresh / login ulang (401).
const AWAITING_KEY = 'so_awaiting_orders';
const loadAwaiting = () => { try { return JSON.parse(localStorage.getItem(AWAITING_KEY) || '[]'); } catch { return []; } };
const saveAwaiting = (list) => { try { localStorage.setItem(AWAITING_KEY, JSON.stringify(list)); } catch { /* abaikan */ } };
const AWAITING_LABEL = {
    approval: 'menunggu approval (workflow) — jangan submit ulang',
    unknown:  'status belum pasti — cek dulu sebelum submit ulang',
};
const refCode = (v) => (v && typeof v === 'object' ? v.id : v);
const isAuthError = (e) => /\b401\b/.test(e?.message || '');
const describeError = (err, prefix) => isAuthError(err)
    ? `${prefix}\n\nSesi login habis (HTTP 401). Login ulang, lalu tekan "Cek status" pada banner SO. Jangan submit ulang sebelum status SO dicek.`
    : `${prefix}\n${err?.message || err}`;

const SalesOrderContainer = () => {
    // ─── State dasar ────────────────────────────────────────────────────────
    const [cart, setCart]       = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentVersionId, setCurrentVersionId] = useState(null);
    const [versionMissing, setVersionMissing]     = useState(false);

    // ─── Konfigurasi khusus Sales Order (bukan C_POS) ─────────────────────
    const [salesDocTypes, setSalesDocTypes]   = useState([]);
    const [docTypeId, setDocTypeId]           = useState(null);
    const [warehouses, setWarehouses]         = useState([]);
    const [warehouseInfo, setWarehouseInfo]   = useState(null);

    const [bPartnerList, setBPartnerList]   = useState([]);
    const [priceListList, setPriceListList] = useState([]);
    const [selectedBPartner, setSelectedBPartner]   = useState(null);
    const [selectedPriceList, setSelectedPriceList] = useState(null);
    const { submitOrder, completeOrder, isSubmitting: isSubmittingOrder } =
        useSalesOrderSubmit({ docTypeId, description: 'Sales Order - Batch Invoice', onError: (msg, title) => triggerAlert(msg, title) });

    const [editOrderId, setEditOrderId] = useState(null);
    const [isEditMode, setIsEditMode]   = useState(false);

    // ─── Pengaman anti double-submit / anti SO ganda ─────────────────────────
    const submitLockRef = useRef(false);                 // sinkron — klik ke-2 langsung ditolak
    const [isProcessing, setIsProcessing] = useState(false);
    const [awaitingList, setAwaitingList] = useState(loadAwaiting);
    const location = useLocation();
    const navigate = useNavigate();
    const [isCartOpen, setIsCartOpen] = useState(false);
    const { canEdit, canEditField } = useAccess();
    const canSubmitSalesOrder = canEdit('salesOrder'); // sesuaikan key access map kamu
    const canEditPrice = canEditField(SO_WINDOW_KEY, 'PriceEntered');
    const [scannerOpen, setScannerOpen] = useState(false);
    const [offset, setOffset]           = useState(0);
    const [hasMore, setHasMore]         = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const pageSize = 20;

    const DIALOG_CLOSED = { isOpen: false, mode: "alert", title: "", message: "", product: null, onConfirmAction: null };
    const [dialog, setDialog] = useState(DIALOG_CLOSED);
    const triggerAlert = (message, title = "Perhatian", onConfirmAction = null) => {
        setDialog({ isOpen: true, mode: "alert", title, message, product: null, onConfirmAction });
    };
    const triggerConfirm = (product) => {
        setDialog({ isOpen: true, mode: "confirm", title: "Produk Tanpa Harga", message: null, product, onConfirmAction: null });
    };
    const closeDialog = () => setDialog(DIALOG_CLOSED);

    const uomCacheRef = useRef({});

    // ─── 1. Init: DocType SOO, Warehouse, Customer, PriceList ────────
    useEffect(() => {
        const init = async () => {
            try {
                const { orgId } = getLoginInfo();
                if (!orgId) { triggerAlert("Organisasi aktif tidak ditemukan di sesi login. Coba login ulang."); setLoading(false); return; }

                // ── DocType Sales Order (DocBaseType SOO) ──────────────────
                const dtRes = await idempiereApi(
                    `/models/c_doctype?$select=C_DocType_ID,Name&$filter=DocBaseType eq 'SOO' and IsActive eq true&$orderby=Name`
                );
                const dtList = (dtRes.records || []).map(d => ({ id: fkId(d.C_DocType_ID) ?? d.id, name: d.Name }));
                setSalesDocTypes(dtList);
                const standard = dtList.find(d => /standard/i.test(d.name));
                const initialDocTypeId = (standard || dtList[0])?.id ?? null;
                setDocTypeId(initialDocTypeId);
                if (!initialDocTypeId) {
                    triggerAlert("Tidak ada Document Type Sales Order (DocBaseType 'SOO') aktif ditemukan.", "Konfigurasi Tidak Lengkap");
                }

                // ── Warehouse (pola sama seperti PurchasingContainer) ──────
                const whRes = await idempiereApi(
                    `/models/m_warehouse?$select=M_Warehouse_ID,Name&$filter=IsActive eq true and AD_Org_ID eq ${orgId}&$orderby=Name&$top=50`
                );
                const whList = (whRes.records || []).map(w => ({ id: fkId(w.M_Warehouse_ID) ?? w.id, name: w.Name }));
                setWarehouses(whList);
                const { warehouseId: loginWarehouseId } = getLoginInfo();
                const defaultWh = whList.find(w => String(w.id) === String(loginWarehouseId)) ?? whList[0] ?? null;
                setWarehouseInfo(defaultWh);

                await Promise.all([fetchBPartnerOptions(), fetchPriceListOptions()]);
                const [, priceListChosen] = await Promise.all([fetchBPartnerOptions(), fetchPriceListOptions()]);
                setOffset(0);
                await fetchProducts("", priceListChosen?.id, "replace", 0);  
                
            } catch (err) {
                console.error("Error init SalesOrderContainer:", err.message);
                triggerAlert("Gagal memuat konfigurasi: " + err.message, "Error");
            } finally {
                setLoading(false);
            }
        };
        init().catch((err) => {
            if (err?.name === 'AbortError') return;
            console.error("init gagal:", err.message);
        });
    }, []);

    const handleWarehouseChange = async (e) => {
        const id   = parseInt(e.target.value, 10);
        const name = e.target.options[e.target.selectedIndex].text;
        setWarehouseInfo({ id, name });
        setOffset(0);
        await fetchProducts(searchInput, selectedPriceList?.id, "replace", 0);
    };

    // ─── Load draft order untuk mode edit (dikirim dari SalesOrderList) ─────
    useEffect(() => {
        const editOrder = location.state?.editOrder;
        if (!editOrder) return;

        const loadDraftOrder = async () => {
            try {
                setLoading(true);
                const orderId = editOrder.id ?? editOrder.C_Order_ID;
                setEditOrderId(orderId);
                setIsEditMode(true);

                const bpId   = editOrder.C_BPartner_ID?.id ?? editOrder.C_BPartner_ID;
                const bpName = editOrder.C_BPartner_ID?.identifier || `BPartner #${bpId}`;
                if (bpId) setSelectedBPartner({ id: bpId, name: bpName });

                const plId   = editOrder.M_PriceList_ID?.id ?? editOrder.M_PriceList_ID;
                const plName = editOrder.M_PriceList_ID?.identifier || `PriceList #${plId}`;
                if (plId) setSelectedPriceList({ id: plId, name: plName });

                const whId   = editOrder.M_Warehouse_ID?.id ?? editOrder.M_Warehouse_ID;
                const whName = editOrder.M_Warehouse_ID?.identifier || `WH #${whId}`;
                if (whId) {
                    setWarehouseInfo({ id: whId, name: whName });
                }

                const dtId = editOrder.C_DocType_ID?.id ?? editOrder.C_DocType_ID;
                if (dtId) setDocTypeId(dtId);

                const linesRes = await idempiereApi(
                    `/models/c_orderline?$filter=C_Order_ID eq ${orderId}` +
                    `&$select=C_OrderLine_ID,M_Product_ID,QtyEntered,PriceActual,PriceEntered,C_UOM_ID`
                );
                const lines = Array.isArray(linesRes.records) ? linesRes.records : [];

                const cartItems = lines.map((line) => {
                    const productId   = line.M_Product_ID?.id   ?? line.M_Product_ID;
                    const productName = line.M_Product_ID?.identifier || `Product #${productId}`;
                    const uomId       = line.C_UOM_ID?.id   ?? line.C_UOM_ID;
                    const uomName     = line.C_UOM_ID?.identifier || "EA";
                    const price       = parseFloat(line.PriceActual || line.PriceEntered || 0);
                    const qty         = parseFloat(line.QtyEntered || 1);
                    const selectedUOM = { id: uomId, name: uomName, multiplyRate: 1 };

                    return {
                        C_OrderLine_ID: line.id ?? line.C_OrderLine_ID,
                        M_Product_ID:   productId,
                        Name:           productName,
                        PriceEntered:   price,
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
                console.error("Gagal load draft Sales Order:", err.message);
                triggerAlert("Gagal memuat draft Sales Order: " + err.message, "Error");
            } finally {
                setLoading(false);
            }
        };

        loadDraftOrder().catch((err) => {
            if (err?.name === 'AbortError') return;
            console.error("Gagal load draft Sales Order:", err.message);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.state]);

    // ─── Fetch opsi Customer (customer aktif, bukan vendor) ─────────────────
    const fetchBPartnerOptions = async () => {
        try {
            const res = await idempiereApi(
                `/models/c_bpartner?$filter=IsActive eq true and IsCustomer eq true&$select=C_BPartner_ID,Name&$orderby=Name&$top=100`
            );
            const records = Array.isArray(res.records) ? res.records : [];
            setBPartnerList(records.map(bp => ({
                id: bp.C_BPartner_ID?.id ?? bp.C_BPartner_ID ?? bp.id,
                name: bp.Name,
            })).filter(o => o.id));
        } catch (err) {
            console.warn("Gagal fetch BPartner list:", err.message);
        }
    };

    const fetchPriceListOptions = async () => {
        try {
            const res = await idempiereApi(
                `/models/m_pricelist?$filter=IsActive eq true and IsSOPriceList eq true` +
                `&$select=M_PriceList_ID,Name&$orderby=Name&$top=50`
            );
            const records = Array.isArray(res.records) ? res.records : [];
            const options = records.map(pl => ({
                id: pl.M_PriceList_ID?.id ?? pl.M_PriceList_ID ?? pl.id,
                name: pl.Name,
            })).filter(o => o.id);
            setPriceListList(options);
    
            const chosen = selectedPriceList || options[0] || null;
            if (!selectedPriceList && chosen) setSelectedPriceList(chosen);
            return chosen;                     // ← WAJIB return, ini kuncinya
        } catch (err) {
            console.warn("Gagal fetch PriceList:", err.message);
            return null;
        }
    };

    const handleBPartnerChange = (e) => {
        const id   = parseInt(e.target.value, 10);
        const name = e.target.options[e.target.selectedIndex].text;
        setSelectedBPartner({ id, name });
    };

    const handlePriceListChange = async (e) => {
        const id   = parseInt(e.target.value, 10);
        const name = e.target.options[e.target.selectedIndex].text;
        setSelectedPriceList({ id, name });
        setOffset(0);
        try {
            await fetchProducts("", id, "replace", 0);
        } catch (err) {
            if (err?.name !== 'AbortError') console.error(err);
        }
    };

    const handleDocTypeChange = (e) => setDocTypeId(parseInt(e.target.value, 10));

    // ─── Price list version resolver (sama seperti POS) ─────────────────────
    const fetchActiveVersionId = async (priceListId, signal) => {
        const versionRes = await idempiereApi(
            `/models/m_pricelist_version?$filter=M_PriceList_ID eq ${priceListId} and IsActive eq true&$orderby=ValidFrom desc&$top=1`,
            { signal }
        );
        return versionRes?.records?.[0]?.id
            || versionRes?.records?.[0]?.M_PriceList_Version_ID?.id
            || versionRes?.records?.[0]?.M_PriceList_Version_ID
            || null;
    };

    const getActivePriceListId = () => selectedPriceList?.id;

    // ── Search + Scan (sama pola POS) ────────────────────────────────────────
    const {
        value: searchInput, inputRef: scanInputRef,
        handleChange: handleSearchInputChange, handleKeyDown: handleSearchKeyDown, reset: resetSearchInput,
    } = useScannerInput({
        onScanDetected: (code) => handleBarcodeDetectedRef.current(code),
        onManualSearch: (value) => {
            setOffset(0);
            fetchProducts(value, getActivePriceListId(), 'replace', 0)
                .catch((err) => { if (err?.name !== 'AbortError') console.error(err); });
        },
    });

    const fetchProductByBarcode = async (barcode) => {
        const priceListId = getActivePriceListId();
        if (!priceListId) return null;
        const versionId = await fetchActiveVersionId(priceListId);
        if (!versionId) return null;

        const safeBarcode = barcode.replace(/'/g, "''").toUpperCase();
        const productRes = await idempiereApi(
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

        return {
            M_Product_ID: pId,
            Name: productRec.Name,
            Value: productRec.Value,
            UPC: productRec.UPC,
            PriceActual: priceRec?.PriceStd ?? 0,
            basePrice: priceRec?.PriceStd ?? 0,
            ProductType: productRec.ProductType?.id ?? productRec.ProductType ?? null,
            // Dibutuhkan addToCart untuk re-check stok yang benar (BOM Phantom
            // tidak boleh dicek lewat M_Storage langsung — lihat fetchQtyOnHandBatch).
            IsPhantom: productRec.IsPhantom === true || productRec.IsPhantom === 'Y',
            IsVerified: productRec.IsVerified === true || productRec.IsVerified === 'Y',
            defaultUOM: {
                id: productRec.C_UOM_ID?.id ?? productRec.C_UOM_ID,
                name: productRec.C_UOM_ID?.Name || productRec.C_UOM_ID?.identifier || 'EA',
                multiplyRate: 1,
            },
        };
    };

    const handleBarcodeDetected = useCallback(async (code) => {
        setScannerOpen(false);
        const trimmed = code.trim();
        if (!trimmed) return;
        const priceListId = getActivePriceListId();

        try {
            const barcodeProduct = await fetchProductByBarcode(trimmed);
            if (barcodeProduct) {
                await addToCart(barcodeProduct);
                resetSearchInput();
                setOffset(0);
                await fetchProducts('', priceListId, 'replace', 0);
                scanInputRef.current?.focus();
                return;
            }
            setOffset(0);
            await fetchProducts(trimmed, priceListId, 'replace', 0);
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error('Gagal proses barcode:', err.message);
            triggerAlert('Gagal memproses barcode: ' + err.message, 'Error');
        }
    }, [cart, selectedPriceList, warehouseInfo, resetSearchInput, canEditPrice]);

    const handleBarcodeDetectedRef = useRef(handleBarcodeDetected);
    useEffect(() => { handleBarcodeDetectedRef.current = handleBarcodeDetected; }, [handleBarcodeDetected]);

    const resolveProducts = async (productFilter, versionId, signal, top = 20, skip = 0) => {
        const [priceData, productData] = await Promise.all([
            idempiereApi(`/models/m_productprice?$filter=M_PriceList_Version_ID eq ${versionId}&$select=M_Product_ID,PriceStd`, { signal }),
            idempiereApi(`/models/m_product?$select=M_Product_ID,Name,Value,UPC,C_UOM_ID,M_Product_Category_ID,ProductType,IsPhantom,IsVerified&$filter=${productFilter}&$top=${top}&$skip=${skip}`, { signal }),
        ]);

        const productRecords = Array.isArray(productData.records) ? productData.records : productData.records ? [productData.records] : [];
        const relevantIds = new Set(productRecords.map(p => p.M_Product_ID?.id ?? p.M_Product_ID ?? p.id));
        const rawPriceRecords = Array.isArray(priceData.records) ? priceData.records : priceData.records ? [priceData.records] : [];

        const priceMap = new Map();
        rawPriceRecords.filter(p => relevantIds.has(p.M_Product_ID?.id ?? p.M_Product_ID)).forEach(p => {
            const pid = p.M_Product_ID?.id ?? p.M_Product_ID;
            if (pid != null) priceMap.set(pid, p.PriceStd);
        });

        // Kirim juga flag IsPhantom — fetchQtyOnHandBatch yang menentukan
        // apakah stoknya diambil langsung dari M_Storage atau diturunkan dari
        // component BOM-nya (lihat catatan di fungsi itu).
        const productsInfo = productRecords.map(p => ({
            id:        p.M_Product_ID?.id ?? p.M_Product_ID ?? p.id,
            isPhantom: p.IsPhantom === true || p.IsPhantom === 'Y',
        }));
        const qtyOnHandMap = await fetchQtyOnHandBatch(productsInfo);

        const list = productRecords.map((p) => {
            const pId  = p.M_Product_ID?.id ?? p.M_Product_ID ?? p.id;
            const price = priceMap.get(pId);
            if (price === undefined) return null;
            const uomName = p.C_UOM_ID?.Name || p.C_UOM_ID?.identifier || 'EA';
            return {
                M_Product_ID: pId, Name: p.Name, Value: p.Value,
                PriceActual: price ?? 0, basePrice: price ?? 0, C_UOM_Name: uomName,
                defaultUOM: { id: p.C_UOM_ID?.id ?? p.C_UOM_ID, name: uomName, multiplyRate: 1 },
                ProductCategory: { id: p.M_Product_Category_ID?.id ?? p.M_Product_Category_ID, name: p.M_Product_Category_ID?.Name || 'N/A' },
                ProductType: p.ProductType?.id ?? p.ProductType ?? null,
                IsPhantom: p.IsPhantom === true || p.IsPhantom === 'Y',
                IsVerified: p.IsVerified === true || p.IsVerified === 'Y',
                QtyOnHand: qtyOnHandMap.get(pId) ?? 0,
            };
        }).filter(Boolean);

        return { list, count: productRecords.length };
    };

    const isDesktop = useIsDesktop();
    const abortRef = useRef(null);
    const MAX_SCAN_ROUNDS = 10;

    const fetchProducts = async (query = "", priceListId = null, mode = "replace", currentOffset = 0) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        mode === "append" ? setLoadingMore(true) : setLoading(true);

        try {
            setVersionMissing(false);
            const finalPriceListId = priceListId || selectedPriceList?.id;
            if (!finalPriceListId) { setProducts([]); setHasMore(false); return; }

            const versionId = await fetchActiveVersionId(finalPriceListId, controller.signal);
            if (!versionId) {
                setCurrentVersionId("NOT_FOUND"); setVersionMissing(true); setProducts([]); setHasMore(false);
                return;
            }
            setCurrentVersionId(versionId);

            let productFilter = "IsSold eq true and IsActive eq true";
            if (query) {
                const safeQuery = query.toUpperCase().replace(/'/g, "''");
                productFilter += ` and (contains(toupper(Name),'${safeQuery}') or contains(toupper(Value),'${safeQuery}') or contains(toupper(UPC),'${safeQuery}'))`;
            }

            let skip = currentOffset, collected = [], serverExhausted = false;
            for (let round = 0; round < MAX_SCAN_ROUNDS; round++) {
                const { list, count } = await resolveProducts(productFilter, versionId, controller.signal, pageSize, skip);
                skip += count;
                collected = collected.concat(list);
                if (count < pageSize) { serverExhausted = true; break; }
                if (collected.length > 0) break;
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
        fetchProducts(searchInput, getActivePriceListId(), "append", offset)
            .catch((err) => { if (err?.name !== 'AbortError') console.error("loadMore gagal:", err.message); });
    }, [offset, searchInput, selectedPriceList]);

    const fetchUOMOptions = async (product) => {
        const productId = product.M_Product_ID;
        if (uomCacheRef.current[productId]) return uomCacheRef.current[productId];

        const defaultUomId   = product.defaultUOM?.id ?? null;
        const defaultUomName = product.defaultUOM?.name || 'EA';
        const defaultOption  = { id: defaultUomId, name: defaultUomName, multiplyRate: 1 };
        if (!defaultUomId) { uomCacheRef.current[productId] = [defaultOption]; return [defaultOption]; }

        const options = [defaultOption];
        const buildOptions = (records) => {
            records.forEach(conv => {
                const toId   = conv.C_UOM_To_ID?.id  ?? conv.C_UOM_To_ID;
                const toName = conv.C_UOM_To_ID?.Name || conv.C_UOM_To_ID?.identifier || `UOM #${toId}`;
                const rate   = conv.MultiplyRate ?? 1;
                if (toId && !options.find(o => o.id === toId)) options.push({ id: toId, name: toName, multiplyRate: rate });
            });
        };
        try {
            const resProduct = await idempiereApi(`/models/c_uom_conversion?$filter=C_UOM_ID eq ${defaultUomId} and M_Product_ID eq ${productId} and IsActive eq true&$select=C_UOM_ID,C_UOM_To_ID,MultiplyRate,M_Product_ID`);
            buildOptions(Array.isArray(resProduct.records) ? resProduct.records : []);
        } catch (err) { console.warn("Gagal fetch UOM spesifik produk", productId, err.message); }
        try {
            const resGlobal = await idempiereApi(`/models/c_uom_conversion?$filter=C_UOM_ID eq ${defaultUomId} and IsActive eq true&$select=C_UOM_ID,C_UOM_To_ID,MultiplyRate,M_Product_ID&$top=50`);
            const globalRecords = (Array.isArray(resGlobal.records) ? resGlobal.records : []).filter(conv => !conv.M_Product_ID || conv.M_Product_ID === null);
            buildOptions(globalRecords);
        } catch (err) { console.warn("Gagal fetch UOM global untuk UOM", defaultUomId, err.message); }

        uomCacheRef.current[productId] = options;
        return options;
    };

    // Produk BOM Phantom (M_Product.IsPhantom = true) TIDAK PERNAH punya baris
    // M_Storage sendiri — stoknya diturunkan dari stok component BOM-nya
    // (M_Product_BOM: M_ProductBOM_ID = component, BOMQty = kebutuhan
    // component per 1 unit produk phantom), sama seperti window iDempiere.
    // `productsInput` boleh array of id angka biasa (dianggap non-Phantom,
    // kompatibel dengan pemanggilan lama) atau array of { id, isPhantom }.
    const fetchQtyOnHandBatch = async (productsInput) => {
        const warehouseId = warehouseInfo?.id;
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
                    console.warn("Gagal fetch M_Product_BOM untuk produk Phantom:", err.message);
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
                triggerAlert(`Stok produk "${product.Name}" habis (QtyOnHand = ${qtyOnHand}).`, "Stok Habis");
                return;
            }
        }

        const existingIndex = cart.findIndex(item => item.M_Product_ID === product.M_Product_ID);
        const existingQty = existingIndex >= 0 ? cart[existingIndex].Qty : 0;
        const targetQty = existingQty + 1;

        if (!isService && targetQty > qtyOnHand) {
            triggerAlert(`Stok "${product.Name}" tidak mencukupi. Tersedia: ${qtyOnHand}, di keranjang: ${existingQty}.`, "Stok Tidak Cukup");
            return;
        }
        if (product.PriceActual === 0) { triggerConfirm(product); return; }

        const uomOptions  = await fetchUOMOptions(product);
        const selectedUOM = uomOptions[0];

        if (existingIndex >= 0) {
            setCart(prev => prev.map((item, i) => i === existingIndex ? { ...item, Qty: targetQty, QtyOnHand: isService ? 0 : qtyOnHand, isService } : item));
        } else {
            setCart(prev => [...prev, { ...product, Qty: 1, PriceEntered: product.PriceActual, basePrice: product.PriceActual, uomOptions, selectedUOM, QtyOnHand: isService ? 0 : qtyOnHand, isService }]);
        }
    };

    const handleDialogConfirm = async () => {
        const product    = dialog.product;
        const uomOptions = await fetchUOMOptions(product);
        setCart(prev => [...prev, { ...product, Qty: 1, PriceActual: product.PriceActual, basePrice: product.PriceActual, uomOptions, selectedUOM: uomOptions[0] }]);
        closeDialog();
    };

    const removeFromCart = (id) => setCart(prev => prev.filter(i => i.M_Product_ID !== id));
    const calculateTotal = () => cart.reduce((s, i) => s + (i.PriceEntered * i.Qty), 0);

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
                    setTimeout(() => triggerAlert(`Kuantitas melebihi stok untuk "${item.Name}". Stok tersedia: ${qtyOnHandBase}.`, "Stok Tidak Cukup"), 0);
                    return prev;
                }
            }
            if (newQty <= 0) return prev.filter(i => i.M_Product_ID !== productId);
            return prev.map(i => i.M_Product_ID === productId ? { ...i, Qty: newQty } : i);
        });
    };

    const updateCartPrice = (id, value) => {
        const price = parseFloat(value);
        if (isNaN(price) || price < 0) return;
        setCart(prev => prev.map(i => i.M_Product_ID === id ? { ...i, PriceEntered: price } : i));
    };

    const updateCartUOM = (id, uomOption) => {
        setCart(prev => prev.map(item => item.M_Product_ID !== id ? item : {
            ...item, selectedUOM: uomOption, PriceEntered: item.basePrice / uomOption.multiplyRate,
        }));
    };

    // ─── Validasi bersama sebelum submit apa pun ─────────────────────────────
    const validateBeforeSubmit = () => {
        if (cart.length === 0) { triggerAlert("Keranjang masih kosong!"); return false; }
        if (!selectedBPartner) { triggerAlert("Customer wajib dipilih.", "Data Belum Lengkap"); return false; }
        if (!warehouseInfo?.id) { triggerAlert("Gudang belum ditentukan.", "Data Belum Lengkap"); return false; }
        if (!docTypeId) { triggerAlert("Document Type Sales Order belum dipilih.", "Data Belum Lengkap"); return false; }
        return true;
    };

    const resetAfterSuccess = () => {
        setCart([]);
        setIsEditMode(false);
        setEditOrderId(null);
        navigate(location.pathname, { replace: true, state: {} });
        setOffset(0);
        fetchProducts('', getActivePriceListId(), 'replace', 0);
    };

    // ─── Helper status order & daftar "SO belum tuntas" ──────────────────────
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

    // Lock sinkron: hanya 1 proses submit/cek status yang boleh jalan pada satu waktu.
    const withLock = async (fn) => {
        if (submitLockRef.current) return;
        submitLockRef.current = true;
        setIsProcessing(true);
        try { await fn(); }
        finally { submitLockRef.current = false; setIsProcessing(false); }
    };

    // ─── Tentukan langkah berikut berdasarkan DocStatus ASLI di server ───────
    // (bukan dari pesan "timeout" waiter — timeout tidak berarti Complete gagal)
    const settleOrder = async (orderId, st, { completeErr = null, fromResume = false } = {}) => {
        const docNo = st.documentNo || `#${orderId}`;
        const done  = () => { if (!fromResume) resetAfterSuccess(); };

        switch (st.docStatus) {
            case 'CO':
                removeAwaiting(orderId);
                triggerAlert(`Sales Order ${docNo} sudah Complete.`, "Berhasil");
                done();
                return;
            case 'IP':
                upsertAwaiting(orderId, { documentNo: st.documentNo, kind: 'approval' });
                triggerAlert(
                    `Sales Order ${docNo} sedang menunggu approval (workflow), jadi belum bisa Complete.\n\n` +
                    `JANGAN submit ulang. Setelah disetujui, tekan "Cek status" pada banner di atas untuk memastikan statusnya.`,
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
                // Tetap di Draft → pertahankan cart & kunci ke order ini (mode edit),
                // sehingga klik berikutnya meng-update SO yang sama, bukan membuat SO baru.
                setIsEditMode(true);
                setEditOrderId(orderId);
                triggerAlert(
                    `SO ${docNo} tersimpan sebagai Draft tetapi belum berhasil Complete` +
                    `${completeErr ? `:\n${completeErr.message}` : '.'}\n\n` +
                    `Perbaiki penyebabnya lalu klik COMPLETE lagi — sistem memakai SO yang sama.`,
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

    // ─── DRAFT: buat/update Order saja, tidak Complete ───────────────────────
    const handleSubmitDraft = () => withLock(async () => {
        if (!validateBeforeSubmit()) return;
        const result = await submitOrder(cart, {
            customerId: selectedBPartner.id,
            warehouseId: warehouseInfo.id,
            priceListId: selectedPriceList?.id,
            isEditMode, editOrderId,
        });
        if (!result) return;
        triggerAlert(`Sales Order tersimpan sebagai Draft (ID ${result.orderId}).`, "Berhasil");
        resetAfterSuccess();
    });

    // ─── COMPLETE: Order → Complete (tanpa Shipment; Shipment lewat DO di POS) ──
    const handleSubmitComplete = () => withLock(async () => {
        if (!validateBeforeSubmit()) return;

        try {
            // Order sudah ada (mode edit / retry setelah gagal)? Cek status dulu —
            // kalau sudah CO/IP/final, JANGAN di-submit ulang, langsung ke langkah yang sesuai.
            if (isEditMode && editOrderId) {
                const st = await getOrderStatus(editOrderId);
                if (st.docStatus !== 'DR' && st.docStatus !== 'IN') {
                    await settleOrder(editOrderId, st);
                    return;
                }
            }

            const result = await submitOrder(cart, {
                customerId: selectedBPartner.id,
                warehouseId: warehouseInfo.id,
                priceListId: selectedPriceList?.id,
                isEditMode, editOrderId,
            });
            if (!result) return;

            const orderId = result.orderId;
            upsertAwaiting(orderId, { kind: 'unknown' });   // tercatat sejak SO terbentuk

            let completeErr = null;
            try { await completeOrder(orderId); } catch (e) { completeErr = e; }

            const st = await getOrderStatus(orderId);       // sumber kebenaran = DocStatus server
            await settleOrder(orderId, st, { completeErr });
        } catch (err) {
            console.error("Gagal proses Complete:", err.message);
            triggerAlert(describeError(err, "Proses Complete terhenti:"), "Proses Terhenti");
        }
    });

    // ─── Banner: cek status SO yang belum tuntas ─────────────────────────────
    const resumeAwaiting = (item) => withLock(async () => {
        try {
            const st = await getOrderStatus(item.orderId);
            await settleOrder(item.orderId, st, { fromResume: true });
        } catch (err) {
            triggerAlert(describeError(err, `Gagal mengecek SO ${item.documentNo || '#' + item.orderId}:`), "Gagal Cek Status");
        }
    });

    if (loading && !warehouseInfo) return <p style={{ padding: '20px' }}>Loading Sales Order...</p>;

    return (
        <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '16px', 
            padding: '20px', 
            fontFamily: 'Arial, sans-serif', 
            height: '100vh', 
            boxSizing: 'border-box',
            overflow: 'hidden' 
            }}>

            <ConfirmModal
                isOpen={dialog.isOpen}
                title={dialog.title}
                message={
                    dialog.mode === "confirm" ? (
                        <>Produk <strong>{dialog.product?.Name}</strong> tidak memiliki harga di Price List yang dipilih.<br /><br />Tetap tambahkan ke cart dengan harga Rp 0?</>
                    ) : (
                        <span style={{ whiteSpace: 'pre-line' }}>{dialog.message}</span>
                    )
                }
                confirmLabel={dialog.mode === "confirm" ? "OK, Tambahkan" : null}
                cancelLabel={dialog.mode === "confirm" ? "Batal" : "Tutup"}
                onConfirm={dialog.mode === "confirm" ? handleDialogConfirm : null}
                onCancel={closeDialog}
            />
             <div className="header-content">
                <span style={{
                color: '#080000', 
                fontWeight: 700, 
                fontSize: '15px', 
                flex: 1,
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '6px',
                }}>
                <DeliveryIcon />
                    <span>SO - Delivery</span>
                </span>
                <div style={{ 
                    display: 'flex', 
                    alignItems: isDesktop ? 'center' : 'stretch', 
                    gap: '8px', 
                    flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', 
                    minWidth: isDesktop ? '180px' : undefined 
                    }}>
                    <label style={{ 
                        fontWeight: 'bold', 
                        whiteSpace: 'nowrap', 
                        color: '#333' 
                        }}>Doc Type:
                    </label>
                    <select value={docTypeId || ''} onChange={handleDocTypeChange} style={{ 
                        flex: 1, 
                        minWidth: 0, 
                        padding: '5px 8px', 
                        borderRadius: '6px', 
                        border: '1px solid #bbb', 
                        fontSize: '13px' 
                        }}>
                        <option value="">-- Pilih --</option>
                        {salesDocTypes.map(dt => <option key={dt.id} value={dt.id}>{dt.name}</option>)}
                    </select>
                </div>
                <div style={{ 
                    display: 'flex', 
                    alignItems: isDesktop ? 'center' : 'stretch', 
                    gap: '8px', 
                    flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', 
                    minWidth: isDesktop ? '180px' : undefined 
                    }}>
                    <label style={{ 
                        fontWeight: 'bold', 
                        whiteSpace: 'nowrap', 
                        color: '#333' 
                        }}>Customer:
                    </label>
                    <select value={selectedBPartner?.id || ''} onChange={handleBPartnerChange} style={{
                        flex: 1, 
                        minWidth: 0, 
                        padding: '5px 8px', 
                        borderRadius: '6px', 
                        border: '1px solid #bbb', 
                        fontSize: '13px',  
                        }}>
                        <option value="">-- Pilih Customer --</option>
                        {bPartnerList.map(bp => <option key={bp.id} value={bp.id}>{bp.name}</option>)}
                    </select>
                    {!selectedBPartner && 
                    <span style={{ 
                        color: '#c62828', 
                        fontSize: '11px', 
                        whiteSpace: 'nowrap' 
                    }}>⚠ Wajib
                    </span>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: isDesktop ? '200px' : undefined }}>
                    <label style={{ fontWeight: 'bold', whiteSpace: 'nowrap', color: '#333' }}>Price List:</label>
                    <select value={selectedPriceList?.id || ''} onChange={handlePriceListChange} disabled={loading} style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: '6px', border: '1px solid #bbb', fontSize: '13px' }}>
                        <option value="">-- Pilih Price List --</option>
                        {priceListList.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: isDesktop ? 1 : undefined, width: isDesktop ? undefined : '100%', minWidth: isDesktop ? '180px' : undefined }}>
                    <label style={{ fontWeight: 'bold', whiteSpace: 'nowrap', color: '#333' }}>Gudang:</label>
                    <select value={warehouseInfo?.id || ''} onChange={handleWarehouseChange} disabled={loading} style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: '6px', border: '1px solid #bbb', fontSize: '13px' }}>
                       {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                </div>
            </div>
                        
            {/* Main Layout */}
            <div style={{ display: 'flex', flexDirection: isDesktop ? 'row' : 'column', gap: '0px', flex: '1', overflow: 'hidden' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0px', overflow: 'hidden', paddingRight: isDesktop ? '16px' : '0' }}>
                    {awaitingList.length > 0 && (
                        <div style={{ backgroundColor: "#e8f0fe", border: "1px solid #1a237e", borderRadius: "6px", padding: "8px 14px", marginBottom: "10px", fontSize: "13px", display: "flex", flexDirection: "column", gap: "6px" }}>
                            {awaitingList.map(item => (
                                <div key={item.orderId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                    <span>⏳ <strong>{item.documentNo || `SO #${item.orderId}`}</strong> — {AWAITING_LABEL[item.kind] || AWAITING_LABEL.unknown}</span>
                                    <span style={{ display: "flex", gap: "6px" }}>
                                        <button disabled={isProcessing} onClick={() => resumeAwaiting(item)}
                                            style={{ background: "#1a237e", border: "none", color: "#fff", borderRadius: "4px", padding: "3px 10px", cursor: isProcessing ? "not-allowed" : "pointer", fontSize: "12px", opacity: isProcessing ? 0.6 : 1 }}>
                                            Cek status
                                        </button>
                                        <button disabled={isProcessing} onClick={() => removeAwaiting(item.orderId)}
                                            style={{ background: "none", border: "1px solid #1a237e", color: "#1a237e", borderRadius: "4px", padding: "3px 10px", cursor: "pointer", fontSize: "12px" }}>
                                            Sembunyikan
                                        </button>
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    {isEditMode && (
                        <div style={{ backgroundColor: "#fff3e0", border: "1px solid #f57c00", borderRadius: "6px", padding: "8px 14px", marginBottom: "10px", fontSize: "13px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>✏️ <strong>Mode Edit</strong> — Draft Order ID: {editOrderId}</span>
                            <button onClick={() => { setIsEditMode(false); setEditOrderId(null); setCart([]); navigate(location.pathname, { replace: true, state: {} }); }}
                                style={{ background: "none", border: "1px solid #f57c00", color: "#f57c00", borderRadius: "4px", padding: "3px 10px", cursor: "pointer", fontSize: "12px" }}>
                                Batalkan Edit
                            </button>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', marginBottom: '10px' }}>
                        <div style={{ flex: 1, display: 'flex' }}>
                            <SearchBar value={searchInput} onChange={handleSearchInputChange} onKeyDown={handleSearchKeyDown} inputRef={scanInputRef} disabled={versionMissing} placeholder="Cari nama / kode produk, atau scan barcode..." />
                        </div>
                        <button onClick={() => setScannerOpen(true)} title="Scan Barcode/QR"
                            style={{ background: '#1a237e', color: '#fff', border: 'none', borderRadius: '6px', width: '42px', height: '42px', flexShrink: 0, fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ScanIcon />
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
                        title="📝 Sales Order"
                        submitDraftLabel="💾 DRAFT"
                        submitCompleteLabel="✅ COMPLETE"
                        onSubmitDraft={canSubmitSalesOrder ? handleSubmitDraft : undefined}
                        onSubmitComplete={canSubmitSalesOrder ? handleSubmitComplete : undefined}
                        isSubmitting={isSubmittingOrder || isProcessing}
                        CartItemComponent={CartItemPOS}
                    />
                ) : (
                    <>
                        {cart.length > 0 && (
                            <button onClick={() => setIsCartOpen(true)}
                                style={{ position: 'fixed', bottom: '20px', left: '16px', right: '16px', zIndex: 200, background: '#28a745', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px 18px', fontWeight: 700, fontSize: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', cursor: 'pointer' }}>
                                <span>🛒 {cart.length} item</span>
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
                            title="📝 Sales Order"
                            submitDraftLabel="💾 DRAFT"
                            submitCompleteLabel="✅ COMPLETE"
                            onSubmitDraft={canSubmitSalesOrder ? handleSubmitDraft : undefined}
                            onSubmitComplete={canSubmitSalesOrder ? handleSubmitComplete : undefined}
                            isSubmitting={isSubmittingOrder || isProcessing}
                            CartItemComponent={CartItemPOS}
                        />
                    </>
                )}

                <BarcodeScanner isOpen={scannerOpen} onDetected={handleBarcodeDetected} onClose={() => setScannerOpen(false)} />
            </div>

            {!canSubmitSalesOrder && (
                <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fef3c7', color: '#92400e', fontSize: '12px', padding: '8px 14px', textAlign: 'center', zIndex: 150 }}>
                    ⚠ Role Anda hanya memiliki akses lihat (read-only) untuk Sales Order.
                </div>
            )}
        </div>
    );
};

export default SalesOrderContainer;