import React, { useState } from "react";
import { generateShipmentPDF } from "@/features/sales/order/utils/generateShipmentPDF";
import { useOrgInfo } from "@/shared/hooks/useOrgInfo";

const SalesOrderSuccessModal = ({
    isOpen,
    onClose,
    orderDocNo,
    shipmentId,
    shipmentDocNo,
}) => {
    const [isPrinting, setIsPrinting] = useState(false);
    const { orgInfo } = useOrgInfo(); 
    if (!isOpen) return null;

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
                    <h3 style={{ margin: 0 }}>✅ Sales Order Berhasil</h3>
                    <button onClick={onClose} style={styles.closeBtn}>✕</button>
                </div>

                <div style={styles.body}>
                    <div style={styles.row}>
                        <span>Sales Order:</span>
                        <strong>{orderDocNo || "-"}</strong>
                    </div>
                    <div style={styles.row}>
                        <span>Shipment:</span>
                        <strong>{shipmentDocNo || "-"}</strong>
                    </div>
                    <p style={styles.note}>
                        Order &amp; Shipment sudah <strong>Complete</strong>. Penagihan (Invoice)
                        akan diproses via sistem <strong>batch akhir bulan</strong> — tidak perlu
                        tindakan lebih lanjut sekarang.
                    </p>
                </div>

                <div style={styles.footer}>
                    <button onClick={onClose} style={styles.cancelBtn} disabled={isPrinting}>
                        Tutup
                    </button>
                    <button
                        onClick={handlePrint}
                        style={styles.printBtn}
                        disabled={isPrinting || !shipmentId}
                    >
                        {isPrinting ? "Menyiapkan PDF..." : "🖨️ Print / Download Shipment"}
                    </button>
                </div>
            </div>
        </div>
    );
};

const styles = {
    overlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 },
    modalBox: { backgroundColor: "#fff", padding: "20px", borderRadius: "8px", width: "440px", maxWidth: "90%", boxShadow: "0 4px 15px rgba(0,0,0,0.2)" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #ddd", paddingBottom: "10px", marginBottom: "15px" },
    closeBtn: { background: "none", border: "none", fontSize: "18px", cursor: "pointer" },
    body: { backgroundColor: "#f9f9f9", padding: "14px", borderRadius: "6px", border: "1px solid #eee", marginBottom: "18px" },
    row: { display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px" },
    note: { fontSize: "12.5px", color: "#555", lineHeight: 1.5, margin: "10px 0 0" },
    footer: { display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid #ddd", paddingTop: "15px" },
    cancelBtn: { backgroundColor: "#ccc", border: "none", padding: "10px 20px", borderRadius: "4px", cursor: "pointer" },
    printBtn: { backgroundColor: "#2563eb", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" },
};

export default SalesOrderSuccessModal;