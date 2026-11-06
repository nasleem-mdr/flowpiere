// src/features/master/user/components/userManagement.styles.js
const styles = {
    formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" },
    field: { display: "flex", flexDirection: "column", gap: "4px" },
    label: { fontSize: "12.5px", fontWeight: 600, color: "#555" },
    input: { padding: "9px 11px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13.5px" },
    roleGrid: { display: "flex", flexWrap: "wrap", gap: "8px" },
    roleItem: {
        display: "flex", alignItems: "center", gap: "7px", padding: "7px 12px",
        border: "1px solid #ccc", borderRadius: "20px", cursor: "pointer", fontSize: "13px",
        background: "#fff", userSelect: "none",
    },
    roleItemActive: { borderColor: "#1565c0", background: "#e3f2fd", fontWeight: 600 },
    saveBtn: { backgroundColor: "#1565c0", color: "#fff", border: "none", padding: "11px 22px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "14px" },
    resultBox: { marginTop: "14px", border: "1px solid", borderRadius: "8px", padding: "12px 14px", fontSize: "13.5px" },
    roleBadge: {
        display: "inline-block", background: "#e3f2fd", color: "#0d47a1",
        padding: "2px 9px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, margin: "2px 4px 2px 0",
    },
    deactivateBtn: { background: "#fff", color: "#c62828", border: "1px solid #c62828", padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
    activateBtn: { background: "#2e7d32", color: "#fff", border: "none", padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" },
};

export default styles;
