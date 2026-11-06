import { useState, useCallback } from "react";
import { fkId } from "@/api/idempiereApi";

/**
 * useProductDetailSubmit
 * ─────────────────────────────────────────────────────────────────────────
 * Satu fungsi `saveProductWithLines` untuk semua operasi simpan di halaman
 * ProductDetail:
 *   1) create (mode baru) atau update (mode edit) M_Product
 *   2) pakai M_Product_ID hasil langkah 1 untuk insert/update/hapus baris
 *      Vendor Pricing & Sales Price
 *   3) BARU: kalau produk berstatus IsBOM, simpan header PP_Product_BOM
 *      (create/update) lalu baris PP_Product_BOMLine-nya (create/update/hapus)
 *
 * Komponen (ProductDetail.js) cuma menyusun state lokal dan memanggil
 * fungsi ini SEKALI saat tombol "Simpan" / "Buat Produk" diklik.
 */

// ─── Nama tabel (REST model, huruf kecil) ───────────────────────────────
// Beberapa instance iDempiere masih pakai nama tabel lama "M_Product_PO",
// yang lain sudah di-rename ke "M_BPartnerProduct". REST API akan balas
// 404 "No match found for table name" kalau nama yang dipakai di sini
// tidak cocok dengan yang terdaftar di instance-mu.
export const VENDOR_PRICING_TABLE = "m_product_po"; // alternatif: "m_bpartnerproduct"

// BOM Manufacturing (window "Bill of Material & Formula"): header
// PP_Product_BOM + baris komponen PP_Product_BOMLine.
export const BOM_HEADER_TABLE = "pp_product_bom";
export const BOM_LINE_TABLE = "pp_product_bomline";

// ─── Label field per tabel, dipakai untuk menerjemahkan error mandatory ────
// dari Postgres ("null value in column ... of relation ...") jadi pesan
// yang enak dibaca user, bukan dump baris database.
const FIELD_LABELS = {
    m_product: {
        value: "Search Key",
        name: "Name",
        upc: "UPC",
        m_product_category_id: "Product Category",
        c_uom_id: "UOM",
        c_taxcategory_id: "Tax Category",
        c_charge_id: "Charge (Internal Use)",
    },
    m_bpartnerproduct: {
        c_bpartner_id: "Vendor",
        m_product_id: "Product",
        vendorproductno: "Vendor Product No",
    },
    m_product_po: {
        c_bpartner_id: "Vendor",
        m_product_id: "Product",
        vendorproductno: "Vendor Product No",
    },
    m_productprice: {
        m_pricelist_version_id: "Price List Version",
        m_product_id: "Product",
        pricelist: "Price List",
        pricestd: "Price Std (Jual)",
        pricelimit: "Price Limit",
    },
    pp_product_bom: {
        value: "BOM Value",
        name: "BOM Name",
        bomtype: "BOM Type",
        bomuse: "BOM Use",
        m_product_id: "Product",
        c_uom_id: "UOM",
    },
    pp_product_bomline: {
        pp_product_bom_id: "BOM",
        m_product_id: "Komponen",
        qtybom: "Qty BOM",
        c_uom_id: "UOM",
        componenttype: "Component Type",
        line: "Line",
    },
    c_uom_conversion: {
        m_product_id: "Product",
        c_uom_id: "UOM Dasar",
        c_uom_to_id: "UOM Konversi",
        multiplyrate: "Multiply Rate",
        dividerate: "Divide Rate",
    },
};

/**
 * parseIdempiereError
 * ─────────────────────────────────────────────────────────────────────────
 * Ubah error mentah dari REST API iDempiere (termasuk dump constraint
 * Postgres) jadi satu kalimat singkat yang bisa langsung ditampilkan ke user.
 */
