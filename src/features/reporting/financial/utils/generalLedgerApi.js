import { idempiereApi } from "@/api/idempiereApi";

// ─────────────────────────────────────────────────────────────────────────────
// generalLedgerApi.js — akses REST untuk Buku Besar (C_ElementValue, Fact_Acct)
//
// ⚠️ bxservice instance ini membatasi MAKS 100 baris/request berapa pun $top,
// jadi Fact_Acct di-page dengan loop $skip (fetchAllPages). $orderby WAJIB ada
// di queryBase agar urutan antar halaman konsisten.
// ─────────────────────────────────────────────────────────────────────────────
const CHUNK_SIZE = 40;            // jumlah Account_ID per batch query
const PAGE_SIZE = 100;            // batas baris per request yang dihormati server
const MAX_PAGES_PER_QUERY = 500;  // pengaman loop: 500 x 100 = 50.000 baris

const fetchAllPages = async (queryBase) => {
    let skip = 0;
    const all = [];
    for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
        const res = await idempiereApi(`${queryBase}&$top=${PAGE_SIZE}&$skip=${skip}`);
        const records = Array.isArray(res.records) ? res.records : [];
        all.push(...records);
        if (records.length < PAGE_SIZE) break;
        skip += PAGE_SIZE;
    }
    return all;
};

export const fetchAccountOptions = async () => {
    // Kalau akun aktif > 100, bungkus dengan fetchAllPages (+ $orderby sudah ada).
    const res = await idempiereApi(
        `/models/c_elementvalue?$filter=IsActive eq true&$select=Value,Name,AccountType&$orderby=Value&$top=1000`
    );
    return Array.isArray(res.records) ? res.records : [];
};

// Map C_BPartner_ID → nama, di-fetch per chunk (≤ CHUNK_SIZE id, jauh di bawah batas 100 baris).
// Gagal fetch tidak menggagalkan laporan: baris jatuh ke identifier bawaan Fact_Acct.
const fetchBPartnerNameMap = async (ids) => {
    const map = new Map();
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const orClause = chunk.map((id) => `C_BPartner_ID eq ${id}`).join(" or ");
        try {
            const res = await idempiereApi(`/models/c_bpartner?$filter=${orClause}&$select=Value,Name`);
            (Array.isArray(res.records) ? res.records : []).forEach((bp) => {
                map.set(bp.id ?? bp.C_BPartner_ID, bp.Name || bp.Value || "");
            });
        } catch (err) {
            console.error("Gagal mengambil business partner:", err.message);
        }
    }
    return map;
};
export const fetchFactAcctRows = async ({ endDate, accountIds, postingType = "A" }) => {
    const factFilter = `DateAcct le ${endDate}T23:59:59Z and PostingType eq '${postingType}'`;
    const selectFields = `DateAcct,Account_ID,C_BPartner_ID,AmtAcctDr,AmtAcctCr,Description`;

    let records = [];
    if (accountIds.length === 0) {
        records = await fetchAllPages(
            `/models/fact_acct?$filter=${factFilter}&$select=${selectFields}&$orderby=DateAcct`
        );
    } else {
        for (let i = 0; i < accountIds.length; i += CHUNK_SIZE) {
            const chunk = accountIds.slice(i, i + CHUNK_SIZE);
            const orClause = chunk.map((aid) => `Account_ID eq ${aid}`).join(" or ");
            const part = await fetchAllPages(
                `/models/fact_acct?$filter=(${orClause}) and ${factFilter}&$select=${selectFields}&$orderby=DateAcct`
            );
            records.push(...part);
        }
    }

    const bpId = (rec) => rec.C_BPartner_ID?.id ?? rec.C_BPartner_ID ?? null;
    const bpIds = [...new Set(records.map(bpId).filter(Boolean))];
    const bpNames = bpIds.length ? await fetchBPartnerNameMap(bpIds) : new Map();

    return records.map((rec, idx) => {
        const accountId = rec.Account_ID?.id ?? rec.Account_ID ?? null;
        const bpartnerId = bpId(rec);
        return {
            bpartnerId,
            bpartnerName: bpartnerId ? (bpNames.get(bpartnerId) || rec.C_BPartner_ID?.identifier || `#${bpartnerId}`) : "",
            key: `${accountId}-${idx}`,
            dateAcct: rec.DateAcct,
            ts: new Date(rec.DateAcct).getTime(),
            accountId,
            accountName: rec.Account_ID?.identifier || rec.Account_ID?.Name || `#${accountId}`,
            description: rec.Description || "",
            debit: parseFloat(rec.AmtAcctDr || 0),
            credit: parseFloat(rec.AmtAcctCr || 0),
        };
    });
};