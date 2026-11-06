import { useState, useCallback } from "react";
import { idempiereApi } from "@/api/idempiereApi";
// 👉 Sesuaikan path kalau parseIdempiereError ada di tempat lain.
import { parseIdempiereError } from "@/features/master/product/hooks/useProductDetailSubmit";

/**
 * useInvoiceImport
 * ─────────────────────────────────────────────────────────────────────────
 * Hook fitur Import Invoice CSV (C_Invoice + C_InvoiceLine).
 * Input = array invoice hasil groupInvoiceRows() (invoiceCsvParser.js),
 * tiap invoice punya `lines` (1..n).
 *
 *   validateRows(rows)        → cek mandatory, duplikat DocumentNo (server),
 *                               resolve semua FK by Value/Name. Tiap row jadi
 *                               _status = "valid" | "invalid" + _errors +
 *                               _resolved + _resolvedLines + _total.
 *   startImport(rows, opts)   → POST c_invoice, POST c_invoiceline per line,
 *                               opsional doc-action CO (opts.complete).
 *                               Tiap row jadi "success" | "failed".
 *
 * IDEMPOTEN per langkah (sama seperti useProductImport): row menyimpan
 * _invoiceId, _linesDone (Set nomor baris CSV), _completed. Kalau gagal di
 * tengah, retry hanya mengerjakan sisanya — invoice tidak dibuat ulang.
 *
 * Catatan perilaku:
 *   - REST tidak menjalankan callout, jadi IsSOTrx, C_Currency_ID, QtyInvoiced,
 *     PriceActual & LineNetAmt diisi eksplisit di payload.
 *   - UOM line harus sama dengan UOM produk (konversi UOM belum didukung —
 *     QtyInvoiced diisi = QtyEntered).
 *   - Default status Draft. Complete hanya kalau opsi dicentang.
 */

const DOC_BASE_TYPES = ["ARI", "API", "ARC", "APC"];

// AD_Reference PaymentRule (135) — terima kode ATAU nama.
const PAYMENT_RULES = {
    B: "Cash", S: "Check", K: "Credit Card", P: "On Credit",
    T: "Direct Deposit", D: "Direct Debit", M: "Mixed POS Payment",
};

const parseBool = (v) =>
    ["y", "yes", "true", "1", "t"].includes(String(v ?? "").trim().toLowerCase());

const parseNumber = (v) => {
    if (v === "" || v == null) return null;
    let s = String(v).trim().replace(/\s/g, "");
    if (s.includes(",") && s.includes(".")) {
        s = s.replace(/\./g, "").replace(",", ".");      // 1.500.000,50
    } else if (s.includes(",")) {
        const parts = s.split(",");
        s = parts.length > 1 && parts[parts.length - 1].length === 3
            ? s.replace(/,/g, "")                          // 1,500 → 1500
            : s.replace(",", ".");                         // 1500,50 → 1500.50
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
};

// yyyy-mm-dd atau dd/mm/yyyy | dd-mm-yyyy | dd.mm.yyyy (urutan Indonesia).
const toIsoDate = (s) => {
    const t = String(s || "").trim();
    let y, mo, d;
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
        y = +m[1]; mo = +m[2]; d = +m[3];
    } else {
        m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
        if (!m) return null;
        d = +m[1]; mo = +m[2]; y = +m[3];
    }
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

const resolvePaymentRule = (v) => {
    if (!v) return "P"; // default kolom: On Credit
    const s = v.trim();
    if (s.length === 1 && PAYMENT_RULES[s.toUpperCase()]) return s.toUpperCase();
    const hit = Object.entries(PAYMENT_RULES).find(([, n]) => n.toLowerCase() === s.toLowerCase());
    return hit ? hit[0] : null;
};

const odataEscape = (s) => String(s).replace(/'/g, "''");
const addError = (row, msg) => { (row._errors = row._errors || []).push(msg); };
// FK dari REST berbentuk { id, identifier, ... } atau nilai polos.
const refId = (v) => (v && typeof v === "object" ? (v.id ?? null) : (v ?? null));
const ref = (id) => ({ id: parseInt(id, 10) });

// Jalankan fn untuk tiap item dengan maksimal `limit` request paralel.
const mapLimit = async (items, limit, fn) => {
    let i = 0;
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (i < items.length) await fn(items[i++]);
        })
    );
};