export function parseIdempiereError(err) {
    const raw = err?.message || String(err ?? "");

    // Kasus paling umum: mandatory field kosong sampai lolos ke DB.
    const nullValueMatch = raw.match(/null value in column "([^"]+)" of relation "([^"]+)"/i);
    if (nullValueMatch) {
        const [, column, table] = nullValueMatch;
        const label = FIELD_LABELS[table.toLowerCase()]?.[column.toLowerCase()] || column;
        return `Field "${label}" wajib diisi (tidak boleh kosong).`;
    }

    // Nama kolom tidak dikenali REST API (mis. IsBOMPriceOverride salah eja
    // / beda nama di versi iDempiere-mu). Pola pesan: "X is not a valid
    // column of table Y".
    const badColumnMatch = raw.match(/(\S+) is not a valid column of table (\S+)/i);
    if (badColumnMatch) {
        return `Kolom "${badColumnMatch[1]}" tidak dikenali di tabel ${badColumnMatch[2]}. Cek nama kolom persisnya di Application Dictionary (Table and Column) instance-mu.`;
    }

    // Nama tabel tidak dikenali oleh REST API.
    const noTableMatch = raw.match(/No match found for table name:\s*(\S+)/i);
    if (noTableMatch) {
        return `Tabel "${noTableMatch[1]}" tidak dikenali oleh server iDempiere-mu. Instance-mu kemungkinan pakai nama tabel yang berbeda — cek konstanta nama tabel di useProductDetailSubmit.js.`;
    }

    // Kasus umum lain: duplicate key / unique constraint.
    const duplicateMatch = raw.match(/duplicate key value violates unique constraint/i);
    if (duplicateMatch) {
        return "Data ini sudah ada (melanggar aturan unik), cek Search Key / kombinasi datanya.";
    }

    // Fallback: ambil bagian pesan setelah "Database Error." kalau ada.
    const dbErrorMatch = raw.match(/Database Error\.?:?\s*([^\n]+)/i);
    if (dbErrorMatch) return dbErrorMatch[1].trim();

    return raw || "Terjadi kesalahan yang tidak diketahui.";
}

// Pola fallback yang sama seperti PO/Receipt/Invoice di useCashPurchaseSubmit.jsx.
const extractProductId = (created) => fkId(created?.id) ?? created?.id ?? created?.M_Product_ID;
const extractBomHeaderId = (created) => fkId(created?.id) ?? created?.id ?? created?.PP_Product_BOM_ID;

