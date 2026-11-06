export const fmtNum = (n) => (n == null ? "-" : n.toLocaleString("id-ID"));

// Laba bersih (bisa negatif = rugi): kurung
export const fmtSigned = (n) =>
    n < 0 ? `(${Math.abs(n).toLocaleString("id-ID")})` : n.toLocaleString("id-ID");

export const fmtCompact = (n) => {
    const abs = Math.abs(n);
    const s =
        abs >= 1e9 ? `${(abs / 1e9).toFixed(1)}M`
        : abs >= 1e6 ? `${(abs / 1e6).toFixed(1)}jt`
        : abs >= 1e3 ? `${(abs / 1e3).toFixed(0)}rb`
        : abs.toFixed(0);
    return n < 0 ? `(${s})` : s;
};
