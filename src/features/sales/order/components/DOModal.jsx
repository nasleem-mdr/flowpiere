import React from "react";

/**
 * DOModal — konfirmasi DO (Delivery Order) dari POS.
 * Pola sama dengan ARModal, tapi punya dua aksi:
 *   - Simpan Draft      → hanya membuat Sales Order (Draft)
 *   - Complete + Kirim  → Sales Order Complete + Shipment Complete
 * Tidak ada Payment/Invoice; penagihan lewat batch akhir bulan.
 */
const DOModal = ({
    isOpen,
    onClose,
    totalOrderAmount = 0,
    totalItems = 0,
    bPartnerName,
    onDraft,
    onComplete,
    isSubmitting = false,
}) => {
    if (!isOpen) return null;

    const run = (fn) => async () => {
        try {
            await fn();
        } catch (error) {
            console.error("Gagal memproses DO:", error);
            alert(`Gagal memproses DO: ${error.message || "Terjadi kesalahan pada server"}`);
        }
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.modalBox}>
                <div style={styles.header}>
                    <h3 style={{ margin: 0 }}>Konfirmasi DO (Delivery Order)</h3>
                    <button onClick={onClose} style={styles.closeBtn} disabled={isSubmitting}>✕</button>
                </div>

                <div style={styles.infoBox}>
                    Pilih cara memproses DO ini. <strong>Tidak ada Payment dan Invoice</strong> —
                    penagihan dilakukan lewat proses batch akhir bulan.
                    <ul style={styles.list}>
                        <li><strong>Simpan Draft</strong>: hanya menyimpan Sales Order sebagai Draft, stok belum berkurang.</li>
                        <li><strong>Complete + Kirim</strong>: Sales Order di-Complete lalu Shipment otomatis dibuat &amp; di-Complete (stok berkurang).</li>
                    </ul>
                </div>

                <div style={styles.summaryContainer}>
                    <div style={styles.summaryRow}>
                        <span>Customer:</span>
                        <strong>{bPartnerName || "-"}</strong>
                    </div>
                    <div style={styles.summaryRow}>
                        <span>Jumlah Item:</span>
                        <strong>{totalItems}</strong>
                    </div>
                    <div style={styles.summaryRow}>
                        <span>Total:</span>
                        <strong style={{ color: "#1a237e" }}>
                            Rp {totalOrderAmount.toLocaleString("id-ID")}
                        </strong>
                    </div>
                </div>

                <div style={styles.footer}>
                    <button type="button" onClick={onClose} style={styles.cancelBtn} disabled={isSubmitting}>
                        Batal
                    </button>
                    <button type="button" onClick={run(onDraft)} style={styles.draftBtn} disabled={isSubmitting}>
                        Simpan Draft
                    </button>
                    <button type="button" onClick={run(onComplete)} style={styles.submitBtn} disabled={isSubmitting}>
                        {isSubmitting ? "Memproses..." : "Complete + Kirim"}
                    </button>
                </div>
            </div>
        </div>
    );
};

const styles = {
    overlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 },
    modalBox: { backgroundColor: "#fff", padding: "20px", borderRadius: "8px", width: "480px", maxWidth: "90%", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #ddd", paddingBottom: "10px", marginBottom: "15px" },
    closeBtn: { background: "none", border: "none", fontSize: "18px", cursor: "pointer" },
    infoBox: { backgroundColor: "#e8f0fe", border: "1px solid #c5d0e8", borderRadius: "6px", padding: "10px 12px", fontSize: "13px", color: "#1a237e", marginBottom: "15px", lineHeight: 1.5 },
    list: { margin: "8px 0 0", paddingLeft: "18px" },
    summaryContainer: { backgroundColor: "#f9f9f9", padding: "12px", borderRadius: "6px", marginBottom: "18px", border: "1px solid #eee" },
    summaryRow: { display: "flex", justifyContent: "space-between", marginBottom: "6px" },
    footer: { display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid #ddd", paddingTop: "15px", flexWrap: "wrap" },
    cancelBtn: { backgroundColor: "#ccc", border: "none", padding: "10px 16px", borderRadius: "4px", cursor: "pointer" },
    draftBtn: { backgroundColor: "#fff", color: "#1a237e", border: "1.5px solid #1a237e", padding: "10px 16px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" },
    submitBtn: { backgroundColor: "#1a237e", color: "#fff", border: "none", padding: "10px 16px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" },
};

export default DOModal;
