import React, { useRef } from "react";

const ReceiptModal = ({ isOpen, onClose, receiptData }) => {
    const printRef = useRef();

    if (!isOpen || !receiptData) return null;

    const { documentNo, date, posName, cashierName, bPartnerName, items, total, payments } = receiptData;

    const handlePrint = () => {
        const printContents = printRef.current.innerHTML;
        const win = window.open("", "_blank", "width=400,height=600");
        win.document.write(`
            <html>
            <head>
                <title>Struk - ${documentNo}</title>
                <style>
                    body { font-family: 'Courier New', monospace; font-size: 12px; width: 300px; margin: 0 auto; padding: 10px; }
                    .center { text-align: center; }
                    .bold { font-weight: bold; }
                    .divider { border-top: 1px dashed #000; margin: 6px 0; }
                    .row { display: flex; justify-content: space-between; margin: 2px 0; }
                    .item-name { max-width: 170px; word-break: break-word; }
                    .total-row { font-weight: bold; font-size: 13px; }
                </style>
            </head>
            <body>
                ${printContents}
                <script>window.onload = () => { window.print(); window.close(); }<\/script>
            </body>
            </html>
        `);
        win.document.close();
        onClose();
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                {/* Preview Struk */}
                <div ref={printRef} style={styles.receipt}>
                    <div style={styles.center}>
                        <div style={styles.storeName}>{posName || "TOKO"}</div>
                        <div style={{ fontSize: "11px", color: "#555" }}>{date}</div>
                        <div style={{ fontSize: "11px" }}>No: <strong>{documentNo}</strong></div>
                    </div>
                    <div style={styles.divider} />

                    <div style={{ fontSize: "11px", marginBottom: "4px" }}>
                        <div>Kasir: {cashierName || "-"}</div>
                        <div>Customer: {bPartnerName || "-"}</div>
                    </div>
                    <div style={styles.divider} />

                    {/* Item Lines */}
                    {items.map((item, i) => (
                        <div key={i} style={{ marginBottom: "6px", fontSize: "12px" }}>
                            <div style={{ fontWeight: "bold" }}>{item.Name}</div>
                            <div style={styles.row}>
                                <span>{item.Qty} {item.selectedUOM?.name || "EA"} × Rp {item.PriceEntered.toLocaleString("id-ID")}</span>
                                <span>Rp {(item.Qty * item.PriceEntered).toLocaleString("id-ID")}</span>
                            </div>
                        </div>
                    ))}
                    <div style={styles.divider} />

                    {/* Total */}
                    <div style={{ ...styles.row, fontWeight: "bold", fontSize: "14px", margin: "4px 0" }}>
                        <span>TOTAL</span>
                        <span>Rp {total.toLocaleString("id-ID")}</span>
                    </div>
                    <div style={styles.divider} />

                    {/* Payment Lines */}
                    {payments.map((p, i) => (
                        <div key={i} style={{ ...styles.row, fontSize: "12px" }}>
                            <span>Bayar ({p.TenderType})</span>
                            <span>Rp {parseFloat(p.PayAmt).toLocaleString("id-ID")}</span>
                        </div>
                    ))}

                    {/* Kembalian */}
                    {(() => {
                        const totalPaid = payments.reduce((s, p) => s + parseFloat(p.PayAmt || 0), 0);
                        const change = totalPaid - total;
                        return change > 0 ? (
                            <div style={{ ...styles.row, fontWeight: "bold", color: "#1a6e2e" }}>
                                <span>Kembalian</span>
                                <span>Rp {change.toLocaleString("id-ID")}</span>
                            </div>
                        ) : null;
                    })()}

                    <div style={styles.divider} />
                    <div style={{ ...styles.center, fontSize: "11px", marginTop: "8px", color: "#555" }}>
                        Terima kasih telah berbelanja!
                    </div>
                </div>

                {/* Action Buttons */}
                <div style={styles.footer}>
                    <button onClick={handlePrint} style={styles.printBtn}>🖨️ Print Struk</button>
                    <button onClick={onClose} style={styles.closeBtn}>Tutup</button>
                </div>
            </div>
        </div>
    );
};

const styles = {
    overlay: { position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1100 },
    modal: { backgroundColor: "#fff", borderRadius: "10px", padding: "20px", width: "360px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" },
    receipt: { fontFamily: "'Courier New', monospace", fontSize: "12px", background: "#fff", padding: "12px", border: "1px dashed #ccc", borderRadius: "6px", marginBottom: "16px" },
    center: { textAlign: "center", marginBottom: "6px" },
    storeName: { fontWeight: "bold", fontSize: "16px", letterSpacing: "1px" },
    divider: { borderTop: "1px dashed #999", margin: "8px 0" },
    row: { display: "flex", justifyContent: "space-between" },
    footer: { display: "flex", gap: "10px", justifyContent: "flex-end" },
    printBtn: { backgroundColor: "#1976d2", color: "#fff", border: "none", padding: "10px 18px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "14px" },
    closeBtn: { backgroundColor: "#e0e0e0", border: "none", padding: "10px 18px", borderRadius: "6px", cursor: "pointer", fontSize: "14px" },
};

export default ReceiptModal;
