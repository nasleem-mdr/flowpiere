/**
 * /src/features/master/product/components/SearchSelectModal.jsx
 * ─────────────────────────────────────────────────────────────────────────
 * Modal pilih-record generik dengan pencarian SERVER-SIDE + "Muat lebih
 * banyak" ($top/$skip). Dibuat untuk menggantikan <select> yang memuat
 * seluruh opsi sekaligus — REST API iDempiere membatasi jumlah record per
 * request (page size default 100), jadi vendor/UOM di urutan belakang tidak
 * pernah muncul di dropdown. Di modal ini setiap ketikan dicari ke server
 * (debounce), sehingga semua record bisa ditemukan.
 *
 * Dipakai untuk: Vendor (c_bpartner), UOM dasar & UOM konversi (c_uom).
 *
 * Props:
 *  - isOpen, title, onClose
 *  - onSelect(record)        dipanggil dengan record mentah dari REST
 *  - model                   nama tabel REST, mis. "c_uom" / "c_bpartner"
 *  - pkColumn                kolom PK, mis. "C_UOM_ID" (untuk excludeIds & key)
 *  - baseFilter              filter OData tetap, mis. "IsVendor eq true and IsActive eq true"
 *  - select                  kolom $select (default "Name")
 *  - orderBy                 default "Name"
 *  - searchFields            kolom yang dicari (contains, case-insensitive), default ["Name"]
 *  - excludeIds              id yang disembunyikan (sudah dipilih / UOM dasar)
 *  - renderSecondary(record) teks kecil di bawah nama (opsional), mis. Search Key
 *  - pageSize                default 50
 *  - selectedId              id yang sedang terpilih (disorot, opsional)
 * ─────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { idempiereApi } from "@/api/idempiereApi";
import "@/css/SearchSelectModal.css";

const recId = (rec, pkColumn) => rec?.id ?? rec?.[pkColumn];
const DEFAULT_SEARCH_FIELDS = ["Name"];

function SearchSelectModal({
    isOpen,
    title = "Pilih Data",
    onClose,
    onSelect,
    model,
    pkColumn,
    baseFilter = "IsActive eq true",
    select = "Name",
    orderBy = "Name",
    searchFields = DEFAULT_SEARCH_FIELDS,
    excludeIds = [],
    renderSecondary,
    pageSize = 50,
    selectedId,
}) {
    const [term, setTerm] = useState("");
    const [records, setRecords] = useState([]);
    const [total, setTotal] = useState(null);
    const [hasMore, setHasMore] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const inputRef = useRef(null);
    const requestSeq = useRef(0); // buang respons lama kalau user sudah mengetik lagi

    // id yang dikecualikan dibuat jadi string stabil supaya tidak memicu
    // re-fetch tiap render (excludeIds biasanya array baru di setiap render).
    // Sama untuk searchFields: array dari parent bisa berubah identitas tiap
    // render (mis. literal ["Name","Value"]) — jadikan string supaya
    // buildQuery/load/effect pencarian tidak ter-trigger ulang terus-menerus.
    const searchKey = (searchFields || DEFAULT_SEARCH_FIELDS).join(",");

    const excludeKey = (excludeIds || [])
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n))
        .join(",");

    const buildQuery = useCallback(
        (searchTerm, skip) => {
            const parts = [baseFilter];
            const t = searchTerm.trim().replace(/'/g, "''");
            if (t) {
                const ors = searchKey
                    .split(",")
                    .map((f) => `contains(toupper(${f}),toupper('${t}'))`)
                    .join(" or ");
                parts.push(`(${ors})`);
            }
            if (excludeKey) {
                excludeKey.split(",").forEach((id) => parts.push(`${pkColumn} neq ${id}`));
            }
            return (
                `/models/${model}?$filter=${parts.join(" and ")}` +
                `&$select=${select}&$orderby=${orderBy}&$top=${pageSize}&$skip=${skip}`
            );
        },
        [baseFilter, searchKey, excludeKey, pkColumn, model, select, orderBy, pageSize]
    );

    const load = useCallback(
        async (searchTerm) => {
            const seq = ++requestSeq.current;
            setIsLoading(true);
            setErrorMsg("");
            try {
                const data = await idempiereApi(buildQuery(searchTerm, 0));
                if (seq !== requestSeq.current) return;
                const batch = data.records || [];
                const rowCount = Number.isFinite(data["row-count"]) ? data["row-count"] : null;
                setRecords(batch);
                setTotal(rowCount);
                setHasMore(
                    batch.length > 0 && (rowCount != null ? batch.length < rowCount : batch.length >= pageSize)
                );
            } catch (err) {
                if (seq !== requestSeq.current) return;
                console.error(`Gagal mengambil data ${model}:`, err);
                setRecords([]);
                setTotal(null);
                setHasMore(false);
                setErrorMsg("Gagal memuat data. Coba lagi.");
            } finally {
                if (seq === requestSeq.current) setIsLoading(false);
            }
        },
        [buildQuery, model, pageSize]
    );

    const loadMore = async () => {
        const seq = requestSeq.current;
        setIsLoadingMore(true);
        try {
            const data = await idempiereApi(buildQuery(term, records.length));
            if (seq !== requestSeq.current) return;
            const batch = data.records || [];
            const merged = [...records, ...batch];
            const rowCount = Number.isFinite(data["row-count"]) ? data["row-count"] : total;
            setRecords(merged);
            setTotal(rowCount);
            setHasMore(batch.length > 0 && (rowCount != null ? merged.length < rowCount : batch.length >= pageSize));
        } catch (err) {
            console.error(`Gagal memuat data ${model} berikutnya:`, err);
            setErrorMsg("Gagal memuat data berikutnya. Coba lagi.");
        } finally {
            setIsLoadingMore(false);
        }
    };

    // Reset & fokus saat modal dibuka.
    useEffect(() => {
        if (!isOpen) return;
        setTerm("");
        setRecords([]);
        setTotal(null);
        setHasMore(false);
        const t = setTimeout(() => inputRef.current?.focus(), 30);
        return () => clearTimeout(t);
    }, [isOpen]);

    // Cari ke server (debounce). Term kosong = halaman pertama tanpa filter pencarian.
    useEffect(() => {
        if (!isOpen) return;
        const timer = setTimeout(() => load(term), term ? 350 : 0);
        return () => clearTimeout(timer);
    }, [term, isOpen, load]);

    // Esc untuk menutup.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => e.key === "Escape" && onClose?.();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handlePick = (rec) => {
        onSelect?.(rec);
        onClose?.();
    };

    return createPortal(
        <div className="ssm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
            <div className="ssm-dialog" role="dialog" aria-modal="true" aria-label={title}>
                <div className="ssm-header">
                    <h3>{title}</h3>
                    <button type="button" className="ssm-close" onClick={onClose} aria-label="Tutup">×</button>
                </div>

                <input
                    ref={inputRef}
                    type="text"
                    className="ssm-search"
                    placeholder="Ketik untuk mencari..."
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && records.length > 0) {
                            e.preventDefault();
                            handlePick(records[0]);
                        }
                    }}
                />

                <div className="ssm-list">
                    {isLoading ? (
                        <p className="ssm-note">Memuat...</p>
                    ) : errorMsg && records.length === 0 ? (
                        <p className="ssm-note ssm-error">{errorMsg}</p>
                    ) : records.length === 0 ? (
                        <p className="ssm-note">{term.trim() ? "Tidak ada hasil yang cocok." : "Tidak ada data."}</p>
                    ) : (
                        <>
                            {records.map((rec, idx) => {
                                const rid = recId(rec, pkColumn);
                                const secondary = renderSecondary?.(rec);
                                return (
                                    <button
                                        type="button"
                                        key={rid ?? `rec-${idx}`}
                                        className={`ssm-item${String(rid) === String(selectedId) ? " ssm-item-selected" : ""}`}
                                        onClick={() => handlePick(rec)}
                                    >
                                        <span className="ssm-item-name">{rec.Name || rid}</span>
                                        {secondary ? <span className="ssm-item-secondary">{secondary}</span> : null}
                                    </button>
                                );
                            })}
                            {hasMore && (
                                <button type="button" className="ssm-more" onClick={loadMore} disabled={isLoadingMore}>
                                    {isLoadingMore ? "Memuat..." : "Muat lebih banyak"}
                                </button>
                            )}
                            {errorMsg && <p className="ssm-note ssm-error">{errorMsg}</p>}
                        </>
                    )}
                </div>

                {!isLoading && records.length > 0 && (
                    <div className="ssm-footer">
                        {total != null ? `Menampilkan ${records.length} dari ${total}` : `${records.length} data dimuat`}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

export default SearchSelectModal;