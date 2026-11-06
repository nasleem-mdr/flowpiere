// src/features/finance/bank-transfer/components/BankTransferModal.jsx
// Form buat / edit Bank-Cash Transfer. Edit hanya untuk dokumen berstatus Draft.
import React, { useState, useEffect, useMemo, useRef } from "react";

import {
    fetchBankAccounts, fetchCharges, fetchConversionTypes, fetchBPartners,
    saveTransfer, runDocAction, reconcileTransfer,
    TENDER_TYPES, num, todayIso, toDateInput, readError,
} from "../utils/bankTransferApi";
// BP terakhir yang dipakai diingat di browser sebagai default transfer berikutnya
const LAST_BP_KEY = "bankTransfer.lastBPartner";
const readLastBp = () => {
    try { return JSON.parse(localStorage.getItem(LAST_BP_KEY)) || null; } catch { return null; }
};

const emptyForm = () => ({
    fromBPartner: readLastBp(),
    toBPartner: null,
    sameBp: true,
    payDate: todayIso(),
    dateAcct: todayIso(),
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    toAmt: "",
    rate: "",
    conversionTypeId: "",
    chargeId: "",
    fromTender: "A",
    toTender: "A",
    description: "",
    autoStatement: true,
});

const round2 = (n) => String(Math.round(n * 100) / 100);