function buildInvoicePayload(r) {
    const x = r._resolved;
    return {
        AD_Org_ID: ref(x.orgId),
        C_DocType_ID: ref(x.docTypeId),
        C_DocTypeTarget_ID: ref(x.docTypeId),
        IsSOTrx: x.isSOTrx,
        ...(r.document_no ? { DocumentNo: r.document_no } : {}),
        ...(r.po_reference ? { POReference: r.po_reference } : {}),
        Description: r.description || "",
        DateInvoiced: x.dateInvoiced,
        DateAcct: x.dateAcct,
        C_BPartner_ID: ref(x.bpartnerId),
        C_BPartner_Location_ID: ref(x.locationId),
        ...(x.contactId ? { AD_User_ID: ref(x.contactId) } : {}),
        M_PriceList_ID: ref(x.priceListId),
        C_Currency_ID: ref(x.currencyId),
        ...(x.conversionTypeId ? { C_ConversionType_ID: ref(x.conversionTypeId) } : {}),
        IsOverrideCurrencyRate: x.overrideRate,
        ...(x.overrideRate ? { CurrencyRate: x.currencyRate } : {}),
        ...(x.salesRepId ? { SalesRep_ID: ref(x.salesRepId) } : {}),
        IsDiscountPrinted: parseBool(r.discount_printed),
        PaymentRule: x.paymentRule,
        C_PaymentTerm_ID: ref(x.paymentTermId),
        ...(x.projectId ? { C_Project_ID: ref(x.projectId) } : {}),
        ...(x.activityId ? { C_Activity_ID: ref(x.activityId) } : {}),
        ...(x.orgTrxId ? { AD_OrgTrx_ID: ref(x.orgTrxId) } : {}),
        ...(x.departmentId ? { C_Department_ID: ref(x.departmentId) } : {}),
        ...(x.bankAccountId ? { C_BankAccount_ID: ref(x.bankAccountId) } : {}),
    };
}

function buildLinePayload(invoiceId, l) {
    return {
        AD_Org_ID: ref(l.orgId),
        C_Invoice_ID: ref(invoiceId),
        Line: l.line,
        M_Product_ID: ref(l.productId),
        ...(l.description ? { Description: l.description } : {}),
        QtyEntered: l.qty,
        QtyInvoiced: l.qty,
        C_UOM_ID: ref(l.uomId),
        PriceEntered: l.price,
        PriceActual: l.price,
        PriceList: l.priceList,
        C_Tax_ID: ref(l.taxId),
        LineNetAmt: Number((l.qty * l.price).toFixed(4)),
    };
}

