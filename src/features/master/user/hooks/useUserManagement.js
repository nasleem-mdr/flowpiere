// src/features/master/user/hooks/useUserManagement.js
// Seluruh state & logika bisnis Manajemen User. UI hanya memakai return value hook ini.
//
// CATATAN: Password diisi saat CREATE. Untuk user existing, password diganti lewat
// savePassword (aksi terpisah dari saveModal) — tidak ikut terkirim saat Simpan Perubahan.
import { useState, useEffect, useCallback, useMemo } from "react";
import { fkId } from "@/api/idempiereApi";
import { EMPTY_USER_FORM, EMPTY_PASSWORD_FORM } from "./userConstants";
import { isTrue } from "./roleConstants";
import {
    fetchActiveRoles, fetchUserList, fetchUserDetail,
    createUser, updateUser, deleteUser, syncUserRoles, changeUserPassword,
} from "./userApi";

const emptyModal = () => ({
    mode: "create", id: null, form: { ...EMPTY_USER_FORM }, selectedRoleIds: [], records: [],
});

const validateCreate = (f) => {
    const errors = [];
    if (!f.name.trim()) errors.push("Name wajib diisi");
    if (!f.email.trim()) errors.push("Username / Email wajib diisi");
    if (!f.password) errors.push("Password wajib diisi");
    else if (f.password.length < 6) errors.push("Password minimal 6 karakter");
    if (f.password !== f.confirm) errors.push("Konfirmasi password tidak sama");
    return errors;
};

const validatePassword = (f) => {
    const errors = [];
    if (!f.password) errors.push("Password baru wajib diisi");
    else if (f.password.length < 6) errors.push("Password minimal 6 karakter");
    if (f.password !== f.confirm) errors.push("Konfirmasi password tidak sama");
    return errors;
};

