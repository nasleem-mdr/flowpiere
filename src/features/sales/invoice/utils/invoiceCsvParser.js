/**
 * invoiceCsvParser.js
 * ─────────────────────────────────────────────────────────────────────────
 * Parser CSV untuk fitur Import Invoice (C_Invoice + C_InvoiceLine).
 * Format file = format "Export" iDempiere (lihat Export_C_Invoice.csv):
 *
 *   - Kolom header diawali nama kolom biasa:      DocumentNo, DateInvoiced,
 *     C_BPartner_ID[Value], ...  ([Value]/[Name] = kolom pencarian FK)
 *   - Kolom line diawali "C_InvoiceLine>":        C_InvoiceLine>Line,
 *     C_InvoiceLine>M_Product_ID[Value], ...
 *   - Satu invoice = banyak baris. Baris pertama berisi data header + line
 *     pertama; baris berikutnya cukup mengisi kolom line (kolom header
 *     dikosongkan).
 *
 * Tokenizer CSV (delimiter koma/titik-koma, quoted field, BOM) dipakai
 * ulang dari productCsvParser.js supaya perilakunya konsisten.
 * 👉 Kalau nanti parseCsvText dipindah ke folder shared, cukup ubah
 *    satu baris export di bawah ini.
 */

export { parseCsvText } from "@/features/master/product/utils/productCsvParser";

// ─── Mapping header → kolom internal ──────────────────────────────────────
// Alias pertama = nama kolom persis seperti Export iDempiere. Alias lain
// hanya kemudahan kalau user menulis header sendiri. (Sudah di-normalize:
// lowercase, spasi/strip → underscore.)
const HEADER_ALIASES = {
    // ── Header invoice ──
    org:               ["ad_org_id[name]", "org", "organisasi"],
    document_no:       ["documentno", "document_no", "no_dokumen"],
    po_reference:      ["poreference", "po_reference", "no_po"],
    description:       ["description", "deskripsi"],
    doctype:           ["c_doctypetarget_id[name]", "doctype", "doc_type", "tipe_dokumen"],
    date_invoiced:     ["dateinvoiced", "date_invoiced", "tgl_invoice", "tanggal"],
    date_acct:         ["dateacct", "date_acct", "tgl_akuntansi"],
    bpartner:          ["c_bpartner_id[value]", "bpartner", "partner", "customer", "vendor"],
    bpartner_location: ["c_bpartner_location_id[name]", "location", "lokasi"],
    contact:           ["ad_user_id[name]", "contact", "kontak"],
    pricelist:         ["m_pricelist_id[name]", "price_list"],
    conversion_type:   ["c_conversiontype_id[value]", "conversion_type"],
    override_rate:     ["isoverridecurrencyrate", "override_currency_rate"],
    currency_rate:     ["currencyrate", "currency_rate", "kurs"],
    sales_rep:         ["salesrep_id[name]", "sales_rep", "salesrep"],
    discount_printed:  ["isdiscountprinted", "discount_printed"],
    payment_rule:      ["paymentrule", "payment_rule"],
    payment_term:      ["c_paymentterm_id[value]", "payment_term", "termin"],
    project:           ["c_project_id[value]", "project"],
    activity:          ["c_activity_id[value]", "activity"],
    org_trx:           ["ad_orgtrx_id[name]", "org_trx"],
    department:        ["c_department_id[value]", "department"],
    bank_account:      ["c_bankaccount_id[value]", "bank_account"],
    // ── Line invoice ──
    line_org:          ["c_invoiceline>ad_org_id[name]"],
    line_invoice:      ["c_invoiceline>c_invoice_id[documentno]"],
    line_no:           ["c_invoiceline>line", "line"],
    line_product:      ["c_invoiceline>m_product_id[value]", "product", "produk"],
    line_description:  ["c_invoiceline>description"],
    line_qty:          ["c_invoiceline>qtyentered", "qty", "qtyentered"],
    line_uom:          ["c_invoiceline>c_uom_id[name]", "uom", "satuan"],
    line_price:        ["c_invoiceline>priceentered", "price", "harga"],
    line_price_list:   ["c_invoiceline>pricelist"],
    line_tax:          ["c_invoiceline>c_tax_id[name]", "tax", "pajak"],
};

const normalizeHeader = (h) =>
    h.replace(/^\uFEFF/, "").toLowerCase().trim().replace(/[\s\-]+/g, "_");

