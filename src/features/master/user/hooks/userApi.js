// src/features/master/user/hooks/userApi.js
// Pemanggilan REST iDempiere untuk user & role assignment (tanpa state React).
import { idempiereApi, fkId } from "@/api/idempiereApi";
import { isTrue } from "./roleConstants";
import { fetchAllPages } from "./roleApi";

// Role aktif (paging penuh — server membatasi ±100 record per halaman)
export const fetchActiveRoles = async () => {
    const rows = await fetchAllPages(`/models/ad_role?$filter=IsActive eq true&$select=Name&$orderby=Name`);
    return rows.map((r) => ({
        id: r.id ?? r.AD_Role_ID,
        name: r.Name || `Role ${r.id}`,
    }));
};

// Daftar user + role-nya (paging penuh)
export const fetchUserList = async () => {
    const [userRows, urRows] = await Promise.all([
        fetchAllPages(`/models/ad_user?$filter=IsActive eq true&$select=Name,EMail&$orderby=Name`),
        fetchAllPages(`/models/ad_user_roles?$filter=IsActive eq true&$select=AD_User_ID,AD_Role_ID`),
    ]);
    const roleByUser = new Map();
    urRows.forEach((ur) => {
        const uid = Number(fkId(ur.AD_User_ID));
        const rid = Number(fkId(ur.AD_Role_ID));
        if (!roleByUser.has(uid)) roleByUser.set(uid, []);
        roleByUser.get(uid).push(rid);
    });
    return userRows.map((u) => {
        const uid = u.id ?? u.AD_User_ID;
        return {
            id: uid,
            name: u.Name || "-",
            email: u.EMail || "-",
            isActive: isTrue(u.IsActive),
            roleIds: roleByUser.get(uid) || [],
        };
    });
};

// Data lengkap user + SEMUA record role assignment-nya (aktif & non-aktif)
// supaya soft-toggle bisa bekerja dua arah.
// ad_user_roles ber-PK komposit → record TIDAK punya `id`, hanya `uid`.
// Tanpa $select agar `uid` ikut terkirim.
export const fetchUserDetail = async (id) => {
    const [user, urRows] = await Promise.all([
        idempiereApi(`/models/ad_user/${id}`),
        fetchAllPages(`/models/ad_user_roles?$filter=AD_User_ID eq ${id}`),
    ]);
    const records = urRows.map((r) => ({
        recordId: r.uid ?? r.id,
        roleId: Number(fkId(r.AD_Role_ID)),
        isActive: isTrue(r.IsActive),
    }));
    return { user, records };
};

export const createUser = (body) => idempiereApi(`/models/ad_user`, { method: "POST", body: JSON.stringify(body) });
export const updateUser = (id, body) => idempiereApi(`/models/ad_user/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const deleteUser = (id) => idempiereApi(`/models/ad_user/${id}`, { method: "DELETE" });
export const changeUserPassword = (id, password) => updateUser(id, { Password: password });

const isDuplicateErr = (err) => /duplicate key|unique/i.test(err?.message || "");

// Record sudah ada di DB tapi tak terbaca di daftar → cari, aktifkan bila non-aktif.
const activateExistingUserRole = async (userId, roleId) => {
    const rows = await fetchAllPages(
        `/models/ad_user_roles?$filter=AD_User_ID eq ${userId} and AD_Role_ID eq ${roleId}`
    );
    const row = rows[0];
    if (!row) throw new Error("record sudah ada tetapi tidak ditemukan saat dicari ulang");
    if (!isTrue(row.IsActive)) {
        await idempiereApi(`/models/ad_user_roles/${row.uid ?? row.id}`, {
            method: "PUT", body: JSON.stringify({ IsActive: true }),
        });
    }
};

/**
 * Sinkronisasi role user (dipakai CREATE & EDIT, soft-toggle):
 *   - terpilih tanpa record       → POST
 *   - terpilih, record non-aktif  → PUT IsActive=true
 *   - dilepas, record aktif       → PUT IsActive=false
 * Kegagalan per-role dikumpulkan di `errors`, tidak menghentikan proses.
 */
export const syncUserRoles = async (userId, selectedRoleIds, records, roleNameById, errors) => {
    const nameOf = (rid) => roleNameById.get(rid) || rid;
    const selected = selectedRoleIds.map(Number);
    const recByRoleId = new Map(records.map((r) => [r.roleId, r]));

    for (const roleId of selected) {
        const rec = recByRoleId.get(roleId);
        try {
            if (!rec) {
                try {
                    await idempiereApi(`/models/ad_user_roles`, {
                        method: "POST",
                        body: JSON.stringify({
                            AD_User_ID: { id: parseInt(userId, 10) },
                            AD_Role_ID: { id: roleId },
                            IsActive: true,
                        }),
                    });
                } catch (postErr) {
                    if (!isDuplicateErr(postErr)) throw postErr;
                    await activateExistingUserRole(userId, roleId);
                }
            } else if (!rec.isActive) {
                if (!rec.recordId) throw new Error("uid record tidak ditemukan");
                await idempiereApi(`/models/ad_user_roles/${rec.recordId}`, {
                    method: "PUT", body: JSON.stringify({ IsActive: true }),
                });
            }
        } catch (err) {
            errors.push(`${nameOf(roleId)}: ${err.message}`);
        }
    }

    for (const rec of records) {
        if (rec.isActive && !selected.includes(rec.roleId)) {
            try {
                if (!rec.recordId) throw new Error("uid record tidak ditemukan");
                await idempiereApi(`/models/ad_user_roles/${rec.recordId}`, {
                    method: "PUT", body: JSON.stringify({ IsActive: false }),
                });
            } catch (err) {
                errors.push(`Lepas role ${nameOf(rec.roleId)}: ${err.message}`);
            }
        }
    }
};