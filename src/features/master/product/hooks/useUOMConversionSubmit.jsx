import { useState, useCallback } from "react";

/**
 * useUOMConversionSubmit
 * ─────────────────────────────────────────────────────────────────────────
 * Simpan UOM Conversion per-produk ke tabel C_UOM_Conversion.
 *
 * Dipanggil dari ProductDetail.jsx SETELAH `saveProductWithLines` berhasil,
 * karena butuh M_Product_ID (untuk produk baru, ID-nya baru ada setelah
 * M_Product dibuat). Hook ini sengaja terpisah dari useProductDetailSubmit.
 *
 * Aturan iDempiere (MUOMConversion.beforeSave) yang diikuti di sini:
 *   - C_UOM_ID (UOM "dari") untuk konversi produk HARUS sama dengan UOM
 *     dasar produk (M_Product.C_UOM_ID).
 *   - C_UOM_To_ID tidak boleh sama dengan C_UOM_ID.
 *   - MultiplyRate harus > 0.
 *
 * Arti rate (konvensi yang sama dengan useUomConversion.jsx di frontend):
 *   qty di UOM tujuan = qty UOM dasar * MultiplyRate
 *   qty UOM dasar     = qty UOM tujuan / MultiplyRate  (= * DivideRate)
 * Contoh: UOM dasar Lembar, UOM tujuan Rim, 1 Rim = 500 Lembar
 *   -> DivideRate = 500, MultiplyRate = 1/500 = 0.002
 *
 * Form hanya meminta DivideRate ("isi per 1 UOM tujuan, dalam UOM dasar"),
 * MultiplyRate dihitung otomatis lewat calcMultiplyRate().
 */

export const UOM_CONVERSION_TABLE = "c_uom_conversion";

// Scale kolom MultiplyRate/DivideRate di iDempiere = 12 digit desimal.
const RATE_SCALE = 12;
const round = (n, digits) => Number(n.toFixed(digits));

/** MultiplyRate = 1 / DivideRate. null kalau DivideRate tidak valid (<= 0). */
export function calcMultiplyRate(divideRate) {
    const d = parseFloat(divideRate);
    if (!(d > 0)) return null;
    return round(1 / d, RATE_SCALE);
}

/**
 * Baca "isi per 1 UOM tujuan" dari satu record C_UOM_Conversion hasil fetch.
 * Pakai DivideRate; kalau kosong/0 (mis. data lama yang cuma mengisi
 * MultiplyRate), turunkan dari 1 / MultiplyRate.
 */
export function readDivideRate(rec) {
    const d = parseFloat(rec?.DivideRate);
    if (d > 0) return d;
    const m = parseFloat(rec?.MultiplyRate);
    return m > 0 ? round(1 / m, 6) : "";
}

export default function useUOMConversionSubmit(idempiereApi) {
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
     * saveUOMConversions
     * ────────────────────────────────────────────────────────────────────
     * @param {number|string} productId - M_Product_ID (produk sudah tersimpan)
     * @param {number|string} baseUomId - UOM dasar produk saat ini (M_Product.C_UOM_ID)
     * @param {Array} lines - [{ id, C_UOM_To_ID, DivideRate, _dirty }]
     *   id null -> POST, id ada & _dirty -> PUT, id ada & tidak dirty -> dilewati.
     *   UOM tujuan baris lama tidak bisa diganti (hapus lalu tambah baru).
     * @param {Array<number>} deletedIds - C_UOM_Conversion_ID yang dihapus user
     * @returns {Promise<{created:number, updated:number, deleted:number}>}
     *
     * Urutan: DELETE dulu, baru PUT/POST. Kalau user menghapus baris lalu
     * menambah UOM tujuan yang sama lagi sebelum Simpan, urutan sebaliknya
     * akan bentrok dengan aturan unik C_UOM_Conversion.
     *
     * Kalau gagal, error dibekali `err.step` dan `err.partial` (jumlah baris
     * yang SUDAH berhasil) — pola yang sama seperti useProductDetailSubmit.
     */
    const saveUOMConversions = useCallback(
        ({ productId, baseUomId, lines = [], deletedIds = [] }) => {
            const hasWork = deletedIds.length > 0 || lines.some((l) => !l.id || l._dirty);
            if (!hasWork) return Promise.resolve({ created: 0, updated: 0, deleted: 0 });

            return run(async () => {
                let currentStep = "validate";
                const partial = { created: 0, updated: 0, deleted: 0 };

                try {
                    const pid = parseInt(productId, 10);
                    if (!Number.isFinite(pid)) {
                        throw new Error("M_Product_ID tidak valid untuk menyimpan UOM Conversion.");
                    }
                    const baseId = parseInt(baseUomId, 10);
                    const toSave = lines.filter((l) => !l.id || l._dirty);
                    if (toSave.length > 0 && !Number.isFinite(baseId)) {
                        throw new Error("UOM dasar produk belum dipilih.");
                    }
                    for (const line of toSave) {
                        if (calcMultiplyRate(line.DivideRate) === null) {
                            throw new Error("Nilai konversi UOM harus lebih dari 0.");
                        }
                        if (!line.id && parseInt(line.C_UOM_To_ID, 10) === baseId) {
                            throw new Error("UOM konversi tidak boleh sama dengan UOM dasar produk.");
                        }
                    }

                    // ── Step 1: hapus baris yang dibuang user ────────────
                    currentStep = "uom-conversion-delete";
                    for (const delId of deletedIds) {
                        await idempiereApi(`/models/${UOM_CONVERSION_TABLE}/${delId}`, { method: "DELETE" });
                        partial.deleted++;
                    }

                    // ── Step 2: update / create ──────────────────────────
                    currentStep = "uom-conversion-save";
                    for (const line of toSave) {
                        const divideRate = parseFloat(line.DivideRate);
                        const rates = {
                            MultiplyRate: calcMultiplyRate(divideRate),
                            DivideRate: divideRate,
                        };

                        if (line.id) {
                            await idempiereApi(`/models/${UOM_CONVERSION_TABLE}/${line.id}`, {
                                method: "PUT",
                                body: JSON.stringify(rates),
                            });
                            partial.updated++;
                        } else {
                            await idempiereApi(`/models/${UOM_CONVERSION_TABLE}`, {
                                method: "POST",
                                body: JSON.stringify({
                                    ...rates,
                                    M_Product_ID: { id: pid },
                                    C_UOM_ID: { id: baseId },
                                    C_UOM_To_ID: { id: parseInt(line.C_UOM_To_ID, 10) },
                                }),
                            });
                            partial.created++;
                        }
                    }

                    return partial;
                } catch (err) {
                    err.step = currentStep;
                    err.partial = partial;
                    throw err;
                }
            });
        },
        [idempiereApi, run]
    );

    return {
        isSaving,
        error,
        saveUOMConversions,
    };
}
