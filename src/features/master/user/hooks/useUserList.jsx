// src/features/master/user/hooks/useUserList.js
import { useState, useEffect, useCallback, useMemo } from "react";
import { idempiereApi, fkId } from "@/api/idempiereApi";

/**
 * useUserList — data user (AD_User) + role (AD_Role/AD_User_Roles).
 * Hanya logika data: fetch, join di client, dan toggle IsActive.
 * Tidak ada JSX / alert di sini.
 *
 * Strategi fetch users: 1x ambil semua ad_user, 1x ambil semua
 * ad_user_roles aktif, lalu join di client (skala user POS kecil).
 * Kalau user bisa ratusan, ubah jadi chunked per user.
 */
export const useUserList = () => {
    const [roles, setRoles] = useState([]); // [{ id, name }]
    const [rolesLoading, setRolesLoading] = useState(false);
    const [users, setUsers] = useState([]); // [{ id, name, email, isActive, roleIds }]
    const [usersLoading, setUsersLoading] = useState(false);
    const [togglingId, setTogglingId] = useState(null);

    const fetchRoles = useCallback(async () => {
        setRolesLoading(true);
        try {
            const res = await idempiereApi(
                `/models/ad_role?$filter=IsActive eq true&$select=Name&$orderby=Name`
            );
            setRoles(
                (res.records || []).map((r) => ({
                    id: r.id ?? r.AD_Role_ID,
                    name: r.Name || `Role ${r.id}`,
                }))
            );
        } catch (err) {
            console.error("Gagal mengambil daftar role:", err.message);
            setRoles([]);
        } finally {
            setRolesLoading(false);
        }
    }, []);

    const fetchUsers = useCallback(async () => {
        setUsersLoading(true);
        try {
            const [userRes, urRes] = await Promise.all([
                idempiereApi(`/models/ad_user?$filter=IsActive eq true&$select=Name,EMail&$orderby=Name&$top=500`),
                idempiereApi(`/models/ad_user_roles?$filter=IsActive eq true&$select=AD_User_ID,AD_Role_ID&$top=1000`),
            ]);

            const roleByUser = new Map(); // userId -> [roleId]
            (urRes.records || []).forEach((ur) => {
                const uid = fkId(ur.AD_User_ID);
                const rid = fkId(ur.AD_Role_ID);
                if (!roleByUser.has(uid)) roleByUser.set(uid, []);
                roleByUser.get(uid).push(rid);
            });

            setUsers(
                (userRes.records || []).map((u) => {
                    const id = u.id ?? u.AD_User_ID;
                    return {
                        id,
                        name: u.Name || "-",
                        email: u.EMail || "-",
                        isActive: u.IsActive === true || u.IsActive === "Y",
                        roleIds: roleByUser.get(id) || [],
                    };
                })
            );
        } catch (err) {
            console.error("Gagal mengambil daftar user:", err.message);
            setUsers([]);
        } finally {
            setUsersLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRoles();
        fetchUsers();
    }, [fetchRoles, fetchUsers]);

    const roleNameById = useMemo(() => {
        const m = new Map();
        roles.forEach((r) => m.set(r.id, r.name));
        return m;
    }, [roles]);

    // Aktif/nonaktifkan user (PUT IsActive) — tidak menghapus data.
    // Return { ok, error } supaya UI yang memutuskan cara menampilkan error.
    const toggleActive = useCallback(
        async (user) => {
            setTogglingId(user.id);
            try {
                await idempiereApi(`/models/ad_user/${user.id}`, {
                    method: "PUT",
                    body: JSON.stringify({ IsActive: !user.isActive }),
                });
                await fetchUsers();
                return { ok: true };
            } catch (err) {
                return { ok: false, error: err.message };
            } finally {
                setTogglingId(null);
            }
        },
        [fetchUsers]
    );

    return {
        roles,
        rolesLoading,
        roleNameById,
        users,
        usersLoading,
        togglingId,
        refreshUsers: fetchUsers,
        toggleActive,
    };
};

export default useUserList;
