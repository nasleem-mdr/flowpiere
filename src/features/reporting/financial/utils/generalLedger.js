/** ─────────────────────────────────────────────────────────────────────────────
* generalLedger.js — logika murni Buku Besar (tanpa React, tanpa fetch)
*
* Aturan balance (posisi normal akun):
*   • Debet-normal  : Asset (A), Expense (E), Memo (M)  → balance += Debet − Kredit
*   • Kredit-normal : Liability (L), Equity/Ownership (O), Revenue (R)
*                                                       → balance += Kredit − Debet
* SALDO AWAL memakai rumus yang SAMA dengan akunnya, sehingga balance positif =
* saldo di sisi normal; balance NEGATIF (kurung merah) = berlawanan dengan sisi
* normal (mis. Pendapatan bersaldo debet) — itu yang perlu diperiksa.
*
* Neraca (A, L, O, M): saldo awal = seluruh histori sebelum Date From.
* Laba-rugi (E, R)   : saldo awal = sejak awal tahun fiskal s.d. Date From;
*                      posting tahun fiskal sebelumnya dibuang.
* ─────────────────────────────────────────────────────────────────────────────
*/
// 1 = Januari (tahun kalender), 7 = Juli (FY Juli–Juni), dst.
export const FY_START_MONTH = 1;

export const ACCOUNT_TYPE = {
    A: { label: "Aktiva", group: "NERACA", normal: "Debet" },
    L: { label: "Liabilitas", group: "NERACA", normal: "Kredit" },
    O: { label: "Ekuitas", group: "NERACA", normal: "Kredit" },
    E: { label: "Beban", group: "LABA-RUGI", normal: "Debet" },
    R: { label: "Pendapatan", group: "LABA-RUGI", normal: "Kredit" },
    M: { label: "Memo", group: "NERACA", normal: "Debet" }, // memo → perlakuan neraca
};
// Urutan tampilan: neraca dulu (A, L, O), lalu laba-rugi (R, E)
export const TYPE_SORT_ORDER = { A: 1, L: 2, O: 3, R: 4, E: 5, M: 6 };

const FALLBACK_TYPE_INFO = { label: "Lainnya", group: "NERACA", normal: "Debet" };

export const getTypeInfo = (accountType) => ACCOUNT_TYPE[accountType] || FALLBACK_TYPE_INFO;
export const isCreditNormal = (typeInfo) => typeInfo.normal === "Kredit";

// Mutasi satu baris terhadap balance, sesuai posisi normal akun.
export const balanceDelta = (isCredit, debit, credit) => (isCredit ? credit - debit : debit - credit);

export const getFiscalYearStartTs = (dateStr) => {
    const d = new Date(`${dateStr}T00:00:00Z`);
    const y = d.getUTCFullYear();
    const candidate = new Date(Date.UTC(y, FY_START_MONTH - 1, 1)).getTime();
    return d.getTime() >= candidate
        ? candidate
        : new Date(Date.UTC(y - 1, FY_START_MONTH - 1, 1)).getTime();
};

export const getAccountId = (a) => a.id ?? a.C_ElementValue_ID;

// Key opsi filter untuk posting tanpa Business Partner
export const NO_PARTNER_KEY = "none";
export const partnerKeyOf = (r) => r.bpartnerId ?? NO_PARTNER_KEY;

