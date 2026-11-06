// src/features/master/user/components/roleStyles.js
const styles = {
    headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" },
    newBtn: { backgroundColor: "#1565c0", color: "#fff", border: "none", padding: "9px 18px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "13.5px" },
    formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" },
    field: { display: "flex", flexDirection: "column", gap: "4px" },
    label: { fontSize: "12.5px", fontWeight: 600, color: "#555" },
    input: { padding: "9px 11px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13.5px" },
    checkRow: { gridColumn: "1 / -1", display: "flex", gap: "18px", flexWrap: "wrap" },
    checkItem: { display: "flex", alignItems: "center", gap: "7px", fontSize: "13.5px" },
    pickerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "7px", maxHeight: "160px", overflowY: "auto", border: "1px solid #e0e0e0", borderRadius: "8px", padding: "10px", background: "#fafafa" },
    pickerItem: { display: "flex", alignItems: "center", gap: "7px", padding: "6px 10px", borderWidth: "1px", borderStyle: "solid", borderColor: "#ccc", borderRadius: "16px", cursor: "pointer", fontSize: "12.5px", background: "#fff", userSelect: "none" },
    pickerItemActive: { borderColor: "#1565c0", background: "#e3f2fd", fontWeight: 600 },
    saveBtn: { backgroundColor: "#1565c0", color: "#fff", border: "none", padding: "11px 22px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "14px" },
    ghostBtn: { background: "#fff", color: "#555", border: "1px solid #bbb", padding: "10px 18px", borderRadius: "6px", cursor: "pointer" },
    noticeBox: { marginTop: "14px", border: "1px solid", borderRadius: "8px", padding: "12px 14px", fontSize: "13.5px", whiteSpace: "pre-line", display: "flex", justifyContent: "space-between", gap: "12px" },
    noticeClose: { background: "none", border: "none", cursor: "pointer", fontSize: "16px", lineHeight: 1 },
    errorBox: { marginTop: "14px", border: "1px solid #ef9a9a", background: "#ffebee", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", whiteSpace: "pre-line" },
    lvlBadge: { background: "#eceff1", padding: "2px 8px", borderRadius: "8px", fontSize: "11.5px", fontWeight: 600 },
    editBtn: { background: "#fff", color: "#1565c0", border: "1px solid #1565c0", padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
    deactivateBtn: { background: "#fff", color: "#c62828", border: "1px solid #c62828", padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
    activateBtn: { background: "#2e7d32", color: "#fff", border: "none", padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
    deleteBtn: { background: "#fff", color: "#c62828", border: "1px solid #ef9a9a", padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" },
    modal: { 
        background: "#fff", 
        borderRadius: "10px", 
        padding: "20px 24px", 
        maxWidth: "960px", 
        width: "100%", 
        maxHeight: "85vh", // Batasi tinggi maksimal modal
        display: "flex", 
        flexDirection: "column", // Atur layout bertumpuk vertikal
        boxShadow: "0 10px 40px rgba(0,0,0,.3)" 
    },
    modalBody: {
        flex: 1, // Mengambil sisa ruang kosong
        overflowY: "auto", // Area ini saja yang bisa ter-scroll
        paddingRight: "6px", // Opsional: jarak agar scrollbar tidak menempel ke konten
        display: "flex",
        flexDirection: "column",
        gap: "12px"
    },
    modalFooter: {
        display: "flex", 
        gap: "10px", 
        marginTop: "16px", 
        paddingTop: "12px",
        borderTop: "1px solid #e0e0e0", // Pembatas halus antara body dan footer
        justifyContent: "flex-end",
        background: "#fff" // Memastikan background padat di bagian bawah
    },
};

export default styles;
