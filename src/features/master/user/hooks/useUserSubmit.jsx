// src/features/master/user/hooks/useUserSubmit.js
import { useState, useCallback } from "react";
import { idempiereApi, fkId } from "@/api/idempiereApi";

/**
 * useUserSubmit — form state, validasi, dan simpan user baru.
 *
 * ALUR SIMPAN (2 langkah, transaksi per langkah):
 *   1) POST /models/ad_user → Name, EMail (username login iDempiere),
 *      Password, Description, IsActive. Server yang hash password
 *      (beforeSave AD_User) — jangan hash di client.
 *   2) Tiap role tercentang: POST /models/ad_user_roles
 *      { AD_User_ID, AD_Role_ID, IsActive }. Gagal di satu role TIDAK
 *      membatalkan user yang sudah ke-create — error dikumpulkan.
 *
 * CATATAN iDEMPIERE:
 *   - Login user internal memakai kolom EMail sebagai username (kecuali LDAP).
 *   - AD_User_ID + AD_Role_ID unik — duplikat ditolak server.
 *   - Halaman ini hanya create + lihat; edit role per user belum ada.
 */

export const EMPTY_FORM = {
    name: "",
    email: "",
    password: "",
    confirm: "",
    description: "",
    isActive: true,
};

export const validateUserForm = (form) => {
    const errors = [];
    if (!form.name.trim()) errors.push("Name wajib diisi");
    if (!form.email.trim()) errors.push("Username / Email wajib diisi");
    if (!form.password) errors.push("Password wajib diisi");
    else if (form.password.length < 6) errors.push("Password minimal 6 karakter");
    if (form.password !== form.confirm) errors.push("Konfirmasi password tidak sama");
    return errors;
};

/**
 * @param {Object}   opts
 * @param {Map}      opts.roleNameById - untuk label error per role
 * @param {Function} opts.onCreated    - dipanggil setelah user berhasil dibuat (mis. refresh list)
 */
export const useUserSubmit = ({ roleNameById, onCreated }) => {
    const [form, setForm] = useState(EMPTY_FORM);
    const [selectedRoleIds, setSelectedRoleIds] = useState([]);
    const [saving, setSaving] = useState(false);
    // { fatal } | { userId, userName, roleOk, roleTotal, roleErrors }
    const [result, setResult] = useState(null);

    const setField = useCallback((key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    }, []);

    const toggleRole = useCallback((roleId) => {
        setSelectedRoleIds((prev) =>
            prev.includes(roleId) ? prev.filter((x) => x !== roleId) : [...prev, roleId]
        );
    }, []);

    const submit = useCallback(
        async (e) => {
            e?.preventDefault?.();

            const errors = validateUserForm(form);
            if (errors.length > 0) {
                setResult({ fatal: errors.join("\n• ") });
                return;
            }

            setSaving(true);
            setResult(null);
            try {
                // Langkah 1: buat user
                const created = await idempiereApi(`/models/ad_user`, {
                    method: "POST",
                    body: JSON.stringify({
                        Name: form.name.trim(),
                        EMail: form.email.trim(),
                        Password: form.password, // server yang hash
                        Description: form.description.trim(),
                        IsActive: form.isActive,
                    }),
                });
                const userId = fkId(created?.id) ?? created?.id ?? created?.AD_User_ID;
                if (!userId) throw new Error("Server tidak mengembalikan AD_User_ID.");

                // Langkah 2: assignment role satu per satu
                const roleErrors = [];
                for (const roleId of selectedRoleIds) {
                    try {
                        await idempiereApi(`/models/ad_user_roles`, {
                            method: "POST",
                            body: JSON.stringify({
                                AD_User_ID: { id: parseInt(userId, 10) },
                                AD_Role_ID: { id: parseInt(roleId, 10) },
                                IsActive: true,
                            }),
                        });
                    } catch (err) {
                        const rname = roleNameById.get(roleId) || roleId;
                        roleErrors.push(`${rname}: ${err.message}`);
                    }
                }

                setResult({
                    userId,
                    userName: form.name.trim(), // disimpan sebelum form di-reset
                    roleOk: selectedRoleIds.length - roleErrors.length,
                    roleTotal: selectedRoleIds.length,
                    roleErrors,
                });
                setForm(EMPTY_FORM);
                setSelectedRoleIds([]);
                await onCreated?.();
            } catch (err) {
                setResult({ fatal: err.message });
            } finally {
                setSaving(false);
            }
        },
        [form, selectedRoleIds, roleNameById, onCreated]
    );

    return { form, setField, selectedRoleIds, toggleRole, saving, result, submit };
};

export default useUserSubmit;
