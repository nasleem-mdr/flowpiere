// src/features/master/user/hooks/roleApi.js
// Pemanggilan REST iDempiere untuk role & access (tanpa state React).
import { idempiereApi, fkId } from "@/api/idempiereApi";
import { isTrue } from "./roleConstants";

const PAGE_SIZE = 100;
const MAX_PAGES = 100; // pengaman

/**
 * Ambil SEMUA record dengan paging ($top/$skip). Server iDempiere bisa membatasi
 * ukuran halaman (mis. 100) walau $top lebih besar — jadi $skip dimajukan
 * sebanyak record yang benar-benar diterima, bukan sebesar $top.
 * `url` tidak boleh memuat $top/$skip. Hasil: array record.
 */
export const fetchAllPages = async (url, pageSize = PAGE_SIZE) => {
    const sep = url.includes("?") ? "&" : "?";
    const all = [];
    let skip = 0;
    let prevFirst = null;
    for (let i = 0; i < MAX_PAGES; i++) {
        const res = await idempiereApi(`${url}${sep}$top=${pageSize}&$skip=${skip}`);
        const page = res.records || [];
        if (page.length === 0) break;
        // Server mengabaikan $skip → halaman yang sama berulang. (Tidak pakai r.id:
        // tabel access ber-PK komposit tidak punya id tunggal.)
        const first = JSON.stringify(page[0]);
        if (first === prevFirst) break;
        prevFirst = first;
        all.push(...page);
        skip += page.length;
        const total = res["row-count"];
        if (typeof total === "number" && skip >= total) break;
    }
    return all;
};

