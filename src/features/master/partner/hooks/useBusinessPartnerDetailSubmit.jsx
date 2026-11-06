import { useState, useCallback } from "react";
import { fkId } from "@/api/idempiereApi";

/**
 * useBusinessPartnerDetailSubmit
 * ─────────────────────────────────────────────────────────────────────────
 * Pola SAMA PERSIS dengan useProductDetailSubmit.jsx: satu fungsi
 * `saveBPartnerWithLocations` menangani seluruh proses simpan halaman
 * Business Partner Detail:
 *   1) create (mode baru) atau update (mode edit) C_BPartner
 *   2) pakai C_BPartner_ID hasil langkah 1 untuk baris alamat — TAPI beda
 *      dari Vendor Pricing di Product (yang cuma link ke 2 entity yang
 *      SUDAH ADA), satu baris alamat di sini adalah gabungan 2 tabel:
 *        a) C_Location  — data alamat mentah (Address1/2, City, Postal,
 *           Country). Baris BARU: harus di-POST DULU ke sini untuk dapat
 *           C_Location_ID-nya.
 *        b) C_BPartner_Location — baris penghubung ke BP (Name label
 *           alamat, Phone, flag Bill To/Ship To/Pay From/Remit To),
 *           BARU di-POST setelah C_Location_ID di atas didapat.
 *   3) update baris yang ditandai `_dirty`, hapus baris yang masuk daftar
 *      `deletedLocationLineIds` (yang dihapus HANYA baris C_BPartner_Location
 *      -nya — C_Location induknya sengaja dibiarkan, lihat catatan di bawah)
 *
 * Komponen (BusinessPartnerDetail.jsx) cuma menyusun state lokal
 * (locationLines, deletedLocationLineIds) dan memanggil fungsi ini SEKALI
 * saat tombol "Simpan" / "Buat Business Partner" diklik.
 */

// ─── Label field per tabel, dipakai untuk menerjemahkan error mandatory ────
// dari Postgres ("null value in column ... of relation ...") jadi pesan
// yang enak dibaca user, bukan dump baris database. Lihat catatan di
// useProductDetailSubmit.jsx soal kasus serupa (VendorProductNo) — kalau
// nanti ternyata ada kolom lain di C_BPartner/C_BPartner_Location/C_Location
// yang Mandatory di instance-mu, tinggal tambah barisnya di sini.
const FIELD_LABELS = {
    c_bpartner: {
        value: "Search Key",
        name: "Name",
        c_bp_group_id: "BP Group",
        m_pricelist_id: "Sales Price List",
        po_pricelist_id: "Purchase Price List",
    },
    c_bpartner_location: {
        name: "Nama Alamat",
        c_bpartner_id: "Business Partner",
        c_location_id: "Location",
    },
    c_location: {
        c_country_id: "Country",
        address1: "Address 1",
        city: "City",
        postal: "Postal",
    },
};

/**
 * parseIdempiereError
 * ─────────────────────────────────────────────────────────────────────────
 * Sama persis logikanya dengan yang di useProductDetailSubmit.jsx — cuma
 * FIELD_LABELS-nya beda (tabel BP, bukan tabel Product). Kalau nanti mau
 * dirapikan, dua fungsi ini bisa diekstrak ke satu util bersama
 * (mis. `@/api/parseIdempiereError.js`) yang menerima FIELD_LABELS sebagai
 * parameter — untuk sekarang dibiarkan terpisah per modul, konsisten
 * dengan pola yang sudah ada.
 */
export function parseIdempiereError(err) {
    const raw = err?.message || String(err ?? "");

    const nullValueMatch = raw.match(/null value in column "([^"]+)" of relation "([^"]+)"/i);
    if (nullValueMatch) {
        const [, column, table] = nullValueMatch;
        const label = FIELD_LABELS[table.toLowerCase()]?.[column.toLowerCase()] || column;
        return `Field "${label}" wajib diisi (tidak boleh kosong).`;
    }

    const noTableMatch = raw.match(/No match found for table name:\s*(\S+)/i);
    if (noTableMatch) {
        return `Tabel "${noTableMatch[1]}" tidak dikenali oleh server iDempiere-mu.`;
    }

    const duplicateMatch = raw.match(/duplicate key value violates unique constraint/i);
    if (duplicateMatch) {
        return "Data ini sudah ada (melanggar aturan unik), cek Search Key / kombinasi datanya.";
    }

    const dbErrorMatch = raw.match(/Database Error\.?:?\s*([^\n]+)/i);
    if (dbErrorMatch) return dbErrorMatch[1].trim();

    return raw || "Terjadi kesalahan yang tidak diketahui.";
}

// Sama pola dengan extractProductId di useProductDetailSubmit.jsx — pakai
// `fkId` (util bersama) dengan urutan fallback: fkId(res.id) -> res.id ->
// nama kolom PK asli tabel tsb.
const extractId = (created, pkFieldName) => fkId(created?.id) ?? created?.id ?? created?.[pkFieldName];

