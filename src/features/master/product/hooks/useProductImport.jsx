import { useState, useCallback } from "react";
import { idempiereApi, fkId } from "@/api/idempiereApi";
// Reuse konstanta & parser error yang sudah ada supaya perilaku import
// konsisten dengan halaman ProductDetail (nama tabel vendor pricing,
// pesan error mandatory yang ramah, dll).
import { VENDOR_PRICING_TABLE, parseIdempiereError } from "./useProductDetailSubmit";

/**
 * useProductImport
 * ─────────────────────────────────────────────────────────────────────────
 * Hook untuk fitur Import Produk CSV.
 *
 * Input berupa array PRODUK hasil groupProductRows() (productCsvParser.js),
 * di mana tiap produk punya `prices` = daftar harga jual per Price List
 * Version (bisa 0, 1, atau banyak).
 *
 *   validateRows(rows)  → cek mandatory, duplikat Search Key (server), resolve
 *                         kategori/UOM/vendor/price-list-version by name.
 *                         Tiap row jadi row._status = "valid" | "invalid"
 *                         + row._errors + row._resolved + row._resolvedPrices.
 *   startImport(rows)   → POST m_product per baris valid, lalu (opsional)
 *                         Vendor Pricing (VENDOR_PRICING_TABLE) & Sales Price
 *                         (m_productprice) — SATU POST per price list version.
 *                         Tiap row jadi "success" | "failed".
 *
 * Import bersifat IDEMPOTEN per langkah: row menyimpan _productId,
 * _vendorDone, dan _pricesDone (Set plvId). Kalau gagal di tengah (mis.
 * produk sudah ter-create tapi harga ke-2 gagal), retry hanya mengerjakan
 * sisa yang belum selesai — produk tidak dibuat ulang.
 *
 * CATATAN: BOM (IsBOM + komponen) SENGAJA tidak diimpor dari CSV — struktur
 * multi-baris komponen tidak natural di format flat CSV. Produk dengan
 * is_bom=y tetap bisa diimpor (flag-nya terset), komponen diisi lewat
 * halaman edit ProductDetail.
 */

// ⚠️ Mirror ROUNDING_TYPE_OPTIONS di ProductDetail.jsx — sesuaikan kalau
// AD_Ref_List RoundingType di instance-mu berbeda.
const ROUNDING_ALLOWED = [0, 50, 100, 500, 1000, 5000, 10000];

const parseBool = (v) =>
    ["y", "yes", "true", "1", "t"].includes(String(v ?? "").trim().toLowerCase());

