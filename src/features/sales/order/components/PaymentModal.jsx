import React, { useState, useEffect } from "react";

const PaymentModal = ({
    isOpen,
    onClose,
    totalOrderAmount = 0,
    onSubmitPayment,
    idempiereApi,
    adOrgId
}) => {
    // ─── STATE MANAGEMENT ──────────────────────────────────────────────────
    const [tenderTypes, setTenderTypes] = useState([]);
    const [payments, setPayments] = useState([
        { id: Date.now(), C_POSTenderType_ID: "", TenderType: "", PayAmt: "" }
    ]);
    const [isLoading, setIsLoading] = useState(false);

    // ─── KAS/BANK ACCOUNT TUJUAN ──────────────────────────────────────────
    const [bankAccounts, setBankAccounts] = useState([]);
    const [selectedBankAccountId, setSelectedBankAccountId] = useState("");

    // Reset state setiap modal dibuka
    useEffect(() => {
        if (isOpen) {
            setPayments([
                { id: Date.now(), C_POSTenderType_ID: "", TenderType: "", PayAmt: totalOrderAmount || "" }
            ]);
            setIsLoading(false);
        }
    }, [isOpen, totalOrderAmount]);

    // Tutup dengan tombol Esc (tidak saat sedang memproses)
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => {
            if (e.key === "Escape" && !isLoading) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, isLoading, onClose]);

    // ─── AMBIL DATA TENDER TYPE ─────────────────────────────────────────────
    useEffect(() => {
        if (isOpen) {
            const fetchTenderTypes = async () => {
                try {
                    const response = await idempiereApi("/models/c_postendertype?$filter=IsActive eq true");
                    const records = response.records || response || [];
                    setTenderTypes(records);

                    // Auto select tender type pertama jika baru dibuka
                    if (records.length > 0) {
                        const first = records[0];
                        const firstId = first.id?.id ?? first.id ?? first.C_POSTenderType_ID;
                        const firstCode = typeof first.TenderType === "object" ? (first.TenderType.id || "X") : (first.TenderType || "X");

                        setPayments([{
                            id: Date.now(),
                            C_POSTenderType_ID: String(firstId),
                            TenderType: firstCode,
                            PayAmt: totalOrderAmount || ""
                        }]);
                    }
                } catch (err) {
                    console.error("Gagal mengambil data C_POSTenderType:", err);
                }
            };
            fetchTenderTypes();
        }
    }, [isOpen, totalOrderAmount]);

    // ─── AMBIL DATA C_BANKACCOUNT ─────────────────────────────────────────
    useEffect(() => {
        if (isOpen) {
            const fetchBankAccounts = async () => {
                try {
                    const orgId = adOrgId ? parseInt(adOrgId) : null;
                    const filter = orgId
                        ? `IsActive eq true and (AD_Org_ID eq 0 or AD_Org_ID eq ${orgId})`
                        : `IsActive eq true`;
                    const query = `/models/c_bankaccount?$filter=${filter}`;
                    const response = await idempiereApi(query);
                    const records = response.records || response || [];
                    setBankAccounts(records);

                    const defaultAcct = records.find(b => b.IsDefault === true || b.IsDefault === "Y");
                    const fallback = defaultAcct || records[0];
                    if (fallback) {
                        const fallbackId = fallback.id?.id ?? fallback.id ?? fallback.C_BankAccount_ID;
                        setSelectedBankAccountId(fallbackId ? String(fallbackId) : "");
                    }
                } catch (err) {
                    console.error("Gagal mengambil data C_BankAccount:", err);
                }
            };
            fetchBankAccounts();
        }
    }, [isOpen, adOrgId]);

    if (!isOpen) return null;

    // ─── KALKULASI NOMINAL KASIR ───────────────────────────────────────────
    const totalPaid = payments.reduce((sum, item) => sum + (parseFloat(item.PayAmt) || 0), 0);
    const remainingAmount = totalOrderAmount - totalPaid;
    const isShort = remainingAmount > 0;

    const isSingleCashPayment = payments.length === 1 && payments[0].TenderType === "X";

    const getBankAccountLabel = (b) => {
        let name = b.Name;
        if (name && typeof name === "object") name = name.identifier || name.propertyLabel || "";
        if (!name && b.identifier) name = typeof b.identifier === "object" ? b.identifier.identifier : b.identifier;
        const acctNo = typeof b.AccountNo === "object" ? (b.AccountNo?.identifier || "") : (b.AccountNo || "");
        return acctNo ? `${name || "Kas"} - ${acctNo}` : (name || "Kas Tanpa Nama");
    };

    // Helper Format Angka Ribuan
    const formatCurrency = (val) => {
        return (parseFloat(val) || 0).toLocaleString("id-ID");
    };

    // ─── HANDLER FORM ──────────────────────────────────────────────────────
    const handleAddRow = () => {
        const defaultAmt = remainingAmount > 0 ? remainingAmount : "";
        setPayments([
            ...payments,
            { id: Date.now(), C_POSTenderType_ID: "", TenderType: "", PayAmt: defaultAmt }
        ]);
    };

    const handleRemoveRow = (id) => {
        if (payments.length === 1) return;
        setPayments(payments.filter(item => item.id !== id));
    };

    const handleRowChange = (id, field, value) => {
        const updated = payments.map((row) => {
            if (row.id === id) {
                if (field === "C_POSTenderType_ID") {
                    const selected = tenderTypes.find(t => {
                        const targetId = t.id?.id ?? t.id ?? t.C_POSTenderType_ID;
                        return String(targetId) === String(value);
                    });

                    const rawTenderCode = typeof selected?.TenderType === "object"
                        ? (selected?.TenderType?.id || "X")
                        : (selected?.TenderType || "X");

                    return {
                        ...row,
                        C_POSTenderType_ID: value,
                        TenderType: rawTenderCode
                    };
                }
                return { ...row, [field]: value };
            }
            return row;
        });
        setPayments(updated);
    };

    // ─── SUBMIT HANDLER ────────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();

        if (totalPaid < totalOrderAmount) {
            alert(`Pembayaran masih kurang! Kurang: Rp ${formatCurrency(remainingAmount)}`);
            return;
        }

        if (payments.length > 1 && Math.abs(remainingAmount) > 0.01) {
            alert(
                `Untuk pembayaran gabungan (lebih dari 1 metode), total bayar harus PERSIS sama ` +
                `dengan total tagihan (tidak boleh ada kembalian). Selisih saat ini: Rp ${formatCurrency(remainingAmount)}.`
            );
            return;
        }

        setIsLoading(true);

        try {
            const cleanPayments = payments.map(({ C_POSTenderType_ID, TenderType, PayAmt }) => ({
                C_POSTenderType_ID: parseInt(C_POSTenderType_ID),
                TenderType: TenderType,
                PayAmt: parseFloat(PayAmt)
            }));

            const bankAccountId = selectedBankAccountId ? parseInt(selectedBankAccountId) : null;

            await onSubmitPayment(cleanPayments, bankAccountId);
            onClose();
        } catch (error) {
            console.error("Gagal submit pembayaran:", error);
            alert(`Gagal memproses pembayaran: ${error.message || "Terjadi kesalahan pada server"}`);
        } finally {
            setIsLoading(false);
        }
    };

    // ─── RENDER ────────────────────────────────────────────────────────────
    return (
        <div className="pm-overlay">
            <style>{CSS}</style>

            <div className="pm-card" role="dialog" aria-modal="true" aria-labelledby="pm-title">
                {/* Header */}
                <div className="pm-header">
                    <h2 id="pm-title" className="pm-title">Pembayaran</h2>
                    <button
                        type="button"
                        className="pm-icon-btn"
                        onClick={onClose}
                        disabled={isLoading}
                        aria-label="Tutup"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="pm-body">
                        {/* Ringkasan nominal */}
                        <div className="pm-due">
                            <span className="pm-due-label">Total tagihan</span>
                            <span className="pm-due-amount">
                                <span className="pm-due-cur">Rp</span>{formatCurrency(totalOrderAmount)}
                            </span>
                        </div>

                        <div className="pm-stats">
                            <div className="pm-stat">
                                <span className="pm-stat-label">Dibayar</span>
                                <span className="pm-stat-value">Rp {formatCurrency(totalPaid)}</span>
                            </div>
                            <div className="pm-stat-divider" />
                            <div className="pm-stat">
                                <span className="pm-stat-label">
                                    {isShort ? "Kurang" : "Kembalian"}
                                </span>
                                <span className={`pm-stat-value ${isShort ? "is-short" : "is-ok"}`}>
                                    Rp {formatCurrency(Math.abs(remainingAmount))}
                                </span>
                            </div>
                        </div>

                        {/* Baris pembayaran */}
                        <div className="pm-section-title">Metode pembayaran</div>

                        <div className="pm-pay-head">
                            <span>Cara bayar</span>
                            <span>Jumlah</span>
                            <span />
                        </div>

                        <div className="pm-pay-list">
                            {payments.map((row) => (
                                <div key={row.id} className="pm-pay-row">
                                    <select
                                        required
                                        aria-label="Cara bayar"
                                        value={row.C_POSTenderType_ID}
                                        onChange={(e) => handleRowChange(row.id, "C_POSTenderType_ID", e.target.value)}
                                        className="pm-control"
                                        disabled={isLoading}
                                    >
                                        <option value="">Pilih cara bayar</option>
                                        {tenderTypes.map((t, idx) => {
                                            const rawId = t.id?.id ?? t.id ?? t.C_POSTenderType_ID;
                                            const stringId = rawId ? String(rawId) : "";

                                            let displayName = "Cara Bayar";
                                            if (t.Name) {
                                                displayName = typeof t.Name === "object" ? (t.Name.identifier || t.Name.propertyLabel) : t.Name;
                                            } else if (t.identifier) {
                                                displayName = typeof t.identifier === "object" ? t.identifier.identifier : t.identifier;
                                            }

                                            return (
                                                <option key={stringId || `tt-${idx}`} value={stringId}>
                                                    {displayName}
                                                </option>
                                            );
                                        })}
                                    </select>

                                    <div className="pm-amount-wrap">
                                        <span className="pm-amount-prefix">Rp</span>
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            placeholder="0"
                                            aria-label="Jumlah pembayaran"
                                            value={row.PayAmt}
                                            onChange={(e) => handleRowChange(row.id, "PayAmt", e.target.value)}
                                            className="pm-control pm-amount"
                                            disabled={isLoading}
                                        />
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => handleRemoveRow(row.id)}
                                        className="pm-icon-btn pm-remove"
                                        disabled={payments.length === 1 || isLoading}
                                        title="Hapus metode"
                                        aria-label="Hapus metode"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={handleAddRow}
                            className="pm-link-btn"
                            disabled={isLoading}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                            Tambah metode pembayaran
                        </button>

                        {/* Kas / Bank tujuan */}
                        {isSingleCashPayment && (
                            <div className="pm-bank">
                                <label className="pm-bank-label" htmlFor="pm-bank-select">Kas / Bank tujuan</label>
                                <select
                                    id="pm-bank-select"
                                    required
                                    value={selectedBankAccountId}
                                    onChange={(e) => setSelectedBankAccountId(e.target.value)}
                                    className="pm-control"
                                    disabled={isLoading}
                                >
                                    <option value="">Pilih kas/bank</option>
                                    {bankAccounts.map((b, idx) => {
                                        const rawId = b.id?.id ?? b.id ?? b.C_BankAccount_ID;
                                        const stringId = rawId ? String(rawId) : "";
                                        return (
                                            <option key={stringId || `ba-${idx}`} value={stringId}>
                                                {getBankAccountLabel(b)}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="pm-footer">
                        <button type="button" onClick={onClose} className="pm-btn pm-btn-ghost" disabled={isLoading}>
                            Batal
                        </button>
                        <button type="submit" className="pm-btn pm-btn-primary" disabled={isLoading}>
                            {isLoading ? "Memproses..." : "Bayar"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─── STYLES ───────────────────────────────────────────────────────────────
// Warna dipusatkan di token CSS (.pm-overlay) — ganti nilai di sini untuk
// menyesuaikan dengan palet aplikasi.
const CSS = `
.pm-overlay{
  --pm-navy:#0B1F33; --pm-primary:#0F766E; --pm-primary-hover:#0B5F58; --pm-tint:#E6F4F2;
  --pm-bg:#F4F7F9; --pm-card:#FFFFFF; --pm-border:#D7DEE5; --pm-text:#0F172A; --pm-muted:#64748B;
  --pm-ok:#15803D; --pm-ok-bg:#E8F5EC; --pm-danger:#B91C1C; --pm-danger-bg:#FDECEC;
  position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center;
  padding:16px; background:rgba(11,31,51,.55);
  font-family:'Aptos','Segoe UI',system-ui,-apple-system,sans-serif; color:var(--pm-text);
}
.pm-overlay *{box-sizing:border-box}
.pm-card{
  width:680px; max-width:100%; max-height:calc(100vh - 32px); overflow:auto;
  background:var(--pm-card); border-radius:14px; box-shadow:0 24px 60px rgba(11,31,51,.28);
}
.pm-header{
  display:flex; align-items:center; justify-content:space-between;
  padding:16px 20px; border-bottom:1px solid var(--pm-border);
}
.pm-title{margin:0; font-size:17px; font-weight:600; letter-spacing:-.01em}
.pm-body{padding:20px}

.pm-due{
  background:var(--pm-navy); color:#fff; border-radius:12px; padding:16px 20px;
  display:flex; flex-direction:column; gap:4px;
}
.pm-due-label{font-size:13px; color:#A9B8C9}
.pm-due-amount{font-size:38px; font-weight:700; line-height:1.1; letter-spacing:-.02em; font-variant-numeric:tabular-nums; text-align:right}
.pm-due-cur{font-size:18px; font-weight:500; color:#A9B8C9; margin-right:8px; letter-spacing:0}

.pm-stats{
  display:flex; align-items:stretch; margin-top:12px;
  border:1px solid var(--pm-border); border-radius:12px; background:var(--pm-bg);
}
.pm-stat{flex:1; padding:10px 16px; display:flex; flex-direction:column; gap:2px}
.pm-stat-divider{width:1px; background:var(--pm-border)}
.pm-stat-label{font-size:12px; color:var(--pm-muted)}
.pm-stat-value{font-size:18px; font-weight:600; font-variant-numeric:tabular-nums; text-align:right}
.pm-stat-value.is-ok{color:var(--pm-ok)}
.pm-stat-value.is-short{color:var(--pm-danger)}

.pm-section-title{margin:22px 0 8px; font-size:14px; font-weight:600}
.pm-pay-head, .pm-pay-row{
  display:grid; grid-template-columns:1fr 1fr 40px; gap:10px; align-items:center;
}
.pm-pay-head{font-size:12px; color:var(--pm-muted); margin-bottom:6px; padding:0 2px}
.pm-pay-list{display:flex; flex-direction:column; gap:10px}

.pm-control{
  width:100%; height:48px; padding:0 14px; font:inherit; font-size:15px; font-weight:500; color:var(--pm-text);
  background:#fff; border:1px solid var(--pm-border); border-radius:10px; outline:none;
  transition:border-color .15s, box-shadow .15s;
}
select.pm-control{cursor:pointer}
.pm-control:hover:not(:disabled){border-color:#AEB9C5}
.pm-control:focus-visible{border-color:var(--pm-primary); box-shadow:0 0 0 3px rgba(15,118,110,.2)}
.pm-control:disabled{background:var(--pm-bg); color:var(--pm-muted); cursor:not-allowed}

.pm-amount-wrap{position:relative}
.pm-amount-prefix{
  position:absolute; left:14px; top:50%; transform:translateY(-50%);
  font-size:14px; font-weight:500; color:var(--pm-muted); pointer-events:none;
}
.pm-amount{
  padding-left:40px; text-align:right; font-size:20px; font-weight:700;
  font-variant-numeric:tabular-nums; -moz-appearance:textfield;
}
.pm-amount::-webkit-outer-spin-button, .pm-amount::-webkit-inner-spin-button{-webkit-appearance:none; margin:0}

.pm-icon-btn{
  width:40px; height:40px; display:inline-flex; align-items:center; justify-content:center;
  border:none; background:transparent; color:var(--pm-muted); border-radius:10px; cursor:pointer;
  transition:background .15s, color .15s;
}
.pm-icon-btn:hover:not(:disabled){background:var(--pm-bg); color:var(--pm-text)}
.pm-icon-btn:focus-visible{outline:2px solid var(--pm-primary); outline-offset:1px}
.pm-icon-btn:disabled{opacity:.35; cursor:not-allowed}
.pm-remove:hover:not(:disabled){background:var(--pm-danger-bg); color:var(--pm-danger)}

.pm-link-btn{
  margin-top:12px; display:inline-flex; align-items:center; gap:6px; padding:6px 4px;
  border:none; background:none; font:inherit; font-size:14px; font-weight:600; color:var(--pm-primary); cursor:pointer;
  border-radius:8px;
}
.pm-link-btn:hover:not(:disabled){color:var(--pm-primary-hover); text-decoration:underline}
.pm-link-btn:focus-visible{outline:2px solid var(--pm-primary); outline-offset:1px}
.pm-link-btn:disabled{opacity:.4; cursor:not-allowed}

.pm-bank{
  margin-top:16px; padding:14px; border-radius:12px;
  background:var(--pm-tint); border:1px solid #BFE3DE;
}
.pm-bank-label{display:block; margin-bottom:6px; font-size:13px; font-weight:600; color:var(--pm-primary-hover)}

.pm-footer{
  display:flex; justify-content:flex-end; gap:10px; padding:14px 20px;
  border-top:1px solid var(--pm-border); background:var(--pm-bg);
  border-radius:0 0 14px 14px;
}
.pm-btn{
  height:44px; padding:0 22px; border-radius:10px; font:inherit; font-size:15px; font-weight:600; cursor:pointer;
  transition:background .15s, border-color .15s;
}
.pm-btn:focus-visible{outline:2px solid var(--pm-primary); outline-offset:2px}
.pm-btn:disabled{opacity:.6; cursor:not-allowed}
.pm-btn-ghost{background:#fff; color:var(--pm-text); border:1px solid var(--pm-border)}
.pm-btn-ghost:hover:not(:disabled){border-color:#AEB9C5; background:#fff}
.pm-btn-primary{background:var(--pm-primary); color:#fff; border:1px solid var(--pm-primary); flex:1; max-width:240px}
.pm-btn-primary:hover:not(:disabled){background:var(--pm-primary-hover); border-color:var(--pm-primary-hover)}

@media (max-width:440px){
  .pm-pay-head{display:none}
  .pm-pay-row{grid-template-columns:1fr 40px}
  .pm-amount-wrap{grid-column:1 / 2; grid-row:2}
  .pm-pay-row .pm-remove{grid-column:2; grid-row:1}
  .pm-footer{flex-direction:column-reverse}
  .pm-btn-primary{max-width:none}
}
`;

export default PaymentModal;