export default function useProductDetailSubmit(idempiereApi) {
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);

    const run = useCallback(async (fn) => {
        setIsSaving(true);
        setError(null);
        try {
            return await fn();
        } catch (err) {
            setError(err);
            throw err;
        } finally {
            setIsSaving(false);
        }
    }, []);

    /**
     * saveProductWithLines
     * ────────────────────────────────────────────────────────────────────
     * @param {boolean} isNew
     * @param {number|string|null} productId - null/undefined kalau isNew
     * @param {object} productPayload - payload M_Product siap kirim
     * @param {Array} vendorLines / deletedVendorIds - lihat ProductDetail.js
     * @param {Array} priceLines / deletedPriceIds - lihat ProductDetail.js
     * @param {object|null} bom - null kalau produk BUKAN BOM (tahap BOM dilewati).
     *   {
     *     headerId,        // PP_Product_BOM_ID existing, null kalau belum ada
     *     header: { Value, Name, BOMType, BOMUse, _dirty },
     *     lines: [{ id, M_Product_ID, C_UOM_ID, QtyBOM, ComponentType, Line, _dirty }],
     *     deletedLineIds: [number],
     *   }
     *   Aturan per baris sama seperti Vendor Pricing: id null -> POST,
     *   id ada & _dirty -> PUT, id ada & tidak dirty -> dilewati.
     * @returns {Promise<number>} M_Product_ID (baru atau existing)
     *
     * Kalau gagal di tengah jalan, error dibekali `err.step` dan
     * `err.partial` (apa saja yang SUDAH berhasil, termasuk productId dan
     * bomHeaderId) — pola yang sama seperti useCashPurchaseSubmit.jsx.
     */
    const saveProductWithLines = useCallback(
        ({
            isNew,
            productId,
            productPayload,
            vendorLines = [],
            deletedVendorIds = [],
            priceLines = [],
            deletedPriceIds = [],
            bom = null,
        }) =>
            run(async () => {
                let currentStep = "product";
                const partial = {
                    productId: null,
                    vendorLinesCreated: 0,
                    vendorLinesUpdated: 0,
                    vendorLinesDeleted: 0,
                    priceLinesCreated: 0,
                    priceLinesUpdated: 0,
                    priceLinesDeleted: 0,
                    bomHeaderId: null,
                    bomLinesCreated: 0,
                    bomLinesUpdated: 0,
                    bomLinesDeleted: 0,
                };

                try {
                    // ── Step 1: M_Product ────────────────────────────────
                    let finalProductId = productId;
                    if (isNew) {
                        const created = await idempiereApi(`/models/m_product`, {
                            method: "POST",
                            body: JSON.stringify(productPayload),
                        });
                        finalProductId = extractProductId(created);
                        if (!finalProductId) {
                            throw new Error("Gagal mendapatkan M_Product_ID dari response create produk.");
                        }
                    } else {
                        await idempiereApi(`/models/m_product/${productId}`, {
                            method: "PUT",
                            body: JSON.stringify(productPayload),
                        });
                    }
                    partial.productId = finalProductId;

                    // ── Step 2: Vendor Pricing ───────────────────────────
                    currentStep = "vendor-lines";
                    for (const line of vendorLines) {
                        if (line._isNew) {
                            const bpId = parseInt(line.C_BPartner_ID, 10);
                            if (!Number.isFinite(bpId)) {
                                throw new Error("Vendor pada baris Vendor Pricing tidak valid.");
                            }
                            await idempiereApi(`/models/${VENDOR_PRICING_TABLE}`, {
                                method: "POST",
                                body: JSON.stringify({
                                    M_Product_ID: { id: parseInt(finalProductId, 10) },
                                    C_BPartner_ID: { id: bpId },
                                    VendorProductNo: line.VendorProductNo || "",
                                    PriceList: parseFloat(line.PriceList) || 0,
                                    PriceLastPO: parseFloat(line.PriceLastPO) || 0,
                                }),
                            });
                            partial.vendorLinesCreated++;
                        } else if (line._dirty) {
                            const targetUrl = line.id
                                ? `/models/${VENDOR_PRICING_TABLE}/${line.id}`
                                : `/models/${VENDOR_PRICING_TABLE}/(${finalProductId},${line.C_BPartner_ID})`;

                            await idempiereApi(targetUrl, {
                                method: "PUT",
                                body: JSON.stringify({
                                    VendorProductNo: line.VendorProductNo || "",
                                    PriceList: parseFloat(line.PriceList) || 0,
                                    PriceLastPO: parseFloat(line.PriceLastPO) || 0,
                                }),
                            });
                            partial.vendorLinesUpdated++;
                        }
                    }
                    currentStep = "vendor-lines-delete";
                    for (const delId of deletedVendorIds) {
                        await idempiereApi(`/models/${VENDOR_PRICING_TABLE}/${delId}`, { method: "DELETE" });
                        partial.vendorLinesDeleted++;
                    }

                    // ── Step 3: Sales Price ──────────────────────────────
                    currentStep = "price-lines";
                    for (const line of priceLines) {
                        const payload = {
                            PriceList: parseFloat(line.PriceList) || 0,
                            PriceStd: parseFloat(line.PriceStd) || 0,
                            PriceLimit: parseFloat(line.PriceLimit) || 0,
                        };
                        if (line.id) {
                            if (line._dirty) {
                                await idempiereApi(`/models/m_productprice/${line.id}`, {
                                    method: "PUT",
                                    body: JSON.stringify(payload),
                                });
                                partial.priceLinesUpdated++;
                            }
                        } else {
                            await idempiereApi(`/models/m_productprice`, {
                                method: "POST",
                                body: JSON.stringify({
                                    ...payload,
                                    M_Product_ID: { id: parseInt(finalProductId, 10) },
                                    M_PriceList_Version_ID: { id: parseInt(line.M_PriceList_Version_ID, 10) },
                                }),
                            });
                            partial.priceLinesCreated++;
                        }
                    }
                    currentStep = "price-lines-delete";
                    for (const delId of deletedPriceIds) {
                        await idempiereApi(`/models/m_productprice/${delId}`, { method: "DELETE" });
                        partial.priceLinesDeleted++;
                    }

                    // ── Step 4-6: BOM (hanya kalau produk IsBOM) ─────────
                    // Dijalankan SETELAH M_Product tersimpan dengan IsBOM = true
                    // (iDempiere menolak header BOM untuk produk yang belum IsBOM).
                    if (bom) {
                        currentStep = "bom-header";
                        const headerPayload = {
                            Value: bom.header?.Value || productPayload.Value,
                            Name: bom.header?.Name || productPayload.Name,
                            BOMType: bom.header?.BOMType || "A",
                            BOMUse: bom.header?.BOMUse || "A",
                            C_UOM_ID: productPayload.C_UOM_ID, // sudah berbentuk { id }
                        };

                        let bomHeaderId = bom.headerId;
                        if (bomHeaderId) {
                            if (bom.header?._dirty) {
                                await idempiereApi(`/models/${BOM_HEADER_TABLE}/${bomHeaderId}`, {
                                    method: "PUT",
                                    body: JSON.stringify(headerPayload),
                                });
                            }
                        } else {
                            const createdHeader = await idempiereApi(`/models/${BOM_HEADER_TABLE}`, {
                                method: "POST",
                                body: JSON.stringify({
                                    ...headerPayload,
                                    M_Product_ID: { id: parseInt(finalProductId, 10) },
                                }),
                            });
                            bomHeaderId = extractBomHeaderId(createdHeader);
                            if (!bomHeaderId) {
                                throw new Error("Gagal mendapatkan PP_Product_BOM_ID dari response create header BOM.");
                            }
                        }
                        partial.bomHeaderId = bomHeaderId;

                        currentStep = "bom-lines";
                        for (const line of bom.lines || []) {
                            const payload = {
                                QtyBOM: parseFloat(line.QtyBOM) || 0,
                                ComponentType: line.ComponentType || "CO",
                                Line: parseInt(line.Line, 10) || 10,
                            };
                            if (line.id) {
                                if (line._dirty) {
                                    await idempiereApi(`/models/${BOM_LINE_TABLE}/${line.id}`, {
                                        method: "PUT",
                                        body: JSON.stringify(payload),
                                    });
                                    partial.bomLinesUpdated++;
                                }
                            } else {
                                await idempiereApi(`/models/${BOM_LINE_TABLE}`, {
                                    method: "POST",
                                    body: JSON.stringify({
                                        ...payload,
                                        PP_Product_BOM_ID: { id: parseInt(bomHeaderId, 10) },
                                        M_Product_ID: { id: parseInt(line.M_Product_ID, 10) },
                                        C_UOM_ID: { id: parseInt(line.C_UOM_ID, 10) },
                                    }),
                                });
                                partial.bomLinesCreated++;
                            }
                        }

                        currentStep = "bom-lines-delete";
                        for (const delId of bom.deletedLineIds || []) {
                            await idempiereApi(`/models/${BOM_LINE_TABLE}/${delId}`, { method: "DELETE" });
                            partial.bomLinesDeleted++;
                        }
                    }

                    return finalProductId;
                } catch (err) {
                    // Bekali error dengan tahap yang gagal + apa saja yang
                    // sudah sempat berhasil.
                    err.step = currentStep;
                    err.partial = partial;
                    throw err;
                }
            }),
        [idempiereApi, run]
    );

    return {
        isSaving,
        error,
        saveProductWithLines,
    };
}