export default function useUserManagement() {
    // ── Data ────────────────────────────────────────────────────────────
    const [roles, setRoles] = useState([]);
    const [rolesLoading, setRolesLoading] = useState(false);
    const [users, setUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(false);

    // ── UI state ────────────────────────────────────────────────────────
    const [modal, setModal] = useState(null);        // null = tertutup
    const [formError, setFormError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState(null);      // { type: success|error|warn, text }
    const [togglingId, setTogglingId] = useState(null);
    const [loadingEditId, setLoadingEditId] = useState(null);
    const [confirm, setConfirm] = useState({ isOpen: false, user: null });
    const [deleting, setDeleting] = useState(false);

    // ── Pencarian (dipanggil PageHeader lewat onSearch) ─────────────────
    const [search, setSearchState] = useState("");
    // Terima string maupun event input, supaya cocok dengan cara PageHeader memanggilnya.
    const setSearch = (v) => setSearchState(typeof v === "string" ? v : (v?.target?.value ?? ""));

    // ── Ganti password (modal edit) ─────────────────────────────────────
    const [pwForm, setPwForm] = useState({ ...EMPTY_PASSWORD_FORM });
    const [pwSaving, setPwSaving] = useState(false);
    const [pwResult, setPwResult] = useState(null);  // { type: success|error, text }
    const resetPw = () => { setPwForm({ ...EMPTY_PASSWORD_FORM }); setPwResult(null); };

    // ── Fetch ───────────────────────────────────────────────────────────
    const fetchRoles = useCallback(async () => {
        setRolesLoading(true);
        try {
            setRoles(await fetchActiveRoles());
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
            setUsers(await fetchUserList());
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

    const roleNameById = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles]);

    // Cari di nama, username/email, dan nama role
    const filteredUsers = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return users;
        return users.filter((u) =>
            u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.roleIds.some((rid) => (roleNameById.get(rid) || "").toLowerCase().includes(q))
        );
    }, [users, search, roleNameById]);

    // ── Modal: buka / tutup / ubah ──────────────────────────────────────
    const openCreate = () => { setFormError(null); resetPw(); setModal(emptyModal()); };

    const openEdit = async (user) => {
        setLoadingEditId(user.id);
        try {
            const { user: u, records } = await fetchUserDetail(user.id);
            setFormError(null);
            resetPw();
            setModal({
                mode: "edit",
                id: user.id,
                form: {
                    ...EMPTY_USER_FORM,
                    name: u.Name || "",
                    email: u.EMail || "",
                    description: u.Description || "",
                    isActive: isTrue(u.IsActive),
                },
                selectedRoleIds: records.filter((r) => r.isActive).map((r) => r.roleId),
                records,
            });
        } catch (err) {
            setNotice({ type: "error", text: `Gagal memuat data user untuk edit: ${err.message}` });
        } finally {
            setLoadingEditId(null);
        }
    };

    const closeModal = () => { if (saving || pwSaving) return; resetPw(); setModal(null); };

    const setModalForm = (nextForm) => setModal((prev) => ({ ...prev, form: nextForm }));

    const toggleRole = (roleId) =>
        setModal((prev) => ({
            ...prev,
            selectedRoleIds: prev.selectedRoleIds.includes(roleId)
                ? prev.selectedRoleIds.filter((x) => x !== roleId)
                : [...prev.selectedRoleIds, roleId],
        }));

    // ── SIMPAN (create & edit) ──────────────────────────────────────────
    const saveModal = async () => {
        const { mode, id, form, selectedRoleIds, records } = modal;

        if (mode === "create") {
            const errors = validateCreate(form);
            if (errors.length) { setFormError(`• ${errors.join("\n• ")}`); return; }
        } else if (!form.name.trim() || !form.email.trim()) {
            setFormError("Name dan Username / Email wajib diisi.");
            return;
        }

        setSaving(true);
        setFormError(null);
        const roleErrors = [];
        try {
            const base = {
                Name: form.name.trim(),
                EMail: form.email.trim(),
                Description: form.description.trim(),
                IsActive: form.isActive,
            };

            let userId = id;
            if (mode === "create") {
                const created = await createUser({ ...base, Password: form.password }); // server yang hash
                userId = fkId(created?.id) ?? created?.id ?? created?.AD_User_ID;
                if (!userId) throw new Error("Server tidak mengembalikan AD_User_ID.");
            } else {
                await updateUser(id, base);
            }

            await syncUserRoles(userId, selectedRoleIds, records, roleNameById, roleErrors);

            await fetchUsers();
            setModal(null);
            resetPw();
            setNotice(roleErrors.length
                ? { type: "warn", text: `User "${form.name}" tersimpan, tapi ada ${roleErrors.length} role yang gagal disinkronkan:\n• ${roleErrors.join("\n• ")}` }
                : { type: "success", text: mode === "create" ? `User "${form.name}" berhasil dibuat (AD_User_ID: ${userId}).` : `User "${form.name}" berhasil diperbarui.` });
        } catch (err) {
            setFormError(err.message);
        } finally {
            setSaving(false);
        }
    };

    // ── GANTI PASSWORD (hanya mode edit) ────────────────────────────────
    // Password dikirim apa adanya (plaintext di body, lewat HTTPS); server yang hash.
    // Jangan di-log, jangan disimpan di storage — state dikosongkan setelah berhasil.
    const savePassword = async () => {
        if (!modal || modal.mode !== "edit" || !modal.id) return;
        const errors = validatePassword(pwForm);
        if (errors.length) { setPwResult({ type: "error", text: `• ${errors.join("\n• ")}` }); return; }

        setPwSaving(true);
        setPwResult(null);
        try {
            await changeUserPassword(modal.id, pwForm.password);
            setPwForm({ ...EMPTY_PASSWORD_FORM });
            setPwResult({ type: "success", text: `Password user "${modal.form.name}" berhasil diganti.` });
        } catch (err) {
            setPwResult({ type: "error", text: err.message });
        } finally {
            setPwSaving(false);
        }
    };

    // ── HAPUS ───────────────────────────────────────────────────────────
    const requestDelete = (user) => setConfirm({ isOpen: true, user });
    const cancelDelete = () => setConfirm({ isOpen: false, user: null });
    const confirmDelete = async () => {
        const user = confirm.user;
        cancelDelete();
        setDeleting(true);
        try {
            await deleteUser(user.id);
            await fetchUsers();
            setNotice({ type: "success", text: `User "${user.name}" berhasil dihapus.` });
        } catch (err) {
            setNotice({ type: "error", text: `Gagal menghapus user "${user.name}": ${err.message}\nAlternatif aman: gunakan tombol Nonaktifkan.` });
        } finally {
            setDeleting(false);
        }
    };

    // ── TOGGLE AKTIF ────────────────────────────────────────────────────
    const toggleActive = async (user) => {
        setTogglingId(user.id);
        try {
            await updateUser(user.id, { IsActive: !user.isActive });
            await fetchUsers();
        } catch (err) {
            setNotice({ type: "error", text: `Gagal mengubah status user "${user.name}": ${err.message}` });
        } finally {
            setTogglingId(null);
        }
    };

    return {
        // data
        roles, rolesLoading, roleNameById, users, filteredUsers, usersLoading,
        // pencarian
        search, setSearch,
        // modal
        modal, formError, saving, openCreate, openEdit, closeModal, setModalForm, toggleRole, saveModal,
        // ganti password
        pwForm, setPwForm, pwSaving, pwResult, savePassword,
        // aksi baris
        togglingId, loadingEditId, toggleActive,
        deleting, confirm, requestDelete, cancelDelete, confirmDelete,
        // notifikasi
        notice, dismissNotice: () => setNotice(null),
    };
}