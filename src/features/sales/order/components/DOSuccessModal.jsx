import React, { useState } from "react";
import { generateShipmentPDF } from "@/features/sales/order/utils/generateShipmentPDF";
import { useOrgInfo } from "@/shared/hooks/useOrgInfo";

/**
 * DOSuccessModal — hasil DO dari POS.
 *   mode 'draft'    → SO tersimpan sebagai Draft
 *   mode 'complete' → SO Complete + Shipment Complete
 * onClose dipanggil saat user menekan "Selesai" (container mengarahkan ke /pos-order).
 * Mode 'complete' menyediakan Print / Download PDF Shipment (shipmentId wajib diisi).
 */
const DOSuccessModal = ({
    isOpen,
    onClose,
    mode = "complete",
    orderDocNo,
    shipmentId,
    shipmentDocNo,
    bPartnerName,
    totalAmount = 0,
}) => {
    const [isPrinting, setIsPrinting] = useState(false);
    const { orgInfo } = useOrgInfo();
    if (!isOpen) return null;
    const isDraft = mode === "draft";

    const handlePrint = async () => {
        if (!shipmentId) return;
        setIsPrinting(true);
        try {
            await generateShipmentPDF(shipmentId, shipmentDocNo, orgInfo);
        } catch (err) {
            console.error("Gagal membuat PDF Shipment:", err.message);
            alert("Gagal membuat PDF Shipment: " + (err.message || "Terjadi kesalahan."));
        } finally {
            setIsPrinting(false);
        }
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.modalBox}>
                <div style={styles.header}>
                    <h3 style={{ margin: 0 }}>{isDraft ? "Draft Tersimpan" : "DO Berhasil"}</h3>
                </div>

                <div style={styles.okBox}>
                    <span style={styles.check}>{isDraft ? "💾" : "✅"}</span>
                    <div>
                        {isDraft
                            ? <>Sales Order tersimpan sebagai <strong>Draft</strong>. Belum ada pengiriman dan stok belum berkurang.</>
                            : <>Sales Order dan Shipment sudah <strong>Complete</strong>. Penagihan dilakukan lewat batch akhir bulan.</>}
                    </div>
                </div>

                <div style={styles.summaryContainer}>
                    <div style={styles.summaryRow}>
                        <span>Customer:</span>
                        <strong>{bPartnerName || "-"}</strong>
                    </div>
                    <div style={styles.summaryRow}>
                        <span>No. Sales Order:</span>
                        <strong>{orderDocNo || "-"}</strong>
                    </div>
                    {!isDraft && (
                        <div style={styles.summaryRow}>
                            <span>No. Shipment:</span>
                            <strong>{shipmentDocNo || "-"}</strong>
                        </div>
                    )}
                    <div style={styles.summaryRow}>
                        <span>Total:</span>
                        <strong style={{ color: "#1a237e" }}>Rp {totalAmount.toLocaleString("id-ID")}</strong>
                    </div>
                </div>

                <div style={styles.footer}>
                    {!isDraft && (
                        <button
                            type="button"
                            onClick={handlePrint}
                            style={styles.printBtn}
                            disabled={isPrinting || !shipmentId}
                        >
                            {isPrinting ? "Menyiapkan PDF..." : "🖨️ Print / Download Shipment"}
                        </button>
                    )}
                    <button type="button" onClick={onClose} style={styles.submitBtn} disabled={isPrinting}>
                        Selesai
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
    okBox: { display: "flex", gap: "10px", alignItems: "flex-start", backgroundColor: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: "6px", padding: "10px 12px", fontSize: "13px", color: "#1b5e20", marginBottom: "15px", lineHeight: 1.5 },
    check: { fontSize: "20px", lineHeight: 1 },
    summaryContainer: { backgroundColor: "#f9f9f9", padding: "12px", borderRadius: "6px", marginBottom: "18px", border: "1px solid #eee" },
    summaryRow: { display: "flex", justifyContent: "space-between", marginBottom: "6px" },
    footer: { display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid #ddd", paddingTop: "15px" },
    printBtn: { backgroundColor: "#2563eb", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" },
    submitBtn: { backgroundColor: "#1a237e", color: "#fff", border: "none", padding: "10px 24px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" },
};

export default DOSuccessModal;