// Kolom WAJIB ada di header file (nilai per-baris divalidasi di hook).
export const REQUIRED_COLUMNS = [
    "org", "doctype", "date_invoiced", "bpartner", "pricelist",
    "line_product", "line_qty", "line_price",
];

// Untuk pesan error: nama kolom yang dikenali user (alias pertama).
export const columnLabel = (key) => (HEADER_ALIASES[key] || [key])[0];

export function buildColumnMap(headers) {
    const normalized = headers.map(normalizeHeader);
    const map = {};
    const used = new Set();
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
        const idx = normalized.findIndex((h, i) => !used.has(i) && aliases.includes(h));
        if (idx !== -1) { map[key] = idx; used.add(idx); }
    }
    const missing = REQUIRED_COLUMNS.filter((k) => map[k] === undefined);
    if (missing.length > 0) {
        throw new Error(
            "Kolom wajib tidak ditemukan di CSV: " + missing.map(columnLabel).join(", ") +
            ".\nHeader di file Anda: " + headers.join(" | ")
        );
    }
    return map;
}

// Baris mentah → array objek per baris (_row = nomor baris di file, baris 1 = header).
export function rowsToObjects({ rows }, colMap) {
    const out = [];
    rows.forEach((cells, i) => {
        const obj = { _row: i + 2 };
        let hasAny = false;
        for (const [key, idx] of Object.entries(colMap)) {
            const v = (cells[idx] ?? "").trim();
            obj[key] = v;
            if (v) hasAny = true;
        }
        if (hasAny) out.push(obj);
    });
    return out;
}

// ─── Grouping: banyak baris → satu invoice dengan banyak line ─────────────
const HEADER_FIELDS = [
    "org", "po_reference", "description", "doctype", "date_invoiced", "date_acct",
    "bpartner", "bpartner_location", "contact", "pricelist", "conversion_type",
    "override_rate", "currency_rate", "sales_rep", "discount_printed",
    "payment_rule", "payment_term", "project", "activity", "org_trx",
    "department", "bank_account",
];

const LINE_FIELDS = [
    "line_org", "line_no", "line_product", "line_description",
    "line_qty", "line_uom", "line_price", "line_price_list", "line_tax",
];

/**
 * groupInvoiceRows(objects)
 * Aturan menentukan "baris ini milik invoice yang mana":
 *   1. Ada DocumentNo (atau C_InvoiceLine>C_Invoice_ID[DocumentNo]) →
 *      gabung ke invoice dengan nomor yang sama.
 *   2. Tidak ada nomor, tapi ada data header (partner/doctype/tanggal, dll.)
 *      → mulai invoice BARU (nomor dokumen akan di-generate iDempiere).
 *   3. Tidak ada nomor & tidak ada data header → lanjutan invoice sebelumnya.
 *
 * Hasil per invoice:
 *   { _row, _rows, document_no, ...kolom header,
 *     lines: [{ _row, line_org, line_no, line_product, ... }],
 *     _groupErrors: [...] }
 */
export function groupInvoiceRows(objects) {
    const byKey = new Map();
    const out = [];
    let prev = null;

    objects.forEach((o) => {
        const docNo = o.document_no || o.line_invoice || "";
        const key = docNo.toLowerCase();
        const hasHeaderData = HEADER_FIELDS.some((f) => o[f]);

        let g = null;
        if (key) g = byKey.get(key) || null;
        else if (!hasHeaderData) g = prev;

        if (!g) {
            g = { _row: o._row, _rows: [o._row], document_no: docNo, lines: [], _groupErrors: [] };
            HEADER_FIELDS.forEach((f) => { g[f] = o[f] || ""; });
            out.push(g);
            if (key) byKey.set(key, g);
        } else {
            g._rows.push(o._row);
            HEADER_FIELDS.forEach((f) => {
                if (!o[f]) return;
                if (!g[f]) {
                    g[f] = o[f];
                } else if (g[f] !== o[f]) {
                    g._groupErrors.push(
                        `Baris ${o._row}: kolom ${columnLabel(f)} ("${o[f]}") berbeda dengan baris sebelumnya ("${g[f]}")`
                    );
                }
            });
        }
        prev = g;

        if (LINE_FIELDS.some((f) => o[f])) {
            const l = { _row: o._row };
            LINE_FIELDS.forEach((f) => { l[f] = o[f] || ""; });
            g.lines.push(l);
        }
    });

    return out;
}