export default function useInvoiceImport() {
    // idle → validating → ready → importing → done
    const [phase, setPhase] = useState("idle");
    const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
    const [summary, setSummary] = useState(null); // { success, failed }

    // ─── VALIDASI ─────────────────────────────────────────────────────────
    const validateRows = useCallback(async (rows) => {
        setPhase("validating");
        setSummary(null);

        // Reset state validasi (idempoten untuk retry). _invoiceId / _linesDone /
        // _completed SENGAJA tidak disentuh.
        rows.forEach((r) => {
            r._errors = [...(r._groupErrors || [])];
            r._resolved = {};
            r._resolvedLines = [];
            r._total = 0;
        });

        // Lookup FK by kolom teks: contains + exact-match client-side (pola yang
        // sama dengan useProductImport), di-cache per (tabel, kolom, nilai).
        const cache = new Map();
        const lookup = async (table, col, value, extra = []) => {
            const k = `${table}|${col}|${value.toLowerCase()}`;
            if (cache.has(k)) return cache.get(k);
            let hit = null;
            try {
                const select = [col, ...extra].join(",");
                const res = await idempiereApi(
                    `/models/${table}?$filter=IsActive eq true and contains(toupper(${col}),toupper('${odataEscape(value)}'))&$select=${select}&$top=50`
                );
                hit = (res.records || []).find(
                    (x) => String(x[col] ?? "").trim().toLowerCase() === value.toLowerCase()
                ) || null;
            } catch (_) { hit = null; }
            cache.set(k, hit);
            return hit;
        };
        // Coba beberapa kolom berurutan (mis. Value lalu Name).
        const lookupAny = async (table, cols, value, extra = []) => {
            for (const c of cols) {
                const hit = await lookup(table, c, value, extra);
                if (hit) return hit;
            }
            return null;
        };
        // Daftar anak per business partner (lokasi / kontak), di-cache per partner.
        const bpChildren = async (table, bpId) => {
            const k = `${table}|bp|${bpId}`;
            if (cache.has(k)) return cache.get(k);
            let list = [];
            try {
                const res = await idempiereApi(
                    `/models/${table}?$filter=C_BPartner_ID eq ${bpId} and IsActive eq true&$select=Name&$top=100`
                );
                list = res.records || [];
            } catch (_) { list = []; }
            cache.set(k, list);
            return list;
        };

        // Prefetch produk (paling banyak jumlahnya) dengan paralel terbatas.
        const productValues = [...new Set(
            rows.flatMap((r) => (r.lines || []).map((l) => l.line_product)).filter(Boolean)
        )];
        await mapLimit(productValues, 5, (v) => lookup("m_product", "Value", v, ["Name", "C_UOM_ID"]));

        // Duplikat DocumentNo ke SERVER. Invoice yang sudah ter-create oleh
        // sesi import ini (_invoiceId) dilewati supaya retry tidak dianggap duplikat.
        const docNos = [...new Set(
            rows.filter((r) => !r._invoiceId).map((r) => r.document_no).filter(Boolean)
        )];
        const existingDocNos = new Set();
        await mapLimit(docNos, 5, async (no) => {
            try {
                const res = await idempiereApi(
                    `/models/c_invoice?$filter=DocumentNo eq '${odataEscape(no)}'&$select=DocumentNo&$top=1`
                );
                if ((res.records || []).length > 0) existingDocNos.add(no.toLowerCase());
            } catch (_) { /* biarkan server yang menolak saat import */ }
        });

        // ── Validasi per invoice ──
        for (const r of rows) {
            const x = r._resolved;

            if (!r._invoiceId && r.document_no && existingDocNos.has(r.document_no.toLowerCase())) {
                addError(r, `DocumentNo "${r.document_no}" sudah ada di iDempiere`);
            }

            // Organisasi
            if (!r.org) addError(r, "Organisasi (AD_Org_ID[Name]) wajib diisi");
            else {
                const o = await lookup("ad_org", "Name", r.org);
                if (!o) addError(r, `Organisasi "${r.org}" tidak ditemukan`);
                else x.orgId = o.id;
            }

            // Document Type Target
            if (!r.doctype) addError(r, "Document Type (C_DocTypeTarget_ID[Name]) wajib diisi");
            else {
                const d = await lookup("c_doctype", "Name", r.doctype, ["DocBaseType", "IsSOTrx"]);
                if (!d) addError(r, `Document Type "${r.doctype}" tidak ditemukan`);
                else if (!DOC_BASE_TYPES.includes(refId(d.DocBaseType))) {
                    addError(r, `Document Type "${r.doctype}" bukan tipe invoice (DocBaseType ${refId(d.DocBaseType)})`);
                } else {
                    x.docTypeId = d.id;
                    x.isSOTrx = d.IsSOTrx === true || d.IsSOTrx === "Y";
                }
            }

            // Tanggal
            if (!r.date_invoiced) addError(r, "DateInvoiced wajib diisi");
            else {
                x.dateInvoiced = toIsoDate(r.date_invoiced);
                if (!x.dateInvoiced) addError(r, `DateInvoiced "${r.date_invoiced}" bukan tanggal valid (pakai yyyy-mm-dd atau dd/mm/yyyy)`);
            }
            if (r.date_acct) {
                x.dateAcct = toIsoDate(r.date_acct);
                if (!x.dateAcct) addError(r, `DateAcct "${r.date_acct}" bukan tanggal valid`);
            } else {
                x.dateAcct = x.dateInvoiced; // default = DateInvoiced
            }

            // Business Partner (Value, fallback Name) + lokasi + kontak
            if (!r.bpartner) addError(r, "Business Partner (C_BPartner_ID[Value]) wajib diisi");
            else {
                const bp = await lookupAny("c_bpartner", ["Value", "Name"], r.bpartner, ["Value", "Name"]);
                if (!bp) addError(r, `Business Partner "${r.bpartner}" tidak ditemukan`);
                else {
                    x.bpartnerId = bp.id;
                    const locs = await bpChildren("c_bpartner_location", bp.id);
                    if (r.bpartner_location) {
                        const loc = locs.find((l) => (l.Name || "").trim().toLowerCase() === r.bpartner_location.toLowerCase());
                        if (!loc) addError(r, `Lokasi "${r.bpartner_location}" tidak ditemukan di partner "${r.bpartner}"`);
                        else x.locationId = loc.id;
                    } else if (locs.length > 0) {
                        x.locationId = locs[0].id; // default: lokasi pertama
                    } else {
                        addError(r, `Partner "${r.bpartner}" belum punya lokasi`);
                    }
                    if (r.contact) {
                        const users = await bpChildren("ad_user", bp.id);
                        const u = users.find((c) => (c.Name || "").trim().toLowerCase() === r.contact.toLowerCase());
                        if (!u) addError(r, `Kontak "${r.contact}" tidak ditemukan di partner "${r.bpartner}"`);
                        else x.contactId = u.id;
                    }
                }
            }

            // Price List → currency
            if (!r.pricelist) addError(r, "Price List (M_PriceList_ID[Name]) wajib diisi");
            else {
                const pl = await lookup("m_pricelist", "Name", r.pricelist, ["C_Currency_ID"]);
                if (!pl) addError(r, `Price List "${r.pricelist}" tidak ditemukan`);
                else {
                    x.priceListId = pl.id;
                    x.currencyId = refId(pl.C_Currency_ID);
                    if (!x.currencyId) addError(r, `Price List "${r.pricelist}" tidak punya currency`);
                }
            }

            // Kurs
            if (r.conversion_type) {
                const ct = await lookupAny("c_conversiontype", ["Value", "Name"], r.conversion_type, ["Value", "Name"]);
                if (!ct) addError(r, `Conversion Type "${r.conversion_type}" tidak ditemukan`);
                else x.conversionTypeId = ct.id;
            }
            x.overrideRate = parseBool(r.override_rate);
            if (x.overrideRate) {
                x.currencyRate = parseNumber(r.currency_rate);
                if (!(x.currencyRate > 0)) addError(r, "IsOverrideCurrencyRate = Y, CurrencyRate harus angka > 0");
            } else if (r.currency_rate && Number.isNaN(parseNumber(r.currency_rate))) {
                addError(r, `CurrencyRate "${r.currency_rate}" bukan angka valid`);
            }

            // Sales Rep
            if (r.sales_rep) {
                const u = await lookup("ad_user", "Name", r.sales_rep);
                if (!u) addError(r, `Sales Rep "${r.sales_rep}" tidak ditemukan`);
                else x.salesRepId = u.id;
            }

            // Payment Rule & Payment Term
            x.paymentRule = resolvePaymentRule(r.payment_rule);
            if (!x.paymentRule) {
                addError(r, `PaymentRule "${r.payment_rule}" tidak dikenal (${Object.values(PAYMENT_RULES).join(", ")})`);
            }
            if (!r.payment_term) addError(r, "Payment Term (C_PaymentTerm_ID[Value]) wajib diisi");
            else {
                const pt = await lookupAny("c_paymentterm", ["Value", "Name"], r.payment_term, ["Value", "Name"]);
                if (!pt) addError(r, `Payment Term "${r.payment_term}" tidak ditemukan`);
                else x.paymentTermId = pt.id;
            }

            // Dimensi opsional
            const optional = [
                ["project", "c_project", ["Value"], "projectId", "Project"],
                ["activity", "c_activity", ["Value"], "activityId", "Activity"],
                ["org_trx", "ad_org", ["Name"], "orgTrxId", "Trx Organization"],
                ["department", "c_department", ["Value"], "departmentId", "Department"],
                ["bank_account", "c_bankaccount", ["Value"], "bankAccountId", "Bank Account"],
            ];
            for (const [field, table, cols, key, label] of optional) {
                if (!r[field]) continue;
                const hit = await lookupAny(table, cols, r[field]);
                if (!hit) addError(r, `${label} "${r[field]}" tidak ditemukan`);
                else x[key] = hit.id;
            }

            r.discount_printed = r.discount_printed || "N";

            // ── Line ──
            if (!r.lines || r.lines.length === 0) addError(r, "Invoice tidak punya line");
            const seenLineNo = new Set();
            for (let i = 0; i < (r.lines || []).length; i++) {
                const l = r.lines[i];
                const tag = `Baris ${l._row}`;
                const out = { _row: l._row, description: l.line_description || "" };
                let ok = true;
                const fail = (msg) => { addError(r, `${tag}: ${msg}`); ok = false; };

                // Nomor line (default 10, 20, 30, ...)
                if (l.line_no) {
                    const n = parseNumber(l.line_no);
                    if (!Number.isInteger(n) || n <= 0) fail(`Line "${l.line_no}" bukan bilangan bulat > 0`);
                    else out.line = n;
                } else out.line = (i + 1) * 10;
                if (out.line != null) {
                    if (seenLineNo.has(out.line)) fail(`nomor Line ${out.line} muncul lebih dari sekali`);
                    seenLineNo.add(out.line);
                }

                // Organisasi line (default = organisasi header)
                if (l.line_org) {
                    const o = await lookup("ad_org", "Name", l.line_org);
                    if (!o) fail(`Organisasi line "${l.line_org}" tidak ditemukan`);
                    else out.orgId = o.id;
                } else out.orgId = x.orgId;

                // Produk + UOM
                let product = null;
                if (!l.line_product) fail("Produk (M_Product_ID[Value]) wajib diisi");
                else {
                    product = await lookup("m_product", "Value", l.line_product, ["Name", "C_UOM_ID"]);
                    if (!product) fail(`Produk "${l.line_product}" tidak ditemukan`);
                    else { out.productId = product.id; out.productLabel = l.line_product; }
                }
                if (product) {
                    const productUom = refId(product.C_UOM_ID);
                    if (l.line_uom) {
                        const u = await lookup("c_uom", "Name", l.line_uom);
                        if (!u) fail(`UOM "${l.line_uom}" tidak ditemukan`);
                        else if (String(u.id) !== String(productUom)) {
                            fail(`UOM "${l.line_uom}" berbeda dari UOM produk "${l.line_product}" (konversi UOM belum didukung)`);
                        } else { out.uomId = u.id; out.uomLabel = l.line_uom; }
                    } else {
                        out.uomId = productUom; // default: UOM produk
                    }
                }

                // Qty & harga
                const qty = parseNumber(l.line_qty);
                if (!l.line_qty) fail("QtyEntered wajib diisi");
                else if (Number.isNaN(qty) || qty === 0) fail(`QtyEntered "${l.line_qty}" harus angka dan bukan 0`);
                else out.qty = qty;

                const price = parseNumber(l.line_price);
                if (!l.line_price) fail("PriceEntered wajib diisi");
                else if (Number.isNaN(price) || price < 0) fail(`PriceEntered "${l.line_price}" bukan angka valid`);
                else out.price = price;

                if (l.line_price_list) {
                    const pl = parseNumber(l.line_price_list);
                    if (Number.isNaN(pl)) fail(`PriceList "${l.line_price_list}" bukan angka valid`);
                    else out.priceList = pl;
                } else out.priceList = out.price ?? 0;

                // Pajak
                if (!l.line_tax) fail("Tax (C_Tax_ID[Name]) wajib diisi");
                else {
                    const t = await lookup("c_tax", "Name", l.line_tax);
                    if (!t) fail(`Tax "${l.line_tax}" tidak ditemukan`);
                    else out.taxId = t.id;
                }

                if (ok) {
                    r._resolvedLines.push(out);
                    r._total += out.qty * out.price;
                }
            }

            r._status = r._errors.length > 0 ? "invalid" : "valid";
        }

        setPhase("ready");
        return rows;
    }, []);

    // ─── IMPORT ───────────────────────────────────────────────────────────
    // opts.complete: true → setelah semua line masuk, jalankan doc-action CO.
    const startImport = useCallback(async (rowsToImport, opts = {}) => {
        setPhase("importing");
        setSummary(null);
        setProgress({ done: 0, total: rowsToImport.length, current: "" });
        const result = { success: 0, failed: 0 };

        for (let i = 0; i < rowsToImport.length; i++) {
            const row = rowsToImport[i];
            row._linesDone = row._linesDone || new Set();

            try {
                // 1) Header — jangan dibuat ulang kalau sudah ada (retry)
                if (!row._invoiceId) {
                    const created = await idempiereApi(`/models/c_invoice`, {
                        method: "POST",
                        body: JSON.stringify(buildInvoicePayload(row)),
                    });
                    const newId = created?.id ?? created?.C_Invoice_ID;
                    if (!newId) throw new Error("Server tidak mengembalikan C_Invoice_ID — cek manual apakah invoice tercreate.");
                    row._invoiceId = newId;
                    row._documentNo = created?.DocumentNo || row.document_no || "";
                }

                // 2) Line — satu POST per line, yang sudah sukses dilewati
                for (const l of row._resolvedLines) {
                    if (row._linesDone.has(l._row)) continue;
                    try {
                        await idempiereApi(`/models/c_invoiceline`, {
                            method: "POST",
                            body: JSON.stringify(buildLinePayload(row._invoiceId, l)),
                        });
                        row._linesDone.add(l._row);
                    } catch (err) {
                        const e = new Error(`Line ${l.line} (${l.productLabel}): ${parseIdempiereError(err)}`);
                        e._withContext = true;
                        throw e;
                    }
                }

                // 3) Complete (opsional)
                if (opts.complete && !row._completed) {
                    let res;
                    try {
                        res = await idempiereApi(`/models/c_invoice/${row._invoiceId}`, {
                            method: "PUT",
                            body: JSON.stringify({ "doc-action": "CO" }),
                        });
                    } catch (err) {
                        const e = new Error(`Complete gagal: ${parseIdempiereError(err)}`);
                        e._withContext = true;
                        throw e;
                    }
                    const st = refId(res?.DocStatus);
                    if (st && st !== "CO") {
                        const e = new Error(`Complete gagal — status dokumen "${res.DocStatus?.identifier || st}"`);
                        e._withContext = true;
                        throw e;
                    }
                    row._completed = true;
                }

                row._status = "success";
                row._error = null;
                result.success++;
            } catch (err) {
                row._status = "failed";
                row._error = err?._withContext ? err.message : parseIdempiereError(err);
                result.failed++;
            }
            setProgress({
                done: i + 1,
                total: rowsToImport.length,
                current: row._documentNo || row.document_no || `baris ${row._row}`,
            });
        }

        setPhase("done");
        setSummary(result);
        return result;
    }, []);

    return { phase, progress, summary, validateRows, startImport };
}
