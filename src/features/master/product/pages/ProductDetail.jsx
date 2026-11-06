// src/pages/ProductDetail.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    idempiereApi,
    getProductImageBlobUrls,
    uploadProductAttachment,
    deleteAllProductAttachments,
} from '@/api/idempiereApi';
import useProductDetailSubmit, {
    parseIdempiereError,
    VENDOR_PRICING_TABLE,
    BOM_HEADER_TABLE,
    BOM_LINE_TABLE,
} from '@/features/master/product/hooks/useProductDetailSubmit';
import useUOMConversionSubmit, {
    UOM_CONVERSION_TABLE,
    calcMultiplyRate,
    readDivideRate,
} from '@/features/master/product/hooks/useUOMConversionSubmit';
import SuccessModal from '@/features/master/product/components/SuccessModal';
import ConfirmModal from '@/features/master/product/components/ConfirmModal';
import '@/css/ProductDetail.css';

// ─── Opsi RoundingType ────────────────────────────────────────────────────
// Value pakai ANGKA MURNI (bukan string) karena dipakai langsung untuk
// operasi matematika pembulatan di plugin autoprice.
// ⚠️ SESUAIKAN dengan AD_Ref_List yang benar-benar kamu buat di iDempiere.
const ROUNDING_TYPE_OPTIONS = [
    { value: 0, label: "Tanpa Pembulatan" },
    { value: 50, label: "Bulatkan ke 50 terdekat" },
    { value: 100, label: "Bulatkan ke 100 terdekat" },
    { value: 500, label: "Bulatkan ke 500 terdekat" },
    { value: 1000, label: "Bulatkan ke 1.000 terdekat" },
    { value: 5000, label: "Bulatkan ke 5.000 terdekat" },
    { value: 10000, label: "Bulatkan ke 10.000 terdekat" },
];

// ─── Opsi List untuk header & baris BOM (PP_Product_BOM / BOMLine) ──────
// ⚠️ SESUAIKAN dengan AD_Ref_List di instance-mu (PP_BOMType, PP_BOMUse,
// PP_ComponentType). Value-nya kode List, bukan label.
const BOM_TYPE_OPTIONS = [
    { value: "A", label: "Current Active" },
    { value: "O", label: "Make-to-Order" },
    { value: "P", label: "Previous" },
    { value: "S", label: "Previous, Spare" },
];
const BOM_USE_OPTIONS = [
    { value: "A", label: "Master" },
    { value: "M", label: "Manufacturing" },
    { value: "E", label: "Engineering" },
];
const COMPONENT_TYPE_OPTIONS = [
    { value: "CO", label: "Component" },
    { value: "PH", label: "Phantom" },
    { value: "PK", label: "Packing" },
    { value: "BY", label: "By-Product" },
    { value: "CP", label: "Co-Product" },
];

const EMPTY_BOM_HEADER = { id: null, Value: "", Name: "", BOMType: "A", BOMUse: "A", _dirty: false };

// AD_Process "Verify BOM Structure" (classname org.compiere.process.BOMVerify),
// bawaan standar iDempiere dengan AD_Process_ID = 53229 (bukan proses lama
// "Verify BOMs" ID 346 yang sudah deprecated/beda class).
// ⚠️ SESUAIKAN kalau di instance-mu ID-nya berbeda: Window > Process and
// Report, cari "Verify BOM Structure", lihat kolom AD_Process_ID.
const BOM_VERIFY_PROCESS_ID = 53229;

// REST plugin (bxservice/idempiere-rest) mengharuskan /processes/{value}
// pakai Value (search key AD_Process, mis. "c_order-process"), BUKAN angka
// AD_Process_ID — beda dari /models/{table} yang pakai nama tabel juga,
// bukan AD_Table_ID. Value persis bisa beda per instance/versi, jadi di
// sini di-resolve otomatis lewat query ke AD_Process berdasarkan ID di
// atas, bukan ditebak/di-hardcode. Hasilnya di-cache di memori supaya
// tidak query ulang tiap klik tombol dalam satu sesi browser.
const processValueCache = new Map();
async function resolveProcessValue(processId) {
    if (processValueCache.has(processId)) return processValueCache.get(processId);
    const res = await idempiereApi(`/models/ad_process?$filter=AD_Process_ID eq ${processId}&$select=Value,Name`);
    const rec = Array.isArray(res?.records) ? res.records[0] : null;
    if (!rec?.Value) {
        throw new Error(
            `AD_Process dengan AD_Process_ID=${processId} tidak ditemukan / tidak punya Value di instance ini. ` +
            `Cek Window > Process and Report, cari "Verify BOM Structure", lalu sesuaikan BOM_VERIFY_PROCESS_ID.`
        );
    }
    processValueCache.set(processId, rec.Value);
    return rec.Value;
}

// Panggil /processes/{value}. Beberapa REST plugin (bxservice/idempiere-rest)
// ternyata mencocokkan Value proses hanya dalam huruf kecil di URL — mirip
// /models/{table_name} yang juga selalu huruf kecil walau AD_Table.TableName
// aslinya mixed-case (mis. "M_Product" -> "/models/m_product"). Jadi kalau
// panggilan persis apa adanya kena 404 "No match found for process name" dan
// value-nya belum huruf kecil semua, otomatis coba ulang dengan huruf kecil
// sebelum benar-benar dianggap gagal.
async function callProcessByValue(value, payload) {
    try {
        return await idempiereApi(`/processes/${value}`, {
            method: "POST",
            body: JSON.stringify(payload),
        });
    } catch (err) {
        const isNoMatch = /No match found for process name/i.test(err?.message || "");
        const lower = value.toLowerCase();
        if (isNoMatch && lower !== value) {
            return await idempiereApi(`/processes/${lower}`, {
                method: "POST",
                body: JSON.stringify(payload),
            });
        }
        throw err;
    }
}

// Helper generik untuk baca id & label dari field referensi iDempiere REST
// (mis. { id: 1000000, identifier: "EACH" }). Bentuk baris yang dibuat lokal
// sengaja dibuat mirip { id, identifier } supaya getId/getLabel konsisten
// untuk baris baru maupun baris hasil fetch.
const KNOWN_FK_FIELDS = new Set([
    "C_BPartner_ID", "M_Product_ID", "M_PriceList_Version_ID",
    "M_Product_Category_ID", "C_UOM_ID", "C_TaxCategory_ID",
    "PP_Product_BOM_ID", "C_Charge_ID",
]);
const getId = (obj) => {
    if (obj === null || obj === undefined) return undefined;
    if (typeof obj !== "object") return obj; // sudah id mentah (angka/string)
    if (obj.id?.id !== undefined) return obj.id.id;
    if (obj.id !== undefined) return obj.id;
    // Fallback: cari kolom PK asli (pola "<Table>_ID"), tapi jangan salah
    // ambil foreign key.
    const pkKey = Object.keys(obj).find((k) => /_ID$/i.test(k) && !KNOWN_FK_FIELDS.has(k));
    if (pkKey) return obj[pkKey];
    const anyIdKey = Object.keys(obj).find((k) => /_ID$/i.test(k));
    return anyIdKey ? obj[anyIdKey] : undefined;
};
const getLabel = (field) => (typeof field === "object" ? field?.identifier : field) || "-";
const isYes = (v) => v === true || v === "Y";

// Konversi hasil getId() ke number secara toleran. Dipakai untuk menentukan
// apakah satu baris (Vendor Pricing / Sales Price / BOM header / BOM line)
// sudah ada di server (PUT) atau belum (POST). SEBELUMNYA di sini pakai cek
// `typeof rawId === "number"` yang terlalu kaku — kalau REST API kebetulan
// mengembalikan PK sebagai string angka ("1000005") atau bentuk lain yang
// bukan primitive number murni, baris yang SUDAH ADA di server keliru
// dianggap baru, jadi di-POST lagi -> bentrok unique constraint (duplicate
// key) walau datanya sebenarnya sudah tersimpan.
const toNumericId = (rawId) => {
    if (rawId === null || rawId === undefined || rawId === "") return null;
    const n = Number(rawId);
    return Number.isFinite(n) ? n : null;
};

// Key stabil untuk satu baris (Vendor Pricing / Sales Price / BOM line).
const lineKey = (line) => getId(line) ?? line._localId;

function ProductDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isNew = !id; // Route /product-detail/new tidak punya param :id

    const [product, setProduct] = useState(null);
    const [isLoading, setIsLoading] = useState(!isNew);
    const [isEditing, setIsEditing] = useState(isNew);

    const { isSaving: isSavingProduct, saveProductWithLines } = useProductDetailSubmit(idempiereApi);
    const { isSaving: isSavingUom, saveUOMConversions } = useUOMConversionSubmit(idempiereApi);
    // Tombol Simpan/Batal ikut disable selama tahap UOM Conversion berjalan.
    const isSaving = isSavingProduct || isSavingUom;

    // State untuk tombol Verify BOM Structure — dideklarasikan di sini (bukan
    // dekat handleVerifyBom di bawah) supaya tidak jatuh setelah early return
    // `if (isLoading) return ...` dan melanggar urutan Hooks.
    const [isVerifyingBom, setIsVerifyingBom] = useState(false);

    const [successModal, setSuccessModal] = useState({ isOpen: false, message: "" });
    const showSuccess = (message) => setSuccessModal({ isOpen: true, message });

    const [confirmModal, setConfirmModal] = useState({
        isOpen: false, title: "", message: "", confirmLabel: "Hapus", danger: true, onConfirm: null,
    });
    const openConfirm = ({ title, message, confirmLabel = "Hapus", danger = true, onConfirm }) => {
        setConfirmModal({ isOpen: true, title, message, confirmLabel, danger, onConfirm });
    };
    const closeConfirm = () => setConfirmModal((prev) => ({ ...prev, isOpen: false }));
    const handleConfirmModalConfirm = async () => {
        const action = confirmModal.onConfirm;
        closeConfirm();
        if (action) await action();
    };

    // Form state untuk field utama M_Product.
    // IsStocked default true mengikuti default kolom di iDempiere.
    // IsPhantom & IsBOMPriceOverride hanya bermakna kalau IsBOM = true.
    const [form, setForm] = useState({
        Value: "", Name: "", Description: "", UPC: "",
        IsPurchased: false, IsSold: false,
        IsStocked: true, IsBOM: false, IsPhantom: false, IsBOMPriceOverride: false,
        MarkupPercent: 0, RoundingType: 0,
        M_Product_Category_ID: "", C_UOM_ID: "",
        C_Charge_ID: "", // custom field: default charge untuk Internal Use
    });

    // ─── Vendor Pricing (M_BPartnerProduct) ─────────────────────────────────
    const [vendorLines, setVendorLines] = useState([]);
    const [deletedVendorLineIds, setDeletedVendorLineIds] = useState([]);
    const [isLoadingVendorLines, setIsLoadingVendorLines] = useState(false);
    const [vendorOptions, setVendorOptions] = useState([]);

    // ─── Sales Price (M_ProductPrice) ───────────────────────────────────────
    const [priceLines, setPriceLines] = useState([]);
    const [deletedPriceLineIds, setDeletedPriceLineIds] = useState([]);
    const [isLoadingPriceLines, setIsLoadingPriceLines] = useState(false);
    const [priceListVersions, setPriceListVersions] = useState([]);

    // ─── UOM Conversion (C_UOM_Conversion) ──────────────────────────────────
    // Konversi khusus produk ini: UOM dasar (M_Product.C_UOM_ID) -> UOM tujuan.
    // Seperti Vendor Pricing: murni state lokal sampai tombol Simpan diklik.
    // `DivideRate` di state = "isi per 1 UOM tujuan, dalam UOM dasar"
    // (mis. 1 Rim = 500 Lembar -> 500). MultiplyRate dihitung di hook.
    const [uomLines, setUomLines] = useState([]);
    const [deletedUomLineIds, setDeletedUomLineIds] = useState([]);
    const [isLoadingUomLines, setIsLoadingUomLines] = useState(false);

    // ─── Bill of Materials (PP_Product_BOM + PP_Product_BOMLine) ────────────
    // Sama seperti Vendor Pricing: murni state lokal sampai tombol Simpan.
    const [bomHeader, setBomHeader] = useState(EMPTY_BOM_HEADER);
    const [bomLines, setBomLines] = useState([]);
    const [deletedBomLineIds, setDeletedBomLineIds] = useState([]);
    const [isLoadingBom, setIsLoadingBom] = useState(false);
    const [bomSearch, setBomSearch] = useState("");
    const [bomSearchResults, setBomSearchResults] = useState([]);
    const [bomSearching, setBomSearching] = useState(false);

    // ─── Opsi untuk field mandatory M_Product (Product Category & UOM) ─────
    const [productCategories, setProductCategories] = useState([]);
    const [uoms, setUoms] = useState([]);
    // Opsi Charge untuk field custom M_Product.C_Charge_ID (default charge Internal Use)
    const [charges, setCharges] = useState([]);

    // ─── Gambar Produk (AD_Attachment) ──────────────────────────────────────
    const [productImages, setProductImages] = useState([]);
    const [isLoadingImages, setIsLoadingImages] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [isDeletingImages, setIsDeletingImages] = useState(false);
    const [imageError, setImageError] = useState(null);
    const productImagesRef = useRef([]);
    useEffect(() => { productImagesRef.current = productImages; }, [productImages]);
    useEffect(() => {
        return () => {
            productImagesRef.current.forEach((img) => URL.revokeObjectURL(img.url));
        };
    }, []);

    // ─── FETCH: data utama produk ────────────────────────────────────────────
    // $select sengaja TIDAK dipakai di sini: kolom baru (IsBOMPriceOverride
    // dll) belum terverifikasi namanya di instance ini, dan REST menolak SELURUH
    // request kalau ada 1 nama kolom yang salah di $select — halaman jadi
    // "Produk tidak ditemukan". Ini fetch 1 record, jadi ambil semua kolom
    // tidak membebani.
    const fetchProduct = useCallback(async () => {
        if (isNew) return;
        setIsLoading(true);
        try {
            const data = await idempiereApi(`/models/m_product/${id}`);
            setProduct(data);
            setForm({
                Value: data.Value || "",
                Name: data.Name || "",
                Description: data.Description || "",
                UPC: data.UPC || "",
                IsPurchased: isYes(data.IsPurchased),
                IsSold: isYes(data.IsSold),
                IsStocked: isYes(data.IsStocked),
                IsBOM: isYes(data.IsBOM),
                IsPhantom: isYes(data.IsPhantom),
                IsBOMPriceOverride: isYes(data.IsBOMPriceOverride),
                MarkupPercent: data.MarkupPercent ?? 0,
                RoundingType: getId(data.RoundingType) ?? 0,
                M_Product_Category_ID: getId(data.M_Product_Category_ID) ?? "",
                C_UOM_ID: getId(data.C_UOM_ID) ?? "",
                C_Charge_ID: getId(data.C_Charge_ID) ?? "",
            });
        } catch (err) {
            console.error("Gagal mengambil data produk:", err);
        } finally {
            setIsLoading(false);
        }
    }, [id, isNew]);

    // ─── FETCH: Vendor Pricing lines ────────────────────────────────────────
    const fetchVendorLines = useCallback(async () => {
        if (isNew) return;
        setIsLoadingVendorLines(true);
        try {
            const query = `/models/${VENDOR_PRICING_TABLE}?$filter=M_Product_ID eq ${id}`;
            const data = await idempiereApi(query);
            
            // Tandai setiap baris dari server bahwa baris ini SUDAH ADA
            const records = (data.records || []).map(rec => ({
                ...rec,
                _isFetched: true
            }));
            setVendorLines(records);
        } catch (err) {
            console.error(`Gagal mengambil Vendor Pricing (${VENDOR_PRICING_TABLE}):`, err);
            setVendorLines([]);
        } finally {
            setIsLoadingVendorLines(false);
        }
    }, [id, isNew]);

    // ─── FETCH: Sales Price lines ───────────────────────────────────────────
    const fetchPriceLines = useCallback(async () => {
        if (isNew) return;
        setIsLoadingPriceLines(true);
        try {
            const query = `/models/m_productprice?$filter=M_Product_ID eq ${id}`;
            const data = await idempiereApi(query);
            setPriceLines(data.records || []);
        } catch (err) {
            console.error("Gagal mengambil Sales Price (M_ProductPrice):", err);
            setPriceLines([]);
        } finally {
            setIsLoadingPriceLines(false);
        }
    }, [id, isNew]);

    // ─── FETCH: UOM Conversion lines ────────────────────────────────────────
    const fetchUomLines = useCallback(async () => {
        if (isNew) return;
        setIsLoadingUomLines(true);
        try {
            const data = await idempiereApi(
                `/models/${UOM_CONVERSION_TABLE}?$filter=M_Product_ID eq ${id} and IsActive eq true`
            );
            setUomLines((data.records || []).map((rec) => ({ ...rec, DivideRate: readDivideRate(rec) })));
        } catch (err) {
            console.error(`Gagal mengambil UOM Conversion (${UOM_CONVERSION_TABLE}):`, err);
            setUomLines([]);
        } finally {
            setIsLoadingUomLines(false);
        }
    }, [id, isNew]);

    // ─── FETCH: BOM header + baris komponen ─────────────────────────────────
    // Ambil header BOM aktif TERBARU untuk produk ini, lalu baris-barisnya.
    // Kalau produk belum punya BOM, state header tetap default (kosong).
    const fetchBom = useCallback(async () => {
        if (isNew) return;
        setIsLoadingBom(true);
        try {
            const headerRes = await idempiereApi(
                `/models/${BOM_HEADER_TABLE}?$filter=M_Product_ID eq ${id} and IsActive eq true&$orderby=Created desc&$top=1`
            );
            const header = (headerRes.records || [])[0];
            if (!header) {
                setBomHeader(EMPTY_BOM_HEADER);
                setBomLines([]);
                return;
            }
            const headerId = getId(header);
            setBomHeader({
                id: headerId,
                Value: header.Value || "",
                Name: header.Name || "",
                BOMType: getId(header.BOMType) ?? "A",
                BOMUse: getId(header.BOMUse) ?? "A",
                _dirty: false,
            });

            const linesRes = await idempiereApi(
                `/models/${BOM_LINE_TABLE}?$filter=PP_Product_BOM_ID eq ${headerId} and IsActive eq true&$orderby=Line`
            );
            setBomLines(linesRes.records || []);
        } catch (err) {
            console.error(`Gagal mengambil BOM (${BOM_HEADER_TABLE}/${BOM_LINE_TABLE}):`, err);
            setBomHeader(EMPTY_BOM_HEADER);
            setBomLines([]);
        } finally {
            setIsLoadingBom(false);
        }
    }, [id, isNew]);

    // ─── FETCH: opsi Price List Version ─────────────────────────────────────
    const fetchPriceListVersions = useCallback(async () => {
        try {
            const data = await idempiereApi(`/models/m_pricelist_version?$filter=IsActive eq true`);
            setPriceListVersions(data.records || []);
        } catch (err) {
            console.error("Gagal mengambil Price List Version:", err);
        }
    }, []);

    // ─── FETCH: opsi vendor untuk dropdown Vendor Pricing ──────────────────
    const fetchVendorOptions = useCallback(async () => {
        try {
            const data = await idempiereApi(
                `/models/c_bpartner?$filter=IsVendor eq true and IsActive eq true&$select=Name&$orderby=Name`
            );
            setVendorOptions(data.records || []);
        } catch (err) {
            console.error("Gagal mengambil daftar Vendor:", err);
            setVendorOptions([]);
        }
    }, []);

    // ─── FETCH: opsi Product Category (mandatory di m_product) ─────────────
    const fetchProductCategories = useCallback(async () => {
        try {
            const data = await idempiereApi(`/models/m_product_category?$filter=IsActive eq true&$select=Name,IsDefault`);
            const records = data.records || [];
            setProductCategories(records);
            if (isNew) {
                const def = records.find((c) => c.IsDefault === true || c.IsDefault === "Y") || records[0];
                if (def) setForm((prev) => (prev.M_Product_Category_ID ? prev : { ...prev, M_Product_Category_ID: getId(def) }));
            }
        } catch (err) {
            console.error("Gagal mengambil Product Category:", err);
            setProductCategories([]);
        }
    }, [isNew]);

    // ─── FETCH: opsi UOM (mandatory di m_product) ───────────────────────────
    const fetchUoms = useCallback(async () => {
        try {
            const data = await idempiereApi(`/models/c_uom?$filter=IsActive eq true&$select=Name,IsDefault`);
            const records = data.records || [];
            setUoms(records);
            if (isNew) {
                const def = records.find((u) => u.IsDefault === true || u.IsDefault === "Y") || records[0];
                if (def) setForm((prev) => (prev.C_UOM_ID ? prev : { ...prev, C_UOM_ID: getId(def) }));
            }
        } catch (err) {
            console.error("Gagal mengambil UOM:", err);
            setUoms([]);
        }
    }, [isNew]);

    // ─── FETCH: opsi Charge (default charge Internal Use, opsional) ─────────
    const fetchCharges = useCallback(async () => {
        try {
            const data = await idempiereApi(`/models/c_charge?$filter=IsActive eq true&$select=Name&$orderby=Name`);
            setCharges(data.records || []);
        } catch (err) {
            console.error("Gagal mengambil Charge:", err);
            setCharges([]);
        }
    }, []);

    // ─── FETCH: gambar produk (attachment) ──────────────────────────────────
    const fetchProductImages = useCallback(async () => {
        if (isNew) return;
        setIsLoadingImages(true);
        try {
            const images = await getProductImageBlobUrls(id);
            setProductImages((prev) => {
                prev.forEach((img) => URL.revokeObjectURL(img.url));
                return images;
            });
        } catch (err) {
            console.error("Gagal mengambil gambar produk:", err);
        } finally {
            setIsLoadingImages(false);
        }
    }, [id, isNew]);

    useEffect(() => {
        fetchProduct();
        fetchVendorLines();
        fetchPriceLines();
        fetchBom();
        fetchUomLines();
        fetchPriceListVersions();
        fetchVendorOptions();
        fetchProductCategories();
        fetchUoms();
        fetchCharges();
        fetchProductImages();
    }, [fetchProduct, fetchVendorLines, fetchPriceLines, fetchBom, fetchUomLines, fetchPriceListVersions, fetchVendorOptions, fetchProductCategories, fetchUoms, fetchCharges, fetchProductImages]);

    // ─── Cari produk komponen BOM (debounce) ────────────────────────────────
    // contains() di REST API ini case-sensitive → dibungkus toupper() di
    // kedua sisi. Hasil difilter di render: bukan produk ini sendiri, dan
    // belum ada di daftar komponen.
    useEffect(() => {
        const term = bomSearch.trim();
        if (!term) { setBomSearchResults([]); return; }
        const timer = setTimeout(async () => {
            setBomSearching(true);
            try {
                const safe = term.replace(/'/g, "''");
                const data = await idempiereApi(
                    `/models/m_product?$filter=IsActive eq true and ` +
                    `(contains(toupper(Name),toupper('${safe}')) or contains(toupper(Value),toupper('${safe}')))` +
                    `&$select=Name,Value,C_UOM_ID&$orderby=Name&$top=10`
                );
                setBomSearchResults(data.records || []);
            } catch (err) {
                console.error("Gagal mencari produk komponen BOM:", err);
                setBomSearchResults([]);
            } finally {
                setBomSearching(false);
            }
        }, 350);
        return () => clearTimeout(timer);
    }, [bomSearch]);

    if (isLoading) return <div className="card-container detail-status">Loading detail...</div>;
    if (!isNew && !product) return <div className="card-container detail-status detail-status-empty">Produk tidak ditemukan.</div>;

    // ─── Validasi field wajib (dicek sebelum kirim apa pun) ────────────────
    const validateProductForm = () => {
        const missing = [];
        if (!form.Value?.trim()) missing.push("Search Key");
        if (!form.Name?.trim()) missing.push("Name");
        if (!form.M_Product_Category_ID) missing.push("Product Category");
        if (!form.C_UOM_ID) missing.push("UOM");
        if (form.IsBOM) {
            if (form.IsPhantom && bomLines.length === 0) {
                missing.push("Minimal 1 komponen BOM (produk Phantom tanpa komponen tidak punya stok sama sekali)");
            }
            if (bomLines.some((l) => !(parseFloat(l.QtyBOM) > 0))) {
                missing.push("Qty BOM setiap komponen harus lebih dari 0");
            }
        }
        // UOM Conversion
        if (uomLines.some((l) => !(parseFloat(l.DivideRate) > 0))) {
            missing.push("Nilai UOM Conversion setiap baris harus lebih dari 0");
        }
        if (uomLines.some((l) => String(getId(l.C_UOM_To_ID)) === String(form.C_UOM_ID))) {
            missing.push("UOM Conversion tidak boleh sama dengan UOM dasar produk");
        }
        // iDempiere mewajibkan UOM "dari" konversi produk = UOM dasar produk,
        // jadi UOM dasar tidak boleh diganti selagi konversi lama masih ada.
        if (!isNew && product && String(form.C_UOM_ID) !== String(getId(product.C_UOM_ID)) &&
            uomLines.some((l) => toNumericId(getId(l)) !== null)) {
            missing.push("UOM dasar diubah padahal sudah ada UOM Conversion — hapus konversi lama dulu, atau kembalikan UOM dasar");
        }
        return missing;
    };

    // ─── SAVE (satu pintu): M_Product + Vendor Pricing + Sales Price + BOM ──
    const handleSaveAll = async () => {
        const missing = validateProductForm();
        if (missing.length > 0) {
            alert(`Mohon lengkapi terlebih dahulu:\n- ${missing.join("\n- ")}`);
            return;
        }

        const productPayload = {
            Value: form.Value.trim(),
            Name: form.Name.trim(),
            Description: form.Description,
            UPC: form.UPC?.trim() || (isNew ? undefined : null), // opsional; kosong saat edit = hapus nilai lama
            IsPurchased: form.IsPurchased,
            IsSold: form.IsSold,
            IsStocked: form.IsStocked,
            IsBOM: form.IsBOM,
            // Phantom & BOM Price Override tidak bermakna kalau bukan BOM —
            // dipaksa false supaya tidak ada nilai sisa yang membingungkan.
            IsPhantom: form.IsBOM ? form.IsPhantom : false,
            IsBOMPriceOverride: form.IsBOM ? form.IsBOMPriceOverride : false,
            MarkupPercent: parseFloat(form.MarkupPercent) || 0,
            RoundingType: parseInt(form.RoundingType, 10) || 0,
            M_Product_Category_ID: { id: parseInt(form.M_Product_Category_ID, 10) },
            C_UOM_ID: { id: parseInt(form.C_UOM_ID, 10) },
            // C_Charge_ID opsional: kalau dikosongkan saat edit, kirim null
            // supaya nilai lama di server ikut terhapus.
            ...(form.C_Charge_ID
                ? { C_Charge_ID: { id: parseInt(form.C_Charge_ID, 10) } }
                : (!isNew ? { C_Charge_ID: null } : {})),
        };

        // `typeof ... === "number"` jaga-jaga: kalau getId() salah ambil FK
        // (objek) sebagai id, baris tetap dianggap baru (POST), bukan PUT ke URL rusak.
        // Gantilah bagian vendorLinesPayload di handleSaveAll dengan logika berikut:
        const vendorLinesPayload = vendorLines.map((l) => {
            const rawId = getId(l);
            const bpartnerId = getId(l.C_BPartner_ID);
            
            // Untuk M_Product_PO, ID composite atau ID bawaan dari iDempiere REST
            const numericId = toNumericId(rawId);
            
            return {
                // Jika l._isExisting atau numericId atau sudah ada C_BPartner_ID dari fetch awal, tandai
                id: numericId,
                compositeKey: numericId ? null : `${id}_${bpartnerId}`, // composite key fallback jika REST plugin mendukung composite key URL
                C_BPartner_ID: bpartnerId,
                VendorProductNo: l.VendorProductNo,
                PriceList: l.PriceList,
                PriceLastPO: l.PriceLastPO,
                _dirty: l._dirty === true,
                _isNew: !numericId && !l._isFetched, // Tandai eksplisit apakah baris ini baru ditambahkan di UI
            };
        });
        const priceLinesPayload = priceLines.map((l) => {
            const rawId = getId(l);
            return {
                id: toNumericId(rawId),
                M_PriceList_Version_ID: getId(l.M_PriceList_Version_ID),
                PriceList: l.PriceList,
                PriceStd: l.PriceStd,
                PriceLimit: l.PriceLimit,
                _dirty: l._dirty === true,
            };
        });

        // Payload BOM hanya dikirim kalau produk IsBOM — kalau user
        // menghapus centang IsBOM di produk yang sudah punya BOM, data BOM
        // lama TIDAK dihapus, hanya tidak disentuh.
        const bomPayload = form.IsBOM
            ? {
                headerId: toNumericId(bomHeader.id),
                header: {
                    Value: bomHeader.Value?.trim() || form.Value.trim(),
                    Name: bomHeader.Name?.trim() || form.Name.trim(),
                    BOMType: bomHeader.BOMType,
                    BOMUse: bomHeader.BOMUse,
                    _dirty: bomHeader._dirty === true,
                },
                lines: bomLines.map((l) => {
                    const rawId = getId(l);
                    return {
                        id: toNumericId(rawId),
                        M_Product_ID: getId(l.M_Product_ID),
                        C_UOM_ID: getId(l.C_UOM_ID),
                        QtyBOM: l.QtyBOM,
                        ComponentType: getId(l.ComponentType) || "CO",
                        Line: l.Line,
                        _dirty: l._dirty === true,
                    };
                }),
                deletedLineIds: deletedBomLineIds,
            }
            : null;

        const uomLinesPayload = uomLines.map((l) => ({
            id: toNumericId(getId(l)),
            C_UOM_To_ID: getId(l.C_UOM_To_ID),
            DivideRate: l.DivideRate,
            _dirty: l._dirty === true,
        }));

        try {
            const newProductId = await saveProductWithLines({
                isNew,
                productId: id,
                productPayload,
                vendorLines: vendorLinesPayload,
                deletedVendorIds: deletedVendorLineIds,
                priceLines: priceLinesPayload,
                deletedPriceIds: deletedPriceLineIds,
                bom: bomPayload,
            });

            setDeletedVendorLineIds([]);
            setDeletedPriceLineIds([]);
            setDeletedBomLineIds([]);

            // UOM Conversion disimpan SETELAH produk (butuh M_Product_ID). Kalau
            // tahap ini gagal, produk sudah tersimpan — jangan dilempar ke catch
            // di bawah, supaya untuk produk baru tidak tertinggal di halaman
            // "new" (Simpan ulang = produk dobel). Cukup beri peringatan.
            let uomWarning = null;
            try {
                await saveUOMConversions({
                    productId: newProductId,
                    baseUomId: form.C_UOM_ID,
                    lines: uomLinesPayload,
                    deletedIds: deletedUomLineIds,
                });
                setDeletedUomLineIds([]);
            } catch (uomErr) {
                console.error("Gagal menyimpan UOM Conversion:", uomErr);
                uomWarning =
                    `Produk berhasil disimpan, tetapi UOM Conversion gagal diproses.\n\n${parseIdempiereError(uomErr)}` +
                    (uomErr.step ? `\n\n(Gagal pada tahap: ${uomErr.step})` : "") +
                    `\n\nBuka Edit Produk untuk memeriksa & menyimpan ulang UOM Conversion-nya.`;
            }

            if (isNew) {
                showSuccess("Produk baru berhasil dibuat beserta Vendor Pricing, Sales Price" + (form.IsBOM ? " & BOM-nya." : " -nya."));
                navigate(`/product-detail/edit/${newProductId}`, { replace: true });
            } else {
                await Promise.all([fetchProduct(), fetchVendorLines(), fetchPriceLines(), fetchBom(), fetchUomLines()]);
                setIsEditing(false);
                showSuccess("Data produk beserta Vendor Pricing, Sales Price" + (form.IsBOM ? " & BOM" : "") + " berhasil disimpan.");
            }

            if (uomWarning) alert(uomWarning);
        } catch (err) {
            console.error("Gagal menyimpan produk:", err);
            let message = parseIdempiereError(err);
            if (err.step) {
                message += `\n\n(Gagal pada tahap: ${err.step})`;
            }
            if (err.partial?.productId) {
                message += isNew
                    ? `\nProduk sempat berhasil dibuat (Product ID: ${err.partial.productId}) sebelum gagal. Buka lagi lewat menu Edit Produk untuk melanjutkan/melengkapi Vendor Pricing, Sales Price & BOM-nya.`
                    : `\nData M_Product induk sudah tersimpan — hanya sebagian baris Vendor Pricing/Sales Price/BOM yang gagal diproses.`;
            }
            alert(`Gagal menyimpan produk.\n\n${message}`);

            // PENTING: saveProductWithLines mengirim tiap baris sebagai REST
            // call terpisah (bukan satu transaksi DB), jadi kalau gagal di
            // tengah jalan, baris-baris SEBELUM tahap yang gagal itu sudah
            // benar-benar tersimpan di server walau lemparan error bikin
            // seluruh handleSaveAll dianggap gagal. Tanpa refresh ini, state
            // lokal (vendorLines/priceLines/bomLines) tetap punya baris itu
            // dengan id: null (dianggap "baru"), jadi klik Simpan berikutnya
            // akan POST ulang baris yang sama -> duplicate key. Refresh dari
            // server di sini menyamakan state lokal dengan kenyataan,
            // sebelum user coba simpan lagi. Aman dipanggil walau isNew
            // (fetchVendorLines/fetchPriceLines/fetchBom sendiri sudah
            // no-op kalau isNew, karena belum ada id produk buat di-fetch).
            await Promise.all([fetchVendorLines(), fetchPriceLines(), fetchBom()]);
        }
    };

    // Batal edit — buang semua perubahan lokal yang belum disimpan.
    const handleCancelEdit = () => {
        setIsEditing(false);
        setDeletedVendorLineIds([]);
        setDeletedPriceLineIds([]);
        setDeletedBomLineIds([]);
        setBomSearch("");
        setDeletedUomLineIds([]);
        fetchProduct();
        fetchVendorLines();
        fetchPriceLines();
        fetchBom();
        fetchUomLines();
    };

    // ─── Verify BOM Structure (AD_Process org.compiere.process.BOMVerify) ───
    // Proses standar iDempiere ini yang sebelumnya cuma bisa dijalankan lewat
    // window Bill of Materials & Formula — dipanggil di sini lewat REST
    // /api/v1/processes/{AD_Process_ID}. Proses ini yang men-set/refresh
    // flag internal BOM (mis. konsistensi Phantom) di level server, makanya
    // setelah sukses produk & BOM di-fetch ulang.
    const handleVerifyBom = async () => {
        if (isNew || !id) {
            alert("Simpan produk & BOM-nya terlebih dahulu sebelum menjalankan Verify BOM Structure.");
            return;
        }
        if (isEditing) {
            alert("Simpan dulu perubahan yang sedang diedit sebelum menjalankan Verify BOM Structure (proses ini bekerja pada data yang sudah tersimpan di server).");
            return;
        }
        setIsVerifyingBom(true);
        try {
            const processValue = await resolveProcessValue(BOM_VERIFY_PROCESS_ID);
            // Proses ini bukan proses dokumen (tidak terikat ke satu baris
            // tabel tertentu seperti C_Order/M_InOut), jadi table-id &
            // record-id dikosongkan (0) — parameter sesungguhnya adalah
            // M_Product_ID. Kalau REST plugin di instance-mu menolak payload
            // tanpa table-id valid, isi dengan AD_Table_ID punya M_Product
            // (biasanya 208) dan record-id = id produk ini.
            const res = await callProcessByValue(processValue, {
                "table-id": 0,
                "record-id": 0,
                M_Product_ID: parseInt(id, 10),
                IsReValidate: true,
            });
            const summary = res?.summary || res?.Summary || res?.["summary"] || "Verify BOM Structure berhasil dijalankan.";
            showSuccess(summary);
            // Verify BOM bisa mengubah flag/stok turunan di server (mis.
            // Phantom), jadi data produk & BOM di form disegarkan.
            await Promise.all([fetchProduct(), fetchBom()]);
        } catch (err) {
            console.error("Gagal menjalankan Verify BOM Structure:", err);
            alert(`Gagal menjalankan Verify BOM Structure.\n\n${parseIdempiereError(err)}`);
        } finally {
            setIsVerifyingBom(false);
        }
    };

    // ─── Flag produk: aturan keterkaitan antar checkbox ─────────────────────
    // - Hapus centang IsBOM → Phantom & BOM Price Override ikut dimatikan.
    // - Centang Phantom → IsStocked dimatikan (produk Phantom tidak punya
    //   stok fisik sendiri; stoknya diturunkan dari komponen BOM-nya).
    const handleFlagChange = (field, checked) => {
        setForm((prev) => {
            const next = { ...prev, [field]: checked };
            if (field === "IsBOM" && !checked) {
                next.IsPhantom = false;
                next.IsBOMPriceOverride = false;
            }
            if (field === "IsPhantom" && checked) {
                next.IsStocked = false;
            }
            return next;
        });
    };

    // ─── BOM: semua operasi HANYA mengubah state lokal ──────────────────────
    const handleBomHeaderChange = (field, value) => {
        setBomHeader((prev) => ({ ...prev, [field]: value, _dirty: true }));
    };

    const handleBomLineChange = (line, field, value) => {
        setBomLines((prev) =>
            prev.map((l) => {
                if (lineKey(l) !== lineKey(line)) return l;
                const updated = { ...l, [field]: value };
                if (getId(l)) updated._dirty = true; // baris lama yang diedit -> perlu PUT
                return updated;
            })
        );
    };

    const handleAddBomLine = (comp) => {
        const nextLine = bomLines.reduce((max, l) => Math.max(max, parseInt(l.Line, 10) || 0), 0) + 10;
        setBomLines((prev) => [
            ...prev,
            {
                _localId: `new-bom-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                // `id: null` eksplisit — pelajaran dari bug Vendor Pricing:
                // tanpa ini getId() salah ambil M_Product_ID (FK berbentuk
                // objek) sebagai PK baris baru dan mengirim PUT ke URL rusak.
                id: null,
                M_Product_ID: { id: getId(comp), identifier: comp.Name },
                // UOM baris = UOM produk komponen (bentuk { id, identifier }).
                C_UOM_ID: comp.C_UOM_ID,
                QtyBOM: 1,
                ComponentType: "CO",
                Line: nextLine,
            },
        ]);
        setBomSearch("");
        setBomSearchResults([]);
    };

    const handleDeleteBomLine = (line) => {
        openConfirm({
            title: "Hapus Komponen BOM",
            message: `Yakin ingin menghapus komponen "${getLabel(line.M_Product_ID)}" dari BOM? Perubahan baru permanen setelah disimpan.`,
            confirmLabel: "Hapus",
            onConfirm: () => {
                const existingId = getId(line);
                if (existingId) {
                    setDeletedBomLineIds((prev) => [...prev, existingId]);
                }
                setBomLines((prev) => prev.filter((l) => lineKey(l) !== lineKey(line)));
            },
        });
    };

    // ─── Vendor Pricing ─────────────────────────────────────────────────────
    const handleVendorLineChange = (line, field, value) => {
        setVendorLines((prev) =>
            prev.map((l) => {
                if (lineKey(l) !== lineKey(line)) return l;
                const updated = { ...l, [field]: value };
                if (getId(l)) updated._dirty = true;
                return updated;
            })
        );
    };

    const handleAddVendorLine = (bp) => {
        setVendorLines((prev) => [
            ...prev,
            {
                _localId: `new-vendor-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                // `id: null` eksplisit, lihat catatan di handleAddBomLine.
                id: null,
                C_BPartner_ID: { id: getId(bp), identifier: bp.Name },
                VendorProductNo: "",
                PriceList: 0,
                PriceLastPO: 0,
            },
        ]);
    };

    const handleDeleteVendorLine = (line) => {
        openConfirm({
            title: "Hapus Vendor",
            message: `Yakin ingin menghapus vendor "${getLabel(line.C_BPartner_ID)}" dari daftar Vendor Pricing? Perubahan baru permanen setelah disimpan.`,
            confirmLabel: "Hapus",
            onConfirm: () => {
                const existingId = getId(line);
                if (existingId) {
                    setDeletedVendorLineIds((prev) => [...prev, existingId]);
                }
                setVendorLines((prev) => prev.filter((l) => lineKey(l) !== lineKey(line)));
            },
        });
    };

    // ─── Sales Price ────────────────────────────────────────────────────────
    const handlePriceLineChange = (line, field, value) => {
        setPriceLines((prev) =>
            prev.map((l) => {
                if (lineKey(l) !== lineKey(line)) return l;
                const updated = { ...l, [field]: value };
                if (getId(l)) updated._dirty = true;
                return updated;
            })
        );
    };

    const handleAddPriceLine = (plv) => {
        setPriceLines((prev) => [
            ...prev,
            {
                _localId: `new-price-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                id: null,
                M_PriceList_Version_ID: { id: getId(plv), identifier: getLabel(plv.Name) || plv.Name },
                PriceList: 0,
                PriceStd: 0,
                PriceLimit: 0,
            },
        ]);
    };

    const handleDeletePriceLine = (line) => {
        openConfirm({
            title: "Hapus Sales Price",
            message: `Yakin ingin menghapus baris harga untuk "${getLabel(line.M_PriceList_Version_ID)}"? Perubahan baru permanen setelah disimpan.`,
            confirmLabel: "Hapus",
            onConfirm: () => {
                const existingId = getId(line);
                if (existingId) {
                    setDeletedPriceLineIds((prev) => [...prev, existingId]);
                }
                setPriceLines((prev) => prev.filter((l) => lineKey(l) !== lineKey(line)));
            },
        });
    };

    // ─── UOM Conversion ─────────────────────────────────────────────────────
    const handleUomLineChange = (line, field, value) => {
        setUomLines((prev) =>
            prev.map((l) => {
                if (lineKey(l) !== lineKey(line)) return l;
                const updated = { ...l, [field]: value };
                if (getId(l)) updated._dirty = true;
                return updated;
            })
        );
    };

    const handleAddUomLine = (uom) => {
        setUomLines((prev) => [
            ...prev,
            {
                _localId: `new-uom-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                id: null,
                C_UOM_To_ID: { id: getId(uom), identifier: uom.Name },
                DivideRate: "",
            },
        ]);
    };

    const handleDeleteUomLine = (line) => {
        openConfirm({
            title: "Hapus UOM Conversion",
            message: `Yakin ingin menghapus konversi ke UOM "${getLabel(line.C_UOM_To_ID)}"? Perubahan baru permanen setelah disimpan.`,
            confirmLabel: "Hapus",
            onConfirm: () => {
                const existingId = getId(line);
                if (existingId) {
                    setDeletedUomLineIds((prev) => [...prev, existingId]);
                }
                setUomLines((prev) => prev.filter((l) => lineKey(l) !== lineKey(line)));
            },
        });
    };

    // ─── Gambar Produk: upload langsung saat file dipilih ───────────────────
    const MAX_IMAGE_SIZE_MB = 5;
    const handleImageFileChange = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            setImageError("File yang dipilih harus berupa gambar (JPG, PNG, dll).");
            return;
        }
        if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
            setImageError(`Ukuran gambar maksimal ${MAX_IMAGE_SIZE_MB}MB.`);
            return;
        }

        setImageError(null);
        setIsUploadingImage(true);
        try {
            await uploadProductAttachment(id, file);
            await fetchProductImages();
        } catch (err) {
            console.error("Gagal mengunggah gambar produk:", err);
            setImageError(err.message || "Gagal mengunggah gambar.");
        } finally {
            setIsUploadingImage(false);
        }
    };

    const handleDeleteAllImages = () => {
        openConfirm({
            title: "Hapus Semua Gambar",
            message: "Ini akan menghapus SEMUA gambar produk ini (tidak bisa hapus satu per satu). Lanjutkan?",
            confirmLabel: "Hapus Semua",
            onConfirm: async () => {
                setIsDeletingImages(true);
                try {
                    await deleteAllProductAttachments(id);
                    await fetchProductImages();
                } catch (err) {
                    console.error("Gagal menghapus gambar produk:", err);
                    alert(`Gagal menghapus gambar.\n${err.message || ""}`);
                } finally {
                    setIsDeletingImages(false);
                }
            },
        });
    };

    // Label UOM dasar (ikut berubah saat user mengganti UOM di form) & opsi UOM
    // tujuan yang masih bisa ditambah: bukan UOM dasar, belum dipakai baris lain.
    const baseUomLabel =
        uoms.find((u) => String(getId(u)) === String(form.C_UOM_ID))?.Name ||
        (product ? getLabel(product.C_UOM_ID) : "UOM dasar");
    const availableUomTargets = uoms.filter(
        (u) =>
            String(getId(u)) !== String(form.C_UOM_ID) &&
            !uomLines.some((l) => String(getId(l.C_UOM_To_ID)) === String(getId(u)))
    );

    // Hasil pencarian komponen: bukan produk ini sendiri & belum ada di BOM.
    const filteredBomResults = bomSearchResults.filter(
        (p) =>
            String(getId(p)) !== String(id) &&
            !bomLines.some((l) => String(getId(l.M_Product_ID)) === String(getId(p)))
    );

    return (
        <div className="card-container">
            <div className="detail-topbar">
                <button onClick={() => navigate(-1)} className="btn btn-secondary">← Back to List</button>
                <span className="product-id-badge">{isNew ? "Produk Baru" : `Product ID: ${id}`}</span>
                {isNew ? (
                    <div className="topbar-actions">
                        <button className="btn btn-ghost" onClick={() => navigate(-1)} disabled={isSaving}>Batal</button>
                        <button className="btn btn-primary" onClick={handleSaveAll} disabled={isSaving}>
                            {isSaving ? "Menyimpan..." : "💾 Save Product"}
                        </button>
                    </div>
                ) : !isEditing ? (
                    <button className="btn btn-secondary" onClick={() => setIsEditing(true)}>✏ Edit</button>
                ) : (
                    <div className="topbar-actions">
                        <button className="btn btn-ghost" onClick={handleCancelEdit} disabled={isSaving}>Batal</button>
                        <button className="btn btn-primary" onClick={handleSaveAll} disabled={isSaving}>
                            {isSaving ? "Menyimpan..." : "💾 Simpan"}
                        </button>
                    </div>
                )}
            </div>

            <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* SECTION 1: INFORMASI UTAMA */}
                <div className="detail-section">
                    <h3>General Information</h3>
                    <div className="info-group">
                        <label>Search Key *</label>
                        {isEditing ? (
                            <input value={form.Value} onChange={(e) => setForm({ ...form, Value: e.target.value })} />
                        ) : <p>{product.Value}</p>}

                        <label>Name *</label>
                        {isEditing ? (
                            <input value={form.Name} onChange={(e) => setForm({ ...form, Name: e.target.value })} />
                        ) : <p>{product.Name}</p>}

                        <label>UPC / Barcode</label>
                        {isEditing ? (
                            <input maxLength={30} value={form.UPC} onChange={(e) => setForm({ ...form, UPC: e.target.value })} />
                        ) : <p>{product.UPC || '-'}</p>}

                        <label>Description</label>
                        {isEditing ? (
                            <textarea value={form.Description} onChange={(e) => setForm({ ...form, Description: e.target.value })} />
                        ) : <p>{product.Description || '-'}</p>}

                        {/* ── Gambar Produk (AD_Attachment) ── */}
                        <label>Gambar Produk</label>
                        {isNew ? (
                            <p className="muted-note">Simpan produk terlebih dahulu untuk bisa mengunggah gambar.</p>
                        ) : (
                            <div className="product-image-section">
                                {isLoadingImages ? (
                                    <p className="muted-note">Memuat gambar...</p>
                                ) : productImages.length === 0 ? (
                                    <p className="empty-note">Belum ada gambar.</p>
                                ) : (
                                    <div
                                        className="product-image-gallery"
                                        style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}
                                    >
                                        {productImages.map((img) => (
                                            <div
                                                key={img.name}
                                                className="product-image-thumb"
                                                style={{ width: '100px', height: '100px' }}
                                            >
                                                <img
                                                    src={img.url}
                                                    alt={img.name}
                                                    style={{
                                                        width: '100px', height: '100px',
                                                        objectFit: 'cover', borderRadius: '6px',
                                                        border: '1px solid #ddd',
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {isEditing && (
                                    <div className="inline-add-box" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageFileChange}
                                            disabled={isUploadingImage}
                                        />
                                        {isUploadingImage && <span className="muted-note">Mengunggah...</span>}
                                        {productImages.length > 0 && (
                                            <button
                                                type="button"
                                                className="icon-btn icon-btn-delete"
                                                title="Hapus semua gambar"
                                                onClick={handleDeleteAllImages}
                                                disabled={isDeletingImages}
                                            >
                                                {isDeletingImages ? "Menghapus..." : "🗑️ Hapus Semua Gambar"}
                                            </button>
                                        )}
                                    </div>
                                )}
                                {imageError && <p className="error-note">{imageError}</p>}
                            </div>
                        )}
                    </div>
                </div>

                {/* SECTION 2: STATUS & GRUP */}
                <div className="detail-section">
                    
                        <h3>Classification</h3>
                        
                        <div className="info-group">
                            <div className="classification-grid">
                                <div className="classification-section">
                                    <label>Product Category *</label>
                                    {isEditing ? (
                                        <select
                                            value={form.M_Product_Category_ID}
                                            onChange={(e) => setForm({ ...form, M_Product_Category_ID: e.target.value })}
                                        >
                                            <option value="">-- Pilih Product Category --</option>
                                            {productCategories.map((c, idx) => (
                                                <option key={getId(c) ?? `cat-${idx}`} value={getId(c)}>{c.Name || getId(c)}</option>
                                            ))}
                                        </select>
                                    ) : <p>{getLabel(product.M_Product_Category_ID)}</p>}
                                </div>
                                <div className="classification-section">
                                    <label>UOM *</label>
                                    {isEditing ? (
                                        <select
                                            value={form.C_UOM_ID}
                                            onChange={(e) => setForm({ ...form, C_UOM_ID: e.target.value })}
                                        >
                                            <option value="">-- Pilih UOM --</option>
                                            {uoms.map((u, idx) => (
                                                <option key={getId(u) ?? `uom-${idx}`} value={getId(u)}>{u.Name}</option>
                                            ))}
                                        </select>
                                    ) : <p>{getLabel(product.C_UOM_ID)}</p>}
                                </div>
                                <div className="classification-section">
                                    <label>Charge (Internal Use)</label>
                                    {isEditing ? (
                                        <select
                                            value={form.C_Charge_ID}
                                            onChange={(e) => setForm({ ...form, C_Charge_ID: e.target.value })}
                                        >
                                            <option value="">-- Tanpa Default Charge --</option>
                                            {charges.map((c, idx) => (
                                                <option key={getId(c) ?? `chg-${idx}`} value={getId(c)}>{c.Name || getId(c)}</option>
                                            ))}
                                        </select>
                                    ) : <p>{product ? getLabel(product.C_Charge_ID) : "-"}</p>}
                                </div>
                            </div>
                        {/* Container Grid Khusus Checkbox / Status Flags */}
                        <div className="checkbox-grid">
                            <div className="checkbox-item">
                                <label>Purchased ?</label>
                                {isEditing ? (
                                    <input 
                                        type="checkbox" 
                                        checked={form.IsPurchased} 
                                        onChange={(e) => setForm({ ...form, IsPurchased: e.target.checked })} 
                                    />
                                ) : <span>{isYes(product.IsPurchased) ? 'Yes' : 'No'}</span>}
                            </div>

                            <div className="checkbox-item">
                                <label>Sold ?</label>
                                {isEditing ? (
                                    <input 
                                        type="checkbox" 
                                        checked={form.IsSold} 
                                        onChange={(e) => setForm({ ...form, IsSold: e.target.checked })} 
                                    />
                                ) : <span>{isYes(product.IsSold) ? 'Yes' : 'No'}</span>}
                            </div>

                            <div className="checkbox-item">
                                <label title="Produk yang dikelola stoknya di gudang">Stocked ?</label>
                                {isEditing ? (
                                    <input
                                        type="checkbox"
                                        checked={form.IsStocked}
                                        disabled={form.IsPhantom}
                                        title={form.IsPhantom ? "Produk Phantom tidak punya stok sendiri" : undefined}
                                        onChange={(e) => handleFlagChange("IsStocked", e.target.checked)}
                                    />
                                ) : <span>{isYes(product.IsStocked) ? 'Yes' : 'No'}</span>}
                            </div>

                            <div className="checkbox-item">
                                <label>BOM ?</label>
                                {isEditing ? (
                                    <input 
                                        type="checkbox" 
                                        checked={form.IsBOM} 
                                        onChange={(e) => handleFlagChange("IsBOM", e.target.checked)} 
                                    />
                                ) : <span>{isYes(product.IsBOM) ? 'Yes' : 'No'}</span>}
                            </div>

                            {/* Phantom & BOM Price Override hanya dipanggil jika IsBOM true */}
                            {form.IsBOM && (
                                <>
                                    <div className="checkbox-item">
                                        <label title="Stok produk diturunkan dari stok komponen BOM-nya">Phantom ?</label>
                                        {isEditing ? (
                                            <input 
                                                type="checkbox" 
                                                checked={form.IsPhantom} 
                                                onChange={(e) => handleFlagChange("IsPhantom", e.target.checked)} 
                                            />
                                        ) : <span>{isYes(product.IsPhantom) ? 'Yes' : 'No'}</span>}
                                    </div>

                                    <div className="checkbox-item">
                                        <label>BOMPriceOverride ?</label>
                                        {isEditing ? (
                                            <input 
                                                type="checkbox" 
                                                checked={form.IsBOMPriceOverride} 
                                                onChange={(e) => handleFlagChange("IsBOMPriceOverride", e.target.checked)} 
                                            />
                                        ) : <span>{isYes(product.IsBOMPriceOverride) ? 'Yes' : 'No'}</span>}
                                    </div>
                                </>
                            )}
                        </div>

                        <label>Markup % (AutoPrice)</label>
                        {isEditing ? (
                            <input
                                type="number" step="0.01"
                                value={form.MarkupPercent}
                                onChange={(e) => setForm({ ...form, MarkupPercent: e.target.value })}
                            />
                        ) : <p>{product.MarkupPercent ?? 0}%</p>}

                        <label>Rounding Type (AutoPrice)</label>
                        {isEditing ? (
                            <select
                                value={form.RoundingType}
                                onChange={(e) => setForm({ ...form, RoundingType: e.target.value })}
                            >
                                {ROUNDING_TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        ) : (
                            <p>
                                {ROUNDING_TYPE_OPTIONS.find((o) => o.value === getId(product.RoundingType))?.label
                                    || getLabel(product.RoundingType)}
                            </p>
                        )}
                    </div>
                </div>

                {/* SECTION 3: BILL OF MATERIALS (PP_Product_BOM + PP_Product_BOMLine) */}
                {/* Hanya tampil kalau IsBOM dicentang. Seperti Vendor Pricing, semua
                    perubahan di sini murni state lokal sampai tombol Simpan diklik. */}
                {form.IsBOM && (
                    <div className="detail-section" style={{ gridColumn: '1 / -1' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0 }}>Bill of Materials</h3>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handleVerifyBom}
                                disabled={isVerifyingBom || isNew || !id}
                                title="Jalankan AD_Process Verify BOM Structure (org.compiere.process.BOMVerify) di server — perlu dijalankan setelah komponen BOM/Phantom diubah supaya explosion BOM berjalan konsisten"
                            >
                                {isVerifyingBom ? "Memverifikasi..." : "🔍 Verify BOM Structure"}
                            </button>
                        </div>

                        {isLoadingBom ? (
                            <p className="muted-note">Memuat...</p>
                        ) : (
                            <>
                                <div className="info-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                                    <div>
                                        <label>BOM Value</label>
                                        {isEditing ? (
                                            <input
                                                value={bomHeader.Value}
                                                placeholder={form.Value || "Default: Search Key produk"}
                                                onChange={(e) => handleBomHeaderChange("Value", e.target.value)}
                                            />
                                        ) : <p>{bomHeader.Value || '-'}</p>}
                                    </div>
                                    <div>
                                        <label>BOM Name</label>
                                        {isEditing ? (
                                            <input
                                                value={bomHeader.Name}
                                                placeholder={form.Name || "Default: Name produk"}
                                                onChange={(e) => handleBomHeaderChange("Name", e.target.value)}
                                            />
                                        ) : <p>{bomHeader.Name || '-'}</p>}
                                    </div>
                                    <div>
                                        <label>BOM Type</label>
                                        {isEditing ? (
                                            <select value={bomHeader.BOMType} onChange={(e) => handleBomHeaderChange("BOMType", e.target.value)}>
                                                {BOM_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        ) : <p>{BOM_TYPE_OPTIONS.find((o) => o.value === bomHeader.BOMType)?.label || bomHeader.BOMType}</p>}
                                    </div>
                                    <div>
                                        <label>BOM Use</label>
                                        {isEditing ? (
                                            <select value={bomHeader.BOMUse} onChange={(e) => handleBomHeaderChange("BOMUse", e.target.value)}>
                                                {BOM_USE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        ) : <p>{BOM_USE_OPTIONS.find((o) => o.value === bomHeader.BOMUse)?.label || bomHeader.BOMUse}</p>}
                                    </div>
                                </div>

                                <h4 style={{ margin: '16px 0 8px' }}>Komponen (PP_Product_BOMLine)</h4>
                                {bomLines.length === 0 ? (
                                    <p className="empty-note">Belum ada komponen BOM.</p>
                                ) : (
                                    <table className="modern-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '70px' }}>Line</th>
                                                <th>Komponen</th>
                                                <th style={{ textAlign: 'right' }}>Qty BOM</th>
                                                <th>UOM</th>
                                                <th>Tipe</th>
                                                {isEditing && <th style={{ width: '60px' }}></th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bomLines.map((line) => {
                                                const key = lineKey(line);
                                                return (
                                                    <tr key={key}>
                                                        {isEditing ? (
                                                            <>
                                                                <td>
                                                                    <input
                                                                        type="number" style={{ width: '60px' }}
                                                                        value={line.Line ?? ""}
                                                                        onChange={(e) => handleBomLineChange(line, "Line", e.target.value)}
                                                                    />
                                                                </td>
                                                                <td>{getLabel(line.M_Product_ID)}</td>
                                                                <td>
                                                                    <input
                                                                        type="number" step="0.0001" style={{ textAlign: 'right', width: '100px' }}
                                                                        value={line.QtyBOM ?? 0}
                                                                        onChange={(e) => handleBomLineChange(line, "QtyBOM", e.target.value)}
                                                                    />
                                                                </td>
                                                                <td>{getLabel(line.C_UOM_ID)}</td>
                                                                <td>
                                                                    <select
                                                                        value={getId(line.ComponentType) || "CO"}
                                                                        onChange={(e) => handleBomLineChange(line, "ComponentType", e.target.value)}
                                                                    >
                                                                        {COMPONENT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                                    </select>
                                                                </td>
                                                                <td className="row-actions">
                                                                    <button className="icon-btn icon-btn-delete" title="Hapus komponen" onClick={() => handleDeleteBomLine(line)}>🗑️</button>
                                                                </td>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <td>{line.Line}</td>
                                                                <td>{getLabel(line.M_Product_ID)}</td>
                                                                <td style={{ textAlign: 'right' }}>{line.QtyBOM ?? 0}</td>
                                                                <td>{getLabel(line.C_UOM_ID)}</td>
                                                                <td>
                                                                    {COMPONENT_TYPE_OPTIONS.find((o) => o.value === getId(line.ComponentType))?.label
                                                                        || getLabel(line.ComponentType)}
                                                                </td>
                                                            </>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}

                                {/* Tambah komponen — cari by nama/kode (bukan dropdown penuh,
                                    karena daftar produk bisa sangat panjang). */}
                                {isEditing && (
                                    <div className="inline-add-box">
                                        <input
                                            value={bomSearch}
                                            onChange={(e) => setBomSearch(e.target.value)}
                                            placeholder="+ Cari produk komponen (nama / kode)..."
                                        />
                                        {bomSearching && <span className="muted-note"> Mencari...</span>}
                                        {filteredBomResults.length > 0 && (
                                            <div style={{
                                                border: '1px solid #ddd', borderRadius: '6px', background: '#fff',
                                                marginTop: '4px', maxHeight: '200px', overflowY: 'auto',
                                            }}>
                                                {filteredBomResults.map((p, idx) => (
                                                    <div
                                                        key={getId(p) ?? `bomsr-${idx}`}
                                                        onClick={() => handleAddBomLine(p)}
                                                        style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #eee' }}
                                                    >
                                                        {p.Value} — {p.Name} <span className="muted-note">({getLabel(p.C_UOM_ID)})</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* SECTION 3B: UOM CONVERSION (C_UOM_Conversion) */}
                {/* "1 <UOM konversi> = X <UOM dasar>". MultiplyRate dihitung otomatis
                    (1 / X) dan hanya ditampilkan; murni state lokal sampai Simpan. */}
                <div className="detail-section" style={{ gridColumn: '1 / -1' }}>
                    <h3>UOM Conversion</h3>

                    {isLoadingUomLines ? (
                        <p className="muted-note">Memuat...</p>
                    ) : uomLines.length === 0 ? (
                        <p className="empty-note">Belum ada UOM Conversion.</p>
                    ) : (
                        <table className="modern-table">
                            <thead>
                                <tr>
                                    <th>UOM Konversi</th>
                                    <th style={{ textAlign: 'right' }}>Isi per 1 UOM Konversi (dalam {baseUomLabel})</th>
                                    <th style={{ textAlign: 'right' }}>Multiply Rate</th>
                                    {isEditing && <th style={{ width: '60px' }}></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {uomLines.map((line) => {
                                    const key = lineKey(line);
                                    const toLabel = getLabel(line.C_UOM_To_ID);
                                    return (
                                        <tr key={key}>
                                            <td>{toLabel}</td>
                                            {isEditing ? (
                                                <>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <span className="muted-note">1 {toLabel} = </span>
                                                        <input
                                                            type="number" step="0.0001" min="0" style={{ textAlign: 'right', width: '110px' }}
                                                            value={line.DivideRate ?? ""}
                                                            onChange={(e) => handleUomLineChange(line, "DivideRate", e.target.value)}
                                                        />
                                                        <span className="muted-note"> {baseUomLabel}</span>
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>{calcMultiplyRate(line.DivideRate) ?? "-"}</td>
                                                    <td className="row-actions">
                                                        <button className="icon-btn icon-btn-delete" title="Hapus baris" onClick={() => handleDeleteUomLine(line)}>🗑️</button>
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td style={{ textAlign: 'right' }}>1 {toLabel} = {line.DivideRate || "-"} {baseUomLabel}</td>
                                                    <td style={{ textAlign: 'right' }}>{calcMultiplyRate(line.DivideRate) ?? "-"}</td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}

                    {isEditing && (
                        <div className="inline-add-box inline-add-box-select">
                            <select
                                className="add-price-select"
                                defaultValue=""
                                disabled={!form.C_UOM_ID}
                                title={!form.C_UOM_ID ? "Pilih UOM dasar produk terlebih dahulu" : undefined}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        const uom = uoms.find((u) => String(getId(u)) === e.target.value);
                                        if (uom) handleAddUomLine(uom);
                                        e.target.value = "";
                                    }
                                }}
                            >
                                <option value="">+ Tambah UOM Konversi...</option>
                                {availableUomTargets.map((u, idx) => (
                                    <option key={getId(u) ?? `uomto-${idx}`} value={getId(u)}>{u.Name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* SECTION 4: VENDOR PRICING (M_BPartnerProduct) */}
                <div className="detail-section" style={{ gridColumn: '1 / -1' }}>
                    <h3>Vendor Pricing</h3>

                    {isLoadingVendorLines ? (
                        <p className="muted-note">Memuat...</p>
                    ) : vendorLines.length === 0 ? (
                        <p className="empty-note">Belum ada Vendor Pricing.</p>
                    ) : (
                        <table className="modern-table">
                            <thead>
                                <tr>
                                    <th>Vendor</th>
                                    <th>Vendor Product No</th>
                                    <th style={{ textAlign: 'right' }}>Price List (Vendor)</th>
                                    <th style={{ textAlign: 'right' }}>Price Last PO</th>
                                    {isEditing && <th style={{ width: '60px' }}></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {vendorLines.map((line) => {
                                    const key = lineKey(line);
                                    return (
                                        <tr key={key}>
                                            <td>{getLabel(line.C_BPartner_ID)}</td>
                                            {isEditing ? (
                                                <>
                                                    <td>
                                                        <input
                                                            value={line.VendorProductNo || ""}
                                                            onChange={(e) => handleVendorLineChange(line, "VendorProductNo", e.target.value)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="number" step="0.01" style={{ textAlign: 'right', width: '100px' }}
                                                            value={line.PriceList ?? 0}
                                                            onChange={(e) => handleVendorLineChange(line, "PriceList", e.target.value)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="number" step="0.01" style={{ textAlign: 'right', width: '100px' }}
                                                            value={line.PriceLastPO ?? 0}
                                                            onChange={(e) => handleVendorLineChange(line, "PriceLastPO", e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="row-actions">
                                                        <button className="icon-btn icon-btn-delete" title="Hapus baris" onClick={() => handleDeleteVendorLine(line)}>🗑️</button>
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td>{line.VendorProductNo || "-"}</td>
                                                    <td style={{ textAlign: 'right' }}>{line.PriceList ?? 0}</td>
                                                    <td style={{ textAlign: 'right' }}>{line.PriceLastPO ?? 0}</td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}

                    {isEditing && (
                        <div className="inline-add-box">
                            <select
                                className="add-vendor-select"
                                defaultValue=""
                                onChange={(e) => {
                                    if (e.target.value) {
                                        const bp = vendorOptions.find((v) => String(getId(v)) === e.target.value);
                                        if (bp) handleAddVendorLine(bp);
                                        e.target.value = "";
                                    }
                                }}
                            >
                                <option value="">+ Tambah Vendor...</option>
                                {vendorOptions
                                    .filter((bp) => !vendorLines.some((l) => getId(l.C_BPartner_ID) === getId(bp)))
                                    .map((bp, idx) => (
                                        <option key={getId(bp) ?? `bp-${idx}`} value={getId(bp)}>{bp.Name}</option>
                                    ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* SECTION 5: SALES PRICE (M_ProductPrice) */}
                <div className="detail-section" style={{ gridColumn: '1 / -1' }}>
                    <h3>Price List</h3>

                    {isLoadingPriceLines ? (
                        <p className="muted-note">Memuat...</p>
                    ) : priceLines.length === 0 ? (
                        <p className="empty-note">Belum ada Sales Price.</p>
                    ) : (
                        <table className="modern-table">
                            <thead>
                                <tr>
                                    <th>Price List Version</th>
                                    <th style={{ textAlign: 'right' }}>Price List</th>
                                    <th style={{ textAlign: 'right' }}>Price Std (Jual)</th>
                                    <th style={{ textAlign: 'right' }}>Price Limit</th>
                                    {isEditing && <th style={{ width: '60px' }}></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {priceLines.map((line) => {
                                    const key = lineKey(line);
                                    return (
                                        <tr key={key}>
                                            <td>{getLabel(line.M_PriceList_Version_ID)}</td>
                                            {isEditing ? (
                                                <>
                                                    <td>
                                                        <input
                                                            type="number" step="0.01" style={{ textAlign: 'right', width: '90px' }}
                                                            value={line.PriceList ?? 0}
                                                            onChange={(e) => handlePriceLineChange(line, "PriceList", e.target.value)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="number" step="0.01" style={{ textAlign: 'right', width: '90px' }}
                                                            value={line.PriceStd ?? 0}
                                                            onChange={(e) => handlePriceLineChange(line, "PriceStd", e.target.value)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="number" step="0.01" style={{ textAlign: 'right', width: '90px' }}
                                                            value={line.PriceLimit ?? 0}
                                                            onChange={(e) => handlePriceLineChange(line, "PriceLimit", e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="row-actions">
                                                        <button className="icon-btn icon-btn-delete" title="Hapus baris" onClick={() => handleDeletePriceLine(line)}>🗑️</button>
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td style={{ textAlign: 'right' }}>{line.PriceList ?? 0}</td>
                                                    <td style={{ textAlign: 'right' }}>{line.PriceStd ?? 0}</td>
                                                    <td style={{ textAlign: 'right' }}>{line.PriceLimit ?? 0}</td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}

                    {isEditing && (
                        <div className="inline-add-box inline-add-box-select">
                            <select
                                className="add-price-select"
                                defaultValue=""
                                onChange={(e) => {
                                    if (e.target.value) {
                                        const plv = priceListVersions.find((v) => String(getId(v)) === e.target.value);
                                        if (plv) handleAddPriceLine(plv);
                                        e.target.value = "";
                                    }
                                }}
                            >
                                <option value="">+ Tambah ke Price List Version...</option>
                                {priceListVersions
                                    .filter((plv) => !priceLines.some((pl) => getId(pl.M_PriceList_Version_ID) === getId(plv)))
                                    .map((plv, idx) => (
                                        <option key={getId(plv) ?? `plv-${idx}`} value={getId(plv)}>{plv.Name || getId(plv)}</option>
                                    ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            <SuccessModal
                isOpen={successModal.isOpen}
                message={successModal.message}
                onClose={() => setSuccessModal({ isOpen: false, message: "" })}
            />

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmLabel={confirmModal.confirmLabel}
                danger={confirmModal.danger}
                onConfirm={handleConfirmModalConfirm}
                onCancel={closeConfirm}
            />
        </div>
    );
}

export default ProductDetail;