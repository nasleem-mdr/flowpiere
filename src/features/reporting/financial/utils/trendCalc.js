import { PL_GROUPS, MONTH_SHORT } from "./constants";

// Debit-normal → Dr−Cr, Credit-normal → Cr−Dr
export const signedByNormal = (debit, credit, normal) =>
    normal === "credit" ? credit - debit : debit - credit;

// Digit pertama Value akun → kelompok laba-rugi
export const plGroupOf = (value) => {
    const d = String(value || "").trim()[0];
    return PL_GROUPS.find((g) => g.prefixes.includes(d))?.key || null;
};

export const monthKeyOf = (ts) => {
    const d = new Date(ts);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const monthLabel = (key) => {
    const [y, m] = key.split("-");
    return `${MONTH_SHORT[parseInt(m, 10) - 1]} ${y.slice(2)}`;
};

// Daftar bulan startDate s.d. endDate (inklusif), maks 36 bulan
export const buildMonthRange = (startDate, endDate) => {
    const out = [];
    let d = new Date(`${startDate}T00:00:00Z`);
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const endTs = new Date(`${endDate}T23:59:59Z`).getTime();
    while (d.getTime() <= endTs && out.length < 36) {
        out.push({
            key: monthKeyOf(d.getTime()),
            label: monthLabel(monthKeyOf(d.getTime())),
            startTs: d.getTime(),
            endTs: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).getTime(), // eksklusif
        });
        d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    }
    return out;
};

/**
 * Hitung trend neraca (kumulatif) & laba-rugi (per bulan).
 * @returns {{bs: Array, pl: Array}}
 */
export const computeTrend = (factLines, accountMeta, months) => {
    const lines = factLines.map((l) => {
        const meta = accountMeta.get(l.accountId) || {};
        return { ...l, accountType: meta.accountType, plGroup: plGroupOf(meta.value) };
    });

    const bs = months.map((m) => {
        let aktiva = 0, hutang = 0, modal = 0;
        lines.forEach((l) => {
            if (l.ts >= m.endTs) return;
            if (l.accountType === "A") aktiva += l.debit - l.credit;
            else if (l.accountType === "L") hutang += l.credit - l.debit;
            else if (l.accountType === "O") modal += l.credit - l.debit;
        });
        return { ...m, aktiva, hutang, modal };
    });

    const pl = months.map((m) => {
        const totals = Object.fromEntries(PL_GROUPS.map((g) => [g.key, 0]));
        lines.forEach((l) => {
            if (l.ts < m.startTs || l.ts >= m.endTs || !l.plGroup) return;
            const grp = PL_GROUPS.find((g) => g.key === l.plGroup);
            totals[l.plGroup] += signedByNormal(l.debit, l.credit, grp.normal);
        });
        return { ...m, totals };
    });

    return { bs, pl };
};

export const computeLabaBersih = (pl) =>
    pl.map(
        (m) =>
            m.totals.pendUsaha + m.totals.pendNonOps -
            (m.totals.hpp + m.totals.bebanAdm + m.totals.bebanNonOps)
    );