// Angka toleran format Indonesia: "1500,50", "1.500.000", "1.500.000,50".
const parseNumber = (v) => {
    if (v === "" || v == null) return null;
    let s = String(v).trim().replace(/\s/g, "");
    if (s.includes(",") && s.includes(".")) {
        s = s.replace(/\./g, "").replace(",", ".");      // 1.500.000,50
    } else if (s.includes(",")) {
        const parts = s.split(",");
        s = parts.length > 1 && parts[parts.length - 1].length === 3
            ? s.replace(/,/g, "")                          // 1,500 → 1500
            : s.replace(",", ".");                         // 1500,50 → 1500.50
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
};

// OData escape untuk string yang masuk ke $filter
const odataEscape = (s) => String(s).replace(/'/g, "''");

const addError = (row, msg) => { (row._errors = row._errors || []).push(msg); };

function buildProductPayload(row) {
    return {
        Value: row.value,
        Name: row.name,
        Description: row.description || "",
        ...(row.upc ? { UPC: row.upc } : {}),
        IsPurchased: parseBool(row.is_purchased),
        IsSold: parseBool(row.is_sold),
        // Default IsStocked = true, sama seperti default kolom di iDempiere.
        IsStocked: row.is_stocked ? parseBool(row.is_stocked) : true,
        IsBOM: parseBool(row.is_bom),
        // Phantom & BOM Price Override tidak diimpor — default false,
        // sama seperti payload ProductDetail.jsx.
        IsPhantom: false,
        IsBOMPriceOverride: false,
        MarkupPercent: row.markup_percent ? parseNumber(row.markup_percent) : 0,
        RoundingType: row.rounding_type ? parseNumber(row.rounding_type) : 0,
        M_Product_Category_ID: { id: parseInt(row._resolved.categoryId, 10) },
        C_UOM_ID: { id: parseInt(row._resolved.uomId, 10) },
        // Custom field C_Charge_ID (default charge Internal Use), opsional.
        ...(row._resolved.chargeId ? { C_Charge_ID: { id: parseInt(row._resolved.chargeId, 10) } } : {}),
    };
}

export default function useProductImport() {
    // idle → validating → ready → importing → done
    const [phase, setPhase] = useState("idle");
    const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
    const [summary, setSummary] = useState(null); // { success, failed }

    // ─── VALIDASI ─────────────────────────────────────────────────────────
    const validateRows = useCallback(async (rows) => {
        setPhase("validating");
        setSummary(null);

        // 0) Reset state validasi supaya re-validasi (retry) idempoten.
        //    Error konflik dari grouping (_groupErrors) dipertahankan.
        //    _productId / _vendorDone / _pricesDone SENGAJA tidak disentuh.
        rows.forEach((r) => {
            r._errors = [...(r._groupErrors || [])];
            r._resolved = {};
            r._resolvedPrices = [];
        });

        // 1) Cache referensi: kategori produk, UOM, price list version
        let cats = [], uoms = [], plvs = [], charges = [];
        try {
            const [catRes, uomRes, plvRes, chargeRes] = await Promise.all([
                idempiereApi(`/models/m_product_category?$filter=IsActive eq true&$select=Name`),
                idempiereApi(`/models/c_uom?$filter=IsActive eq true&$select=Name`),
                idempiereApi(`/models/m_pricelist_version?$filter=IsActive eq true&$select=Name`),
                idempiereApi(`/models/c_charge?$filter=IsActive eq true&$select=Name`),
            ]);
            cats = catRes.records || [];
            uoms = uomRes.records || [];
            plvs = plvRes.records || [];
            charges = chargeRes.records || [];
        } catch (err) {
            rows.forEach((r) => {
                r._status = "invalid";
                r._errors = ["Gagal memuat data referensi (kategori/UOM/charge/price list): " + err.message];
            });
            setPhase("ready");
            return rows;
        }
        const findByName = (list, name) =>
            list.find((x) => (x.Name || "").trim().toLowerCase() === name.toLowerCase());

        // 2) Duplikat Search Key di dalam file: TIDAK dicek lagi di sini.
        //    Baris ber-value sama sekarang sengaja digabung jadi satu produk
        //    (multi price list) oleh groupProductRows().

        // 3) Duplikat Search Key ke SERVER (per unique value, pakai contains
        //    + exact match client-side — pola yang terbukti jalan di ProductDetail).
        //    Produk yang sudah ter-create oleh sesi import ini (_productId)
        //    dilewati supaya retry parsial tidak dianggap duplikat.
        const uniqueValues = [...new Set(
            rows.filter((r) => !r._productId).map((r) => r.value).filter(Boolean)
        )];
        const existingValues = new Set();
        for (const v of uniqueValues) {
            try {
                const res = await idempiereApi(
                    `/models/m_product?$filter=contains(toupper(Value),toupper('${odataEscape(v)}'))&$select=Value&$top=50`
                );
                if ((res.records || []).some((r) => (r.Value || "").toLowerCase() === v.toLowerCase())) {
                    existingValues.add(v.toLowerCase());
                }
            } catch (_) { /* gagal cek → biarkan server yang menolak saat import */ }
        }
        rows.forEach((r) => {
            if (!r._productId && r.value && existingValues.has(r.value.toLowerCase())) {
                addError(r, `Search Key "${r.value}" sudah ada di iDempiere`);
            }
        });
        const uniqueUpcs = [...new Set(
            rows.filter((r) => !r._productId).map((r) => r.upc).filter(Boolean)
        )];
        const existingUpcs = new Set();
        for (const u of uniqueUpcs) {
            try {
                const res = await idempiereApi(
                    `/models/m_product?$filter=UPC eq '${odataEscape(u)}'&$select=Value&$top=1`
                );
                if ((res.records || []).length > 0) existingUpcs.add(u.toLowerCase());
            } catch (_) { /* biarkan server yang menolak */ }
        }
        rows.forEach((r) => {
            if (!r._productId && r.upc && existingUpcs.has(r.upc.toLowerCase())) {
                addError(r, `UPC "${r.upc}" sudah dipakai produk lain di iDempiere`);
            }
        });

        // 4) Resolve vendor per unique nama (hanya kalau ada yang pakai)
        const vendorCache = new Map();
        const vendorNames = [...new Set(rows.map((r) => r.vendor).filter(Boolean))];
        for (const name of vendorNames) {
            try {
                const res = await idempiereApi(
                    `/models/c_bpartner?$filter=IsVendor eq true and contains(toupper(Name),toupper('${odataEscape(name)}'))&$select=Name&$top=50`
                );
                const hit = (res.records || []).find((r) => (r.Name || "").trim().toLowerCase() === name.toLowerCase());
                vendorCache.set(name.toLowerCase(), hit ? (hit.id ?? hit.C_BPartner_ID) : null);
            } catch (_) {
                vendorCache.set(name.toLowerCase(), null);
            }
        }
        const upcSeen = new Map();
        rows.forEach((r) => {
            if (!r.upc) return;
            const k = r.upc.toLowerCase();
            if (upcSeen.has(k)) addError(r, `UPC "${r.upc}" sama dengan produk Search Key "${upcSeen.get(k)}"`);
            else upcSeen.set(k, r.value);
        });
        // 5) Validasi per baris (= per produk)
        const isId = (s) => /^\d+$/.test(s);
        rows.forEach((r) => {
            if (!r.value) addError(r, "Search Key (kolom value) wajib diisi");
            if (!r.name) addError(r, "Name (kolom name) wajib diisi");

            // Product Category: boleh nama ATAU angka ID
            if (!r.product_category) {
                addError(r, "Product Category wajib diisi");
            } else if (isId(r.product_category)) {
                r._resolved.categoryId = parseInt(r.product_category, 10);
            } else {
                const cat = findByName(cats, r.product_category);
                if (!cat) addError(r, `Kategori "${r.product_category}" tidak ditemukan di iDempiere`);
                else r._resolved.categoryId = cat.id ?? cat.M_Product_Category_ID;
            }

            // UOM: boleh nama ATAU angka ID
            if (!r.uom) {
                addError(r, "UOM wajib diisi");
            } else if (isId(r.uom)) {
                r._resolved.uomId = parseInt(r.uom, 10);
            } else {
                const u = findByName(uoms, r.uom);
                if (!u) addError(r, `UOM "${r.uom}" tidak ditemukan di iDempiere`);
                else r._resolved.uomId = u.id ?? u.C_UOM_ID;
            }
            // Charge / C_Charge_ID (opsional): boleh nama ATAU angka ID
            if (r.charge) {
                if (isId(r.charge)) {
                    r._resolved.chargeId = parseInt(r.charge, 10);
                } else {
                    const ch = findByName(charges, r.charge);
                    if (!ch) addError(r, `Charge "${r.charge}" tidak ditemukan di iDempiere`);
                    else r._resolved.chargeId = ch.id ?? ch.C_Charge_ID;
                }
            }
            // UPC/EAN (opsional): maks 30 karakter sesuai M_Product.UPC
            if (r.upc && r.upc.length > 30) {
                addError(r, `UPC "${r.upc}" melebihi 30 karakter`);
            }
            // Angka: markup & rounding
            if (r.markup_percent && Number.isNaN(parseNumber(r.markup_percent))) {
                addError(r, `Markup "${r.markup_percent}" bukan angka valid`);
            }
            const rounding = r.rounding_type ? parseNumber(r.rounding_type) : 0;
            if (!ROUNDING_ALLOWED.includes(rounding)) {
                addError(r, `Rounding Type harus salah satu dari: ${ROUNDING_ALLOWED.join(", ")}`);
            }

            // Vendor (opsional tapi harus valid kalau diisi)
            if (r.vendor) {
                const vid = vendorCache.get(r.vendor.toLowerCase());
                if (!vid) addError(r, `Vendor "${r.vendor}" tidak ditemukan (cek IsVendor & ejaan)`);
                else r._resolved.vendorId = vid;
            }

            // Harga vendor (1 per produk) harus numerik kalau diisi
            ["vendor_price_list", "vendor_price_last_po"].forEach((col) => {
                if (r[col] && Number.isNaN(parseNumber(r[col]))) {
                    addError(r, `Kolom ${col}: "${r[col]}" bukan angka valid`);
                }
            });

            // Sales Price: BANYAK Price List Version per produk
            const seenPlv = new Set();
            (r.prices || []).forEach((p) => {
                const tag = `Baris ${p._row}`;

                if (!p.price_list_version) {
                    addError(r, `${tag}: kolom price_list_version wajib diisi kalau ada harga jual`);
                    return;
                }
                const plv = findByName(plvs, p.price_list_version);
                if (!plv) {
                    addError(r, `${tag}: Price List Version "${p.price_list_version}" tidak ditemukan`);
                    return;
                }
                const plvId = plv.id ?? plv.M_PriceList_Version_ID;

                // M_ProductPrice unik per (Product, PriceListVersion)
                if (seenPlv.has(plvId)) {
                    addError(r, `${tag}: Price List Version "${p.price_list_version}" muncul lebih dari sekali untuk produk ini`);
                    return;
                }
                seenPlv.add(plvId);

                let numOk = true;
                ["sales_price_list", "sales_price_std", "sales_price_limit"].forEach((col) => {
                    if (p[col] && Number.isNaN(parseNumber(p[col]))) {
                        addError(r, `${tag}: kolom ${col} "${p[col]}" bukan angka valid`);
                        numOk = false;
                    }
                });
                if (!numOk) return;

                r._resolvedPrices.push({
                    plvId,
                    plvName: p.price_list_version,
                    list: parseNumber(p.sales_price_list) || 0,
                    std: parseNumber(p.sales_price_std) || 0,
                    limit: parseNumber(p.sales_price_limit) || 0,
                });
            });

            r._status = r._errors.length > 0 ? "invalid" : "valid";
        });

        setPhase("ready");
        return rows;
    }, []);

    // ─── IMPORT ───────────────────────────────────────────────────────────
    // rowsToImport: array produk ber-_status "valid" (atau "failed" utk retry).
    // Mutasi row._status/_error/_productId langsung di objek row, jadi
    // pemanggil cukup setRows([...rows]) untuk re-render hasil.
    const startImport = useCallback(async (rowsToImport) => {
        setPhase("importing");
        setSummary(null);
        setProgress({ done: 0, total: rowsToImport.length, current: "" });
        const result = { success: 0, failed: 0 };

        for (let i = 0; i < rowsToImport.length; i++) {
            const row = rowsToImport[i];
            row._pricesDone = row._pricesDone || new Set();

            try {
                // 1) M_Product — jangan dibuat ulang kalau sudah ada (retry)
                if (!row._productId) {
                    const created = await idempiereApi(`/models/m_product`, {
                        method: "POST",
                        body: JSON.stringify(buildProductPayload(row)),
                    });
                    const newId = fkId(created?.id) ?? created?.id ?? created?.M_Product_ID;
                    if (!newId) throw new Error("Server tidak mengembalikan M_Product_ID — cek manual apakah produk tercreate.");
                    row._productId = newId;
                }
                const pid = row._productId;

                // 2) Vendor Pricing (opsional, sekali per produk)
                if (row._resolved.vendorId && !row._vendorDone) {
                    await idempiereApi(`/models/${VENDOR_PRICING_TABLE}`, {
                        method: "POST",
                        body: JSON.stringify({
                            M_Product_ID: { id: parseInt(pid, 10) },
                            C_BPartner_ID: { id: parseInt(row._resolved.vendorId, 10) },
                            VendorProductNo: row.vendor_product_no || row.name,
                            PriceList: parseNumber(row.vendor_price_list) || 0,
                            PriceLastPO: parseNumber(row.vendor_price_last_po) || 0,
                        }),
                    });
                    row._vendorDone = true;
                }

                // 3) Sales Price (opsional) — satu POST per Price List Version
                for (const p of row._resolvedPrices || []) {
                    if (row._pricesDone.has(p.plvId)) continue;
                    try {
                        await idempiereApi(`/models/m_productprice`, {
                            method: "POST",
                            body: JSON.stringify({
                                M_Product_ID: { id: parseInt(pid, 10) },
                                M_PriceList_Version_ID: { id: parseInt(p.plvId, 10) },
                                PriceList: p.list,
                                PriceStd: p.std,
                                PriceLimit: p.limit,
                            }),
                        });
                        row._pricesDone.add(p.plvId);
                    } catch (err) {
                        // Beri konteks price list mana yang gagal
                        throw new Error(`Harga "${p.plvName}": ${parseIdempiereError(err)}`);
                    }
                }

                row._status = "success";
                row._error = null;
                result.success++;
            } catch (err) {
                row._status = "failed";
                row._error = err?.message && String(err.message).startsWith("Harga \"")
                    ? err.message
                    : parseIdempiereError(err);
                result.failed++;
            }
            setProgress({ done: i + 1, total: rowsToImport.length, current: row.value });
        }

        setPhase("done");
        setSummary(result);
        return result;
    }, []);

    return { phase, progress, summary, validateRows, startImport };
}