// src/features/master/user/hooks/useMyProfile.js
import { useState, useEffect, useCallback } from "react";
import { EMPTY_PASSWORD_FORM } from "./userConstants";
import { changeUserPassword, uploadUserAvatar, findUserIdByLogin } from "./userApi";

const validatePassword = (f) => {
    const errors = [];
    if (!f.password) errors.push("Password baru wajib diisi");
    else if (f.password.length < 6) errors.push("Password minimal 6 karakter");
    if (f.password !== f.confirm) errors.push("Konfirmasi password tidak sama");
    return errors;
};

const MAX_FILE_MB = 5;

export default function useMyProfile({ session, onAvatarChanged }) {
    const [modal, setModal] = useState(null);           // null | { mode: "profile", id, form:{name} }
    const [pwForm, setPwForm] = useState({ ...EMPTY_PASSWORD_FORM });
    const [pwSaving, setPwSaving] = useState(false);
    const [pwResult, setPwResult] = useState(null);

    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [avatarSaving, setAvatarSaving] = useState(false);
    const [avatarResult, setAvatarResult] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const cancelAvatar = () => { setAvatarFile(null); setAvatarPreview(null); setAvatarResult(null); };

    // bersihkan object URL preview
    useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);

    const reset = () => {
        setPwForm({ ...EMPTY_PASSWORD_FORM }); setPwResult(null);
        setAvatarFile(null); setAvatarPreview(null); setAvatarResult(null);
    };

    const open = useCallback(async () => {
        reset();
        setLoadError(null);
        setModal({ mode: "profile", id: null, form: { name: session.username } }); // buka dulu
        try {
            let id = session.userId ? Number(session.userId) : null;
            if (!id) id = await findUserIdByLogin(session.username);
            if (!id) throw new Error(`AD_User_ID untuk "${session.username}" tidak ditemukan.`);
            setModal((prev) => (prev ? { ...prev, id } : prev));
        } catch (err) {
            setLoadError(err.message);
        }
    }, [session]);

    const close = () => { 
        if (pwSaving || avatarSaving) return; 
        reset(); 
        setModal(null); 
        setLoadError(null)
    };

    const pickAvatar = (file) => {
        setAvatarResult(null);
        if (!file) return;
        if (!file.type.startsWith("image/")) return setAvatarResult({ type: "error", text: "File harus berupa gambar." });
        if (file.size > MAX_FILE_MB * 1024 * 1024) return setAvatarResult({ type: "error", text: `Maksimal ${MAX_FILE_MB} MB.` });
        setAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(file));
    };

    const saveAvatar = async () => {
        if (!modal || !avatarFile) return;
        setAvatarSaving(true); setAvatarResult(null);
        try {
            await uploadUserAvatar(modal.id, avatarFile);
            setAvatarFile(null);
            setAvatarResult({ type: "success", text: "Foto profil berhasil diperbarui." });
            onAvatarChanged?.();
        } catch (err) {
            setAvatarResult({ type: "error", text: err.message });
        } finally { setAvatarSaving(false); }
    };

    const savePassword = async () => {
        if (!modal) return;
        const errors = validatePassword(pwForm);
        if (errors.length) { setPwResult({ type: "error", text: `• ${errors.join("\n• ")}` }); return; }
        setPwSaving(true); setPwResult(null);
        try {
            await changeUserPassword(modal.id, pwForm.password);
            setPwForm({ ...EMPTY_PASSWORD_FORM });
            setPwResult({ type: "success", text: "Password berhasil diganti." });
        } catch (err) {
            setPwResult({ type: "error", text: err.message });
        } finally { setPwSaving(false); }
    };

    return {
        modal, open, close,
        pwForm, setPwForm, pwSaving, pwResult, savePassword, loadError, cancelAvatar,
        avatarFile, avatarPreview, avatarSaving, avatarResult, pickAvatar, saveAvatar,
    };
}