export default function useBusinessPartnerDetailSubmit(idempiereApi) {
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
     * saveBPartnerWithLocations
     * ────────────────────────────────────────────────────────────────────
     * @param {boolean} isNew
     * @param {number|string|null} bpartnerId - null/undefined kalau isNew
     * @param {object} bpartnerPayload - payload C_BPartner siap kirim
     * @param {Array} locationLines - [{
     *     id,           // PK C_BPartner_Location, null kalau baris baru
     *     locationId,   // PK C_Location, null kalau baris baru
     *     Name, Phone, IsBillTo, IsShipTo, IsPayFrom, IsRemitTo,
     *     Address1, Address2, City, Postal, C_Country_ID,
     *     _dirty,       // true kalau baris LAMA yang diedit -> perlu PUT
     * }]
     * @param {Array<number>} deletedLocationLineIds - id C_BPartner_Location yang dihapus user di form
     * @returns {Promise<number>} C_BPartner_ID (baru atau existing)
     *
     * Kalau gagal di tengah jalan, error dibekali `err.step` & `err.partial`
     * (apa saja yang SUDAH berhasil, termasuk `bpartnerId` kalau
     * C_BPartner-nya sendiri sudah kepalang terbuat) — pola sama seperti
     * useProductDetailSubmit.jsx / useCashPurchaseSubmit.jsx.
     */
    const saveBPartnerWithLocations = useCallback(
        ({
            isNew,
            bpartnerId,
            bpartnerPayload,
            locationLines = [],
            deletedLocationLineIds = [],
        }) =>
            run(async () => {
                let currentStep = "bpartner";
                const partial = {
                    bpartnerId: null,
                    locationLinesCreated: 0,
                    locationLinesUpdated: 0,
                    locationLinesDeleted: 0,
                };

                try {
                    // ── Step 1: C_BPartner ───────────────────────────────
                    let finalBPId = bpartnerId;
                    if (isNew) {
                        const created = await idempiereApi(`/models/c_bpartner`, {
                            method: "POST",
                            body: JSON.stringify(bpartnerPayload),
                        });
                        finalBPId = extractId(created, "C_BPartner_ID");
                        if (!finalBPId) {
                            throw new Error("Gagal mendapatkan C_BPartner_ID dari response create Business Partner.");
                        }
                    } else {
                        await idempiereApi(`/models/c_bpartner/${bpartnerId}`, {
                            method: "PUT",
                            body: JSON.stringify(bpartnerPayload),
                        });
                    }
                    partial.bpartnerId = finalBPId;

                    // ── Step 2: baris alamat (C_Location + C_BPartner_Location) ─
                    currentStep = "location-lines";
                    for (const line of locationLines) {
                        const locationPayload = {
                            Address1: line.Address1 || "",
                            Address2: line.Address2 || "",
                            City: line.City || "",
                            Postal: line.Postal || "",
                            C_Country_ID: { id: parseInt(line.C_Country_ID, 10) },
                        };
                        const bpLocationPayload = {
                            Name: line.Name || "",
                            Phone: line.Phone || "",
                            IsBillTo: line.IsBillTo,
                            IsShipTo: line.IsShipTo,
                            IsPayFrom: line.IsPayFrom,
                            IsRemitTo: line.IsRemitTo,
                        };

                        if (line.id) {
                            // Baris lama — update C_Location & C_BPartner_Location
                            // cuma kalau memang diedit (_dirty).
                            if (line._dirty) {
                                if (line.locationId) {
                                    await idempiereApi(`/models/c_location/${line.locationId}`, {
                                        method: "PUT",
                                        body: JSON.stringify(locationPayload),
                                    });
                                }
                                await idempiereApi(`/models/c_bpartner_location/${line.id}`, {
                                    method: "PUT",
                                    body: JSON.stringify(bpLocationPayload),
                                });
                                partial.locationLinesUpdated++;
                            }
                        } else {
                            // Baris baru — C_Location dibuat DULU (butuh ID-nya),
                            // baru C_BPartner_Location yang mengaitkan C_Location
                            // tsb + finalBPId hasil Step 1.
                            const createdLocation = await idempiereApi(`/models/c_location`, {
                                method: "POST",
                                body: JSON.stringify(locationPayload),
                            });
                            const newLocationId = extractId(createdLocation, "C_Location_ID");
                            if (!newLocationId) {
                                throw new Error("Gagal mendapatkan C_Location_ID dari response create alamat.");
                            }

                            await idempiereApi(`/models/c_bpartner_location`, {
                                method: "POST",
                                body: JSON.stringify({
                                    ...bpLocationPayload,
                                    C_BPartner_ID: { id: parseInt(finalBPId, 10) },
                                    C_Location_ID: { id: parseInt(newLocationId, 10) },
                                }),
                            });
                            partial.locationLinesCreated++;
                        }
                    }

                    // ── Step 3: hapus baris yang ditandai dihapus ───────────
                    // Cuma C_BPartner_Location yang dihapus — C_Location
                    // induknya SENGAJA dibiarkan (tidak ikut dihapus), untuk
                    // jaga-jaga kalau ternyata masih direferensikan di
                    // tempat lain (mis. dokumen lama yang sudah Complete).
                    currentStep = "location-lines-delete";
                    for (const delId of deletedLocationLineIds) {
                        await idempiereApi(`/models/c_bpartner_location/${delId}`, { method: "DELETE" });
                        partial.locationLinesDeleted++;
                    }

                    return finalBPId;
                } catch (err) {
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
        saveBPartnerWithLocations,
    };
}