const BankTransferModal = ({ isOpen, onClose, onSaved, editRecord = null }) => {
    const [accounts, setAccounts] = useState([]);
    const [charges, setCharges] = useState([]);
    const [convTypes, setConvTypes] = useState([]);
    const [loadingLookups, setLoadingLookups] = useState(false);
    const [form, setForm] = useState(emptyForm());
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    // Kalau create sukses tapi Complete gagal, dokumen draft sudah ada: klik berikutnya = update
    const [savedId, setSavedId] = useState(null);
    const [transferDone, setTransferDone] = useState(false);
    // Lookup dimuat tiap modal dibuka
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        (async () => {
            setLoadingLookups(true);
            setError(null);
            try {
                const [acc, chg, ct] = await Promise.all([
                    fetchBankAccounts(), fetchCharges(), fetchConversionTypes(),
                ]);
                if (cancelled) return;
                setAccounts(acc);
                setCharges(chg);
                setConvTypes(ct);
            } catch (err) {
                if (!cancelled) setError("Gagal memuat data pilihan: " + readError(err));
            } finally {
                if (!cancelled) setLoadingLookups(false);
            }
        })();
        return () => { cancelled = true; };
    }, [isOpen]);

    // Isi form saat modal dibuka (baru / edit)
    useEffect(() => {
        if (!isOpen) return;
        setSavedId(null);
        setTransferDone(false);
        setError(null);
        if (editRecord) {
            setForm({
                payDate: toDateInput(editRecord.payDate) || todayIso(),
                dateAcct: toDateInput(editRecord.dateAcct) || todayIso(),
                fromAccountId: editRecord.fromAccountId ?? "",
                toAccountId: editRecord.toAccountId ?? "",
                amount: String(editRecord.fromAmt ?? ""),
                toAmt: String(editRecord.toAmt ?? ""),
                rate: editRecord.rate ? String(editRecord.rate) : "",
                conversionTypeId: editRecord.conversionTypeId ?? "",
                chargeId: editRecord.chargeId ?? "",
                fromTender: editRecord.fromTender || "A",
                toTender: editRecord.toTender || "A",
                description: editRecord.description || "",
                fromBPartner: editRecord.fromBPartner || null,
                toBPartner: editRecord.toBPartner || null,
                sameBp: !editRecord.toBPartner || editRecord.toBPartner.id === editRecord.fromBPartner?.id,
                autoStatement: true,
            });
        } else {
            setForm(emptyForm());
        }
    }, [isOpen, editRecord]);

    // Default: Charge = satu-satunya charge yang ada; Conversion Type = Spot
    useEffect(() => {
        setForm((f) => ({
            ...f,
            chargeId: f.chargeId || (charges.length === 1 ? charges[0].id : ""),
            conversionTypeId: f.conversionTypeId || (convTypes.find((c) => c.isSpot)?.id ?? ""),
        }));
    }, [charges, convTypes]);

    const fromAcc = useMemo(() => accounts.find((a) => String(a.id) === String(form.fromAccountId)), [accounts, form.fromAccountId]);
    const toAcc = useMemo(() => accounts.find((a) => String(a.id) === String(form.toAccountId)), [accounts, form.toAccountId]);
    const crossCurrency = !!(fromAcc && toAcc && fromAcc.currencyId !== toAcc.currencyId);

    const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

    // Lintas mata uang: jumlah tujuan & kurs saling mengikuti
    const onAmountChange = (v) =>
        setForm((f) => {
            const next = { ...f, amount: v };
            if (num(f.rate) > 0) next.toAmt = round2(num(v) * num(f.rate));
            return next;
        });
    const onRateChange = (v) =>
        setForm((f) => ({ ...f, rate: v, toAmt: num(v) > 0 ? round2(num(f.amount) * num(v)) : f.toAmt }));
    const onToAmtChange = (v) =>
        setForm((f) => ({ ...f, toAmt: v, rate: num(f.amount) > 0 && num(v) > 0 ? String(num(v) / num(f.amount)) : f.rate }));

    const validate = () => {
        if (!fromAcc) return "Pilih rekening asal.";
        if (!toAcc) return "Pilih rekening tujuan.";
        if (fromAcc.id === toAcc.id) return "Rekening asal dan tujuan tidak boleh sama.";
        if (num(form.amount) <= 0) return "Jumlah transfer harus lebih dari 0.";
        if (!form.payDate || !form.dateAcct) return "Tanggal transfer dan tanggal akuntansi wajib diisi.";
        if (!form.fromBPartner?.id) return "Pilih Business Partner.";
        if (!form.sameBp && !form.toBPartner?.id) return "Pilih Business Partner tujuan.";
        if (!form.chargeId) return "Pilih Charge (akun transit transfer).";
        if (crossCurrency) {
            if (!form.conversionTypeId) return "Pilih Currency Type untuk transfer lintas mata uang.";
            if (num(form.rate) <= 0 || num(form.toAmt) <= 0) return "Isi kurs dan jumlah diterima untuk transfer lintas mata uang.";
        }
        return null;
    };

    const handleSubmit = async (andComplete) => {
        const msg = validate();
        if (msg) { setError(msg); return; }
    
        setSaving(true);
        setError(null);
        let id = editRecord?.id ?? savedId;
    
        // Kalau transfer sudah Complete (retry bank statement), lewati simpan & complete
        if (!transferDone) {
            try {
                const saved = await saveTransfer({ id, form, fromAcc, toAcc });
                id = saved.id;
                setSavedId(id);
            } catch (err) {
                setError("Gagal menyimpan: " + readError(err));
                setSaving(false);
                return;
            }
    
            if (andComplete) {
                try {
                    await runDocAction(id, "CO");
                    setTransferDone(true);
                } catch (err) {
                    setError("Draft tersimpan, tetapi gagal Complete: " + readError(err));
                    onSaved?.();
                    setSaving(false);
                    return;
                }
            }
        }
    
        if (andComplete && form.autoStatement) {
            try {
                await reconcileTransfer(id, {
                    statementDate: form.payDate,
                    dateAcct: form.dateAcct,
                    description: form.description,
                });
            } catch (err) {
                setError("Transfer sudah Complete, tetapi Bank Statement gagal dibuat: " + readError(err) +
                    "\nKlik tombol di bawah untuk mengulang (yang sudah berhasil tidak akan dobel).");
                onSaved?.();
                setSaving(false);
                return;
            }
        }
    
        try { localStorage.setItem(LAST_BP_KEY, JSON.stringify(form.fromBPartner)); } catch { /* abaikan */ }
        setSaving(false);
        onSaved?.();
        onClose();
    };

    if (!isOpen) return null;

    const disabled = saving || loadingLookups;

    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                <div style={styles.header}>
                    <h3 style={{ margin: 0 }}>
                        {editRecord ? `Edit Transfer ${editRecord.documentNo || ""}` : "Bank/Cash Transfer Baru"}
                    </h3>
                    <button onClick={onClose} style={styles.closeBtn} aria-label="Tutup">✕</button>
                </div>

                <div style={styles.body}>
                    {loadingLookups && <p style={styles.hint}>Memuat daftar rekening...</p>}

                    <div style={styles.grid}>
                        <Field label="Tanggal Transfer">
                            <input type="date" value={form.payDate} onChange={(e) => set("payDate", e.target.value)} style={styles.input} />
                        </Field>
                        <Field label="Tanggal Akuntansi">
                            <input type="date" value={form.dateAcct} onChange={(e) => set("dateAcct", e.target.value)} style={styles.input} />
                        </Field>

                        <Field label="Dari Rekening">
                            <select value={form.fromAccountId} onChange={(e) => set("fromAccountId", e.target.value)} style={styles.input}>
                                <option value="">— Pilih rekening asal —</option>
                                {accounts.map((a) => (
                                    <option key={a.id} value={a.id}>{a.label}{a.currencyCode ? ` (${a.currencyCode})` : ""}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Ke Rekening">
                            <select value={form.toAccountId} onChange={(e) => set("toAccountId", e.target.value)} style={styles.input}>
                                <option value="">— Pilih rekening tujuan —</option>
                                {accounts.map((a) => (
                                    <option key={a.id} value={a.id}>{a.label}{a.currencyCode ? ` (${a.currencyCode})` : ""}</option>
                                ))}
                            </select>
                        </Field>

                        <Field label={`Jumlah Transfer${fromAcc?.currencyCode ? ` (${fromAcc.currencyCode})` : ""}`}>
                            <input type="number" min="0" step="any" value={form.amount} onChange={(e) => onAmountChange(e.target.value)} style={{ ...styles.input, textAlign: "right" }} />
                        </Field>
                        <Field label="Charge (akun transit)">
                            <select value={form.chargeId} onChange={(e) => set("chargeId", e.target.value)} style={styles.input}>
                                <option value="">— Pilih charge —</option>
                                {charges.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </select>
                        </Field>
                        {form.sameBp ? (
                            <>
                                <Field label=" ">
                                    <label style={styles.checkRow}>
                                        <input type="checkbox" checked={!form.sameBp} onChange={(e) => set("sameBp", !e.target.checked)} />
                                        BP tujuan berbeda
                                    </label>
                                </Field>
                                <Field label="Business Partner">
                                    <BPartnerSelect value={form.fromBPartner} onChange={(bp) => set("fromBPartner", bp)} />
                                </Field>
                            </>
                        ) : (
                            <>
                                {/* BP tujuan berbeda: checkbox satu baris penuh, lalu BP asal (kiri) & BP tujuan (kanan) sejajar */}
                                <div style={{ gridColumn: "1 / -1" }}>
                                    <label style={styles.checkRow}>
                                        <input type="checkbox" checked={!form.sameBp} onChange={(e) => set("sameBp", !e.target.checked)} />
                                        BP tujuan berbeda
                                    </label>
                                </div>
                                <Field label="Business Partner">
                                    <BPartnerSelect value={form.fromBPartner} onChange={(bp) => set("fromBPartner", bp)} />
                                </Field>
                                <Field label="Business Partner (tujuan)">
                                    <BPartnerSelect value={form.toBPartner} onChange={(bp) => set("toBPartner", bp)} />
                                </Field>
                            </>
                        )}

                        {crossCurrency && (
                            <>
                                <Field label="Currency Type">
                                    <select value={form.conversionTypeId} onChange={(e) => set("conversionTypeId", e.target.value)} style={styles.input}>
                                        <option value="">— Pilih —</option>
                                        {convTypes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                </Field>
                                <Field label={`Kurs (1 ${fromAcc?.currencyCode} = ? ${toAcc?.currencyCode})`}>
                                    <input type="number" min="0" step="any" value={form.rate} onChange={(e) => onRateChange(e.target.value)} style={{ ...styles.input, textAlign: "right" }} />
                                </Field>
                                <Field label={`Jumlah Diterima (${toAcc?.currencyCode})`}>
                                    <input type="number" min="0" step="any" value={form.toAmt} onChange={(e) => onToAmtChange(e.target.value)} style={{ ...styles.input, textAlign: "right" }} />
                                </Field>
                                <div />
                            </>
                        )}

                        <Field label="Metode (asal)">
                            <select value={form.fromTender} onChange={(e) => set("fromTender", e.target.value)} style={styles.input}>
                                {TENDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </Field>
                        <Field label="Metode (tujuan)">
                            <select value={form.toTender} onChange={(e) => set("toTender", e.target.value)} style={styles.input}>
                                {TENDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </Field>
                    </div>
                    <label style={styles.checkRow}>
                        <input type="checkbox" checked={form.autoStatement} onChange={(e) => set("autoStatement", e.target.checked)} />
                        Langsung buat Bank Statement kedua rekening (tanpa rekonsiliasi manual)
                    </label>
                    <Field label="Keterangan">
                        <textarea rows={2} value={form.description} maxLength={255} onChange={(e) => set("description", e.target.value)} style={{ ...styles.input, resize: "vertical" }} />
                    </Field>

                    {error && <div style={styles.errorBox}>❌ {error}</div>}
                </div>

                <div style={styles.footer}>
                    <button onClick={onClose} disabled={saving} style={styles.cancelBtn}>Batal</button>
                    <button onClick={() => handleSubmit(false)} disabled={disabled || transferDone} style={styles.saveBtn}>
                        {saving ? "⏳ ..." : "💾 Simpan Draft"}
                    </button>
                    <button onClick={() => handleSubmit(true)} disabled={disabled} style={styles.completeBtn}>
                        {saving ? "⏳ ..." : transferDone ? "🔁 Ulangi Bank Statement" : "✅ Simpan & Complete"}
                    </button>
                    
                </div>
            </div>
        </div>
    );
};

// Pencarian Business Partner dengan debounce (server-side, maks 20 hasil)
const BPartnerSelect = ({ value, onChange }) => {
    const [text, setText] = useState("");
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const boxRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetchBPartners(text);
                if (!cancelled) setOptions(res);
            } catch {
                if (!cancelled) setOptions([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 300);
        return () => { cancelled = true; clearTimeout(t); };
    }, [text, open]);

    useEffect(() => {
        const onDown = (e) => {
            if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, []);

    return (
        <div ref={boxRef} style={{ position: "relative" }}>
            <input
                type="text"
                placeholder="Cari kode / nama partner..."
                value={open ? text : (value?.label || "")}
                onFocus={() => { setText(""); setOpen(true); }}
                onChange={(e) => { setText(e.target.value); setOpen(true); }}
                style={styles.input}
            />
            {open && (
                <div style={styles.dropdown}>
                    {loading && <div style={styles.dropdownInfo}>Mencari...</div>}
                    {!loading && options.length === 0 && <div style={styles.dropdownInfo}>Tidak ada partner.</div>}
                    {options.map((o) => (
                        <div
                            key={o.id}
                            style={styles.dropdownItem}
                            onMouseDown={(e) => { e.preventDefault(); onChange(o); setOpen(false); }}
                        >
                            {o.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const Field = ({ label, children }) => (
    <div style={styles.field}>
        <label style={styles.label}>{label}</label>
        {children}
    </div>
);

const styles = {
    overlay:     { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" },
    modal:       { background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "680px", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 32px rgba(0,0,0,0.25)" },
    header:      { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #e5e7eb" },
    closeBtn:    { border: "none", background: "transparent", fontSize: "18px", cursor: "pointer", color: "#666" },
    body:        { padding: "16px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" },
    grid:        { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" },
    field:       { display: "flex", flexDirection: "column", gap: "4px" },
    label:       { fontSize: "12px", fontWeight: "600", color: "#555" },
    input:       { padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px", background: "#fff", width: "100%", boxSizing: "border-box" },
    checkRow:    { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", padding: "8px 0", cursor: "pointer" },
    dropdown:    { position: "absolute", top: "100%", left: 0, right: 0, marginTop: "4px", background: "#fff", border: "1px solid #ddd", borderRadius: "6px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 20, maxHeight: "220px", overflowY: "auto" },
    dropdownItem:{ padding: "8px 10px", fontSize: "13px", cursor: "pointer" },
    dropdownInfo:{ padding: "8px 10px", fontSize: "12px", color: "#888" },
    hint:        { fontSize: "12px", color: "#777", margin: 0 },
    errorBox:    { background: "#ffebee", border: "1px solid #ef9a9a", color: "#b71c1c", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", whiteSpace: "pre-line" },
    footer:      { display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 20px", borderTop: "1px solid #e5e7eb" },
    cancelBtn:   { background: "#f5f5f5", border: "1px solid #ddd", padding: "9px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: "600" },
    saveBtn:     { background: "#546e7a", color: "#fff", border: "none", padding: "9px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" },
    completeBtn: { background: "#2e7d32", color: "#fff", border: "none", padding: "9px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" },
};

export default BankTransferModal;