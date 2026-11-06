import { idempiereApi } from "@/api/idempiereApi";

/**
 * Ambil SEMUA record dari endpoint iDempiere REST yang dibatasi $top (default 100).
 *
 * Cara kerja:
 *  1. Ambil halaman pertama ($skip=0) → baca "row-count" (total baris sesuai $filter).
 *  2. Sisa halaman diambil paralel per batch (concurrency) memakai $skip.
 *  3. Kalau "row-count" tidak ada di response → fallback sekuensial sampai halaman pendek.
 *
 * ⚠️ Path WAJIB punya $orderby yang UNIK (mis. Fact_Acct_ID). Kalau order tidak unik
 *    (mis. hanya DateAcct) baris bisa dobel/hilang antar halaman.
 * ⚠️ Jangan sertakan $top/$skip di path — ditambahkan otomatis.
 */

export async function fetchAllPages(
    path,
    { pageSize = 100, concurrency = 4, onProgress, isCancelled } = {}
) {
    const sep = path.includes("?") ? "&" : "?";
    const getPage = (skip) => idempiereApi(`${path}${sep}$top=${pageSize}&$skip=${skip}`);
    const recordsOf = (res) => (Array.isArray(res?.records) ? res.records : []);

    const first = await getPage(0);
    const all = [...recordsOf(first)];
    const total = Number(first?.["row-count"]);
    const hasTotal = Number.isFinite(total) && total >= 0;
    onProgress?.(all.length, hasTotal ? total : null);

    if (all.length === 0) return all;

    // Server bisa saja membatasi lebih kecil dari pageSize → pakai ukuran nyata
    const step = Math.min(pageSize, all.length);

    // ── Mode 1: total diketahui → ambil sisa halaman paralel per batch
    if (hasTotal) {
        const skips = [];
        for (let s = step; s < total; s += step) skips.push(s);

        for (let i = 0; i < skips.length; i += concurrency) {
            if (isCancelled?.()) break;
            const results = await Promise.all(skips.slice(i, i + concurrency).map(getPage));
            results.forEach((r) => all.push(...recordsOf(r))); // urutan batch terjaga
            onProgress?.(all.length, total);
        }
        return all;
    }

    // ── Mode 2: fallback sekuensial
    let skip = step;
    let lastLen = all.length;
    while (lastLen >= step) {
        if (isCancelled?.()) break;
        const recs = recordsOf(await getPage(skip));
        all.push(...recs);
        lastLen = recs.length;
        skip += step;
        onProgress?.(all.length, null);
    }
    return all;
}