const odataStr = (s) => String(s).replace(/'/g, "''");

const toRef = (r) => ({ id: r.id, name: r.Name || `#${r.id}` });

export const fetchRefList = async (url) => (await fetchAllPages(url)).map(toRef);

// Window yang dipakai aplikasi saja (filter di server, daftar kecil → 1 request).
// entries: angka = AD_Window_ID, string = Name, array = alias "salah satu dari".
// Mengembalikan { items, missing } — `missing` = entri yang TIDAK ketemu di instance ini.
export const fetchAppWindows = async (entries) => {
    if (!entries?.length) return { items: [], missing: [] };

    const groups = entries.map((e) => {
        const list = Array.isArray(e) ? e : [e];
        return {
            ids: list.filter((x) => typeof x === "number"),
            names: list.filter((x) => typeof x === "string"),
            label: list.join(" / "),
        };
    });
    const clauses = [...new Set(groups.flatMap((g) => [
        ...g.ids.map((i) => `AD_Window_ID eq ${i}`),
        ...g.names.map((n) => `Name eq '${odataStr(n)}'`),
    ]))];

    const rows = await fetchAllPages(
        `/models/ad_window?$filter=IsActive eq true and (${clauses.join(" or ")})&$select=Name&$orderby=Name`
    );
    const items = rows.map(toRef);

    const foundIds = new Set(items.map((i) => i.id));
    const foundNames = new Set(items.map((i) => i.name));
    const missing = groups
        .filter((g) => !g.ids.some((i) => foundIds.has(i)) && !g.names.some((n) => foundNames.has(n)))
        .map((g) => g.label);
    if (missing.length) console.warn("[APP_WINDOWS] tidak ditemukan di iDempiere:", missing);

    return { items, missing };
};

// Fetch SEMUA record access sebuah role (aktif & non-aktif)
// → { records: [{ recordId, fkId, isActive }], activeIds: [fkId...] }
export const fetchAccessRecords = async (table, fkColumn, roleId) => {
    const rows = await fetchAllPages(
        `/models/${table}?$filter=AD_Role_ID eq ${roleId} and (IsActive eq true or IsActive eq false)`
    );
    const records = rows.map((r) => ({
        recordId: r.uid ?? r.id,   // tabel access ber-PK komposit: pakai uid
        fkId: Number(fkId(r[fkColumn])),
        isActive: isTrue(r.IsActive),
    }));
    return { records, activeIds: records.filter((r) => r.isActive).map((r) => r.fkId) };
};

// Hitung jumlah access aktif per role → Map roleId → jumlah
const countByRole = (rows) => {
    const m = new Map();
    rows.forEach((r) => {
        const rid = fkId(r.AD_Role_ID);
        m.set(rid, (m.get(rid) || 0) + 1);
    });
    return m;
};

export const fetchRoleList = async () => {
    const [roleRows, orgRows, winRows, formRows] = await Promise.all([
        fetchAllPages(`/models/ad_role?$filter=IsActive eq true&$select=Name,UserLevel&$orderby=Name`),
        fetchAllPages(`/models/ad_role_orgaccess?$filter=IsActive eq true&$select=AD_Role_ID`),
        fetchAllPages(`/models/ad_window_access?$filter=IsActive eq true&$select=AD_Role_ID`),
        fetchAllPages(`/models/ad_form_access?$filter=IsActive eq true&$select=AD_Role_ID`),
    ]);
    return {
        roleRes: { records: roleRows },
        orgCount: countByRole(orgRows),
        winCount: countByRole(winRows),
        formCount: countByRole(formRows),
    };
};

export const fetchRoleDetail = (id) => idempiereApi(`/models/ad_role/${id}`);
export const createRole = (body) => idempiereApi(`/models/ad_role`, { method: "POST", body: JSON.stringify(body) });
export const updateRole = (id, body) => idempiereApi(`/models/ad_role/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const deleteRole = (id) => idempiereApi(`/models/ad_role/${id}`, { method: "DELETE" });

// Cabut akses: HAPUS record (fallback: nonaktifkan kalau DELETE ditolak).
// Menghapus — bukan menonaktifkan — mencegah record non-aktif "tak terlihat" yang nanti
// membuat memberi akses yang sama lagi gagal dengan duplicate key.
const revokeRecord = async (def, rec) => {
    if (!rec.recordId) throw new Error("uid record tidak ditemukan");
    try {
        await idempiereApi(`/models/${def.table}/${rec.recordId}`, { method: "DELETE" });
    } catch {
        await idempiereApi(`/models/${def.table}/${rec.recordId}`, {
            method: "PUT", body: JSON.stringify({ IsActive: false }),
        });
    }
};

const isDuplicateErr = (err) => /duplicate key|unique/i.test(err?.message || "");

// Record sudah ada di DB (mis. tak terbaca di daftar) → cari lalu aktifkan bila non-aktif.
const activateExisting = async (def, roleId, fkVal) => {
    const rows = await fetchAllPages(
        `/models/${def.table}?$filter=AD_Role_ID eq ${roleId} and ${def.fk} eq ${fkVal} and (IsActive eq true or IsActive eq false)`
    );
    const row = rows[0];
    if (!row) throw new Error(
        "record sudah ada di database tetapi tidak terbaca lewat REST (kemungkinan non-aktif). " +
        "Aktifkan / hapus manual di iDempiere: Role → Window/Form/Org Access."
    );
    if (!isTrue(row.IsActive)) {
        await idempiereApi(`/models/${def.table}/${row.uid ?? row.id}`, {
            method: "PUT", body: JSON.stringify({ IsActive: true }),
        });
    }
};

/**
 * Sinkronisasi satu tabel access (dipakai CREATE & EDIT, soft-toggle).
 * selectedIds : fkId yang TERpilih (termasuk yang tidak tampil di picker)
 * recordsByFk : Map fkId → { recordId, isActive } (semua status)
 */
export const syncAccess = async (def, roleId, selectedIds, recordsByFk, nameById, errors) => {
    const sel = selectedIds.map(Number);
    const nameOf = (fk) => nameById?.get(fk) || `#${fk}`;

    for (const fkVal of sel) {
        const rec = recordsByFk.get(fkVal);
        try {
            if (!rec) {
                const body = {
                    AD_Role_ID: { id: parseInt(roleId, 10) },
                    [def.fk]: { id: fkVal },
                    IsActive: true,
                };
                if (def.key !== "org") body.IsReadWrite = true; // window & form
                try {
                    await idempiereApi(`/models/${def.table}`, { method: "POST", body: JSON.stringify(body) });
                } catch (postErr) {
                    if (!isDuplicateErr(postErr)) throw postErr;
                    await activateExisting(def, roleId, fkVal);
                }
            } else if (!rec.isActive) {
                await idempiereApi(`/models/${def.table}/${rec.recordId}`, {
                    method: "PUT", body: JSON.stringify({ IsActive: true }),
                });
            }
        } catch (err) {
            errors.push(`${def.label}: ${nameOf(fkVal)} → ${err.message}`);
        }
    }

    // Lepas akses: record aktif yang tidak dipilih → matikan.
    for (const [fkVal, rec] of recordsByFk) {
        if (!sel.includes(Number(fkVal)) && rec.isActive) {
            try {
                await revokeRecord(def, rec);
            } catch (err) {
                errors.push(`${def.label}: lepas ${nameOf(fkVal)} → ${err.message}`);
            }
        }
    }
};