// ─── Pivot per akun + saldo awal + running balance ──────────────────────────
export const buildLedgerGroups = ({ factLines, accountMetaMap, startDate, endDate }) => {
    const startTs = new Date(`${startDate}T00:00:00Z`).getTime();
    const endTs = new Date(`${endDate}T23:59:59Z`).getTime();
    const fyStartTs = getFiscalYearStartTs(startDate);

    const map = new Map();
    factLines.forEach((r) => {
        if (!map.has(r.accountId)) {
            const meta = accountMetaMap.get(r.accountId) || {};
            const accountType = meta.accountType || "?";
            const typeInfo = getTypeInfo(accountType);
            map.set(r.accountId, {
                accountId: r.accountId,
                accountName: r.accountName,
                accountType,
                typeInfo,
                isPnL: typeInfo.group === "LABA-RUGI",
                isCreditNormal: isCreditNormal(typeInfo),
                openingDebit: 0,
                openingCredit: 0,
                totalDebit: 0,
                totalCredit: 0,
                rows: [],
            });
        }
        const group = map.get(r.accountId);

        // Laba-rugi: posting sebelum awal tahun fiskal dibuang total.
        if (group.isPnL && r.ts < fyStartTs) return;

        if (r.ts < startTs) {
            group.openingDebit += r.debit;
            group.openingCredit += r.credit;
        } else if (r.ts <= endTs) {
            group.totalDebit += r.debit;
            group.totalCredit += r.credit;
            group.rows.push(r);
        }
    });

    const groups = Array.from(map.values()).map((g) => {
        const { openingDebit, openingCredit, ...rest } = g;
        const openingBalance = balanceDelta(g.isCreditNormal, openingDebit, openingCredit);

        let running = openingBalance;
        const rows = g.rows.map((r) => {
            running += balanceDelta(g.isCreditNormal, r.debit, r.credit);
            return { ...r, balance: running };
        });

        return {
            ...rest,
            openingBalance,
            rows,
            closingBalance: running,
            openingRow: {
                key: `${g.accountId}-opening`,
                dateAcct: startDate,
                description: g.isPnL ? "Saldo Awal Tahun Berjalan" : "Saldo Awal",
                balance: openingBalance,
                isOpeningRow: true,
            },
        };
    });

    groups.sort((a, b) => {
        const ta = TYPE_SORT_ORDER[a.accountType] ?? 99;
        const tb = TYPE_SORT_ORDER[b.accountType] ?? 99;
        return ta !== tb ? ta - tb : a.accountName.localeCompare(b.accountName);
    });
    return groups;
};

export const filterGroupsBySearch = (groups, search) => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
        (g) =>
            (g.accountName || "").toLowerCase().includes(q) ||
            g.rows.some(
                (r) =>
                    (r.description || "").toLowerCase().includes(q) ||
                    (r.bpartnerName || "").toLowerCase().includes(q)
            )
    );
};

// closing HANYA dijumlahkan bila semua akun berposisi normal sama. Menjumlah
// saldo Aset (Dr−Cr) dengan Liabilitas (Cr−Dr) tidak bermakna → null ("—").
export const computeGrandTotal = (groups) => {
    const sameNormal = new Set(groups.map((g) => g.isCreditNormal)).size <= 1;
    return groups.reduce(
        (acc, g) => ({
            debit: acc.debit + g.totalDebit,
            credit: acc.credit + g.totalCredit,
            closing: sameNormal ? acc.closing + g.closingBalance : null,
        }),
        { debit: 0, credit: 0, closing: 0 }
    );
};

// ─── Formatter ──────────────────────────────────────────────────────────────
export const fmtNumber = (n) => n.toLocaleString("id-ID");

export const fmtDate = (iso) => {
    if (!iso) return "-";
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
};

// Negatif → dalam kurung = berlawanan dengan posisi normal akun
export const fmtSigned = (n) => (n < 0 ? `(${fmtNumber(Math.abs(n))})` : fmtNumber(n));
// Tipe posting Fact_Acct (AD_Reference "_Posting Type")
export const POSTING_TYPES = [
    { value: "A", label: "Actual" },
    { value: "B", label: "Budget" },
    { value: "E", label: "Commitment" },
    { value: "R", label: "Reservation" },
    { value: "S", label: "Statistical" },
];
export const DEFAULT_POSTING_TYPE = "A";
export const getPostingTypeLabel = (v) =>
    POSTING_TYPES.find((p) => p.value === v)?.label || v;