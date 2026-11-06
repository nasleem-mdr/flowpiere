import React from "react";

const ARModal = ({
    isOpen,
    onClose,
    totalOrderAmount = 0,
    bPartnerName,
    onConfirm,
    isSubmitting = false,
}) => {
    if (!isOpen) return null;

    const handleConfirm = async () => {
        try {
            await onConfirm();
        } catch (error) {
            console.error("Gagal memproses Piutang:", error);
            alert(`Gagal memproses Piutang: ${error.message || "Terjadi kesalahan pada server"}`);
        }
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.modalBox}>
                <div style={styles.header}>
                    <h3 style={{ margin: 0 }}>Konfirmasi Penjualan Piutang</h3>
                    <button onClick={onClose} style={styles.closeBtn} disabled={isSubmitting}>✕</button>
                </div>

                <div style={styles.warnBox}>
                    Transaksi ini akan diproses sebagai <strong>Piutang</strong> (belum dibayar).
                    Sistem akan otomatis membuat &amp; menyelesaikan dokumen:
                    <strong> Sales Order → Shipment → Invoice</strong>. Tidak ada Payment yang dibuat —
                    saldo piutang customer akan bertambah.
                </div>

                <div style={styles.summaryContainer}>
                    <div style={styles.summaryRow}>
                        <span>Customer:</span>
                        <strong>{bPartnerName || "-"}</strong>
                    </div>
                    <div style={styles.summaryRow}>
                        <span>Total Piutang:</span>
                        <strong style={{ color: "#c62828" }}>
                            Rp {totalOrderAmount.toLocaleString("id-ID")}
                        </strong>
                    </div>
                </div>

                <div style={styles.footer}>
                    <button type="button" onClick={onClose} style={styles.cancelBtn} disabled={isSubmitting}>
                        Batal
                    </button>
                    <button type="button" onClick={handleConfirm} style={styles.submitBtn} disabled={isSubmitting}>
                        {isSubmitting ? "Memproses Piutang..." : "Proses Piutang"}
                    </button>
                </div>
            </div>
        </div>
    );
};

const styles = {
    overlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 },
    modalBox: { backgroundColor: "#fff", padding: "20px", borderRadius: "8px", width: "460px", maxWidth: "90%", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #ddd", paddingBottom: "10px", marginBottom: "15px" },
    closeBtn: { background: "none", border: "none", fontSize: "18px", cursor: "pointer" },
    warnBox: { backgroundColor: "#fff8e1", border: "1px solid #ffe082", borderRadius: "6px", padding: "10px 12px", fontSize: "13px", color: "#5d4a00", marginBottom: "15px", lineHeight: 1.5 },
    summaryContainer: { backgroundColor: "#f9f9f9", padding: "12px", borderRadius: "6px", marginBottom: "18px", border: "1px solid #eee" },
    summaryRow: { display: "flex", justifyContent: "space-between", marginBottom: "6px" },
    footer: { display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid #ddd", paddingTop: "15px" },
    cancelBtn: { backgroundColor: "#ccc", border: "none", padding: "10px 20px", borderRadius: "4px", cursor: "pointer" },
    submitBtn: { backgroundColor: "#c62828", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" },
};

export default ARModal;