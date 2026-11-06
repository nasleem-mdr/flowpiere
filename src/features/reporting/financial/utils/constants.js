export const BS_SERIES = [
    { key: "aktiva", label: "Total Aktiva", color: "#1565c0", normal: "debit" },
    { key: "hutang", label: "Total Hutang", color: "#e65100", normal: "credit" },
    { key: "modal", label: "Total Modal", color: "#2e7d32", normal: "credit" },
];

// Prefix digit akun mengikuti struktur COA — ubah di sini kalau berbeda
export const PL_GROUPS = [
    { key: "pendUsaha", label: "Pendapatan Usaha", color: "#1565c0", prefixes: ["4"], normal: "credit" },
    { key: "hpp", label: "HPP", color: "#c62828", prefixes: ["5"], normal: "debit" },
    { key: "bebanAdm", label: "Beban Adm & Umum", color: "#e65100", prefixes: ["6"], normal: "debit" },
    { key: "pendNonOps", label: "Pendapatan Non Ops", color: "#00838f", prefixes: ["7"], normal: "credit" },
    { key: "bebanNonOps", label: "Beban Non Ops", color: "#8e24aa", prefixes: ["8"], normal: "debit" },
];

export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
