// src/features/inventory/report/hooks/useInventoryStockReport.js
// Seluruh query/fetch data + state filter + hasil olahan (pivot) Laporan Inventory.
// UI (pages/InventoryStockReport.jsx) hanya memakai return value hook ini.
//
// ALUR FETCH:
//   1) M_Warehouse aktif → opsi filter + pengelompok pivot.
//   2) M_Locator aktif → map locatorId → warehouseId. (OnHand hanya punya
//      M_Locator_ID, jadi "join" ke gudang dilakukan di JS lewat map ini.)
//   3a) OnHand : M_StorageOnHand (QtyOnHand per produk per locator).
//       Fallback ke model `m_storage` kalau `m_storageonhand` ditolak REST.
//   3b) Reserved: M_StorageReservation (Qty per produk per GUDANG, IsSOTrx=Y).
//       Tabel ini TIDAK punya M_Locator_ID — kolomnya M_Warehouse_ID.
//       Fallback ke `m_storage.QtyReserved` (per locator). Kalau dua-duanya
//       gagal, laporan tetap tampil dengan Reserved = 0 + peringatan.
//   4) Gabung jadi baris { produk, gudang, onHand, reserved, available }.
//   5) Filter gudang & pencarian produk di sisi client.
//   6) Pivot per gudang dihitung dari baris yang sudah difilter (useMemo).
//
// Laporan ini SNAPSHOT stok SAAT INI (bukan per periode tanggal).
import { useState, useEffect, useCallback, useMemo } from "react";
import { idempiereApi } from "@/api/idempiereApi";

const PAGE_SIZE = 500; // ukuran permintaan per halaman
const MAX_PAGES = 100; // pengaman loop (maks 50.000 record per query)

// Ambil SEMUA record dari sebuah query REST dengan paging $top/$skip.
// Berhenti saat halaman kosong atau (kalau server mengirim `row-count`)
// jumlah record terambil sudah mencapai total. Tidak bergantung pada
// "records.length < pageSize" karena server bisa membatasi ukuran halaman.
const fetchAllPages = async (path) => {
    const all = [];
    let skip = 0;
    for (let i = 0; i < MAX_PAGES; i++) {
        const sep = path.includes("?") ? "&" : "?";
        const res = await idempiereApi(`${path}${sep}$top=${PAGE_SIZE}&$skip=${skip}`);
        const recs = Array.isArray(res?.records) ? res.records : [];
        if (recs.length === 0) break;
        all.push(...recs);
        skip += recs.length;
        const total = res["row-count"];
        if (typeof total === "number" && skip >= total) break;
    }
    return all;
};

// Coba beberapa query berurutan; kembalikan hasil pertama yang berhasil.
const fetchWithFallback = async (attempts) => {
    let lastErr = null;
    for (const attempt of attempts) {
        try {
            const records = await fetchAllPages(attempt.path);
            return { records, source: attempt.source };
        } catch (err) {
            console.warn(`Query ${attempt.source} gagal:`, err.message);
            lastErr = err;
        }
    }
    throw lastErr || new Error("Semua percobaan query gagal.");
};

export const getWarehouseId = (w) => w.id ?? w.M_Warehouse_ID;

export default function useInventoryStockReport() {
    // ── Data ────────────────────────────────────────────────────────────
    const [stockRows, setStockRows] = useState([]); // hasil join semua gudang, BELUM difilter
    const [warehouseOptions, setWarehouseOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);     // error fatal
    const [warningMsg, setWarningMsg] = useState(null); // mis. Reserved tidak terbaca

    // ── Filter ──────────────────────────────────────────────────────────
    const [selectedWarehouseIds, setSelectedWarehouseIds] = useState([]); // array of number
    const [productSearchText, setProductSearchText] = useState("");

    // ── FETCH: gudang → locator → OnHand & Reserved ─────────────────────
    const fetchReportData = useCallback(async () => {
        setLoading(true);
        setErrorMsg(null);
        setWarningMsg(null);
        try {
            // Langkah 1: daftar gudang aktif
            const warehouses = await fetchAllPages(
                `/models/m_warehouse?$filter=IsActive eq true&$select=Value,Name&$orderby=Name`
            );
            setWarehouseOptions(warehouses);

            if (warehouses.length === 0) {
                setStockRows([]);
                setWarningMsg("Tidak ada gudang aktif yang dapat diakses oleh role ini.");
                return;
            }

            const warehouseNameMap = new Map();
            warehouses.forEach((w) => {
                const wid = getWarehouseId(w);
                warehouseNameMap.set(wid, w.Name || `#${wid}`);
            });

            // Langkah 2: semua locator → map locatorId -> warehouseId
            const locators = await fetchAllPages(
                `/models/m_locator?$filter=IsActive eq true&$select=M_Warehouse_ID`
            );
            const locatorMap = new Map();
            locators.forEach((loc) => {
                const locId = loc.id ?? loc.M_Locator_ID;
                const whId = loc.M_Warehouse_ID?.id ?? loc.M_Warehouse_ID;
                if (locId != null && whId != null) locatorMap.set(locId, whId);
            });

            // Langkah 3a: QtyOnHand per produk per locator (hanya yang ≠ 0)
            const onHand = await fetchWithFallback([
                {
                source: "m_storageonhand",
                path: `/models/m_storageonhand?$filter=QtyOnHand neq 0&$select=M_Product_ID,M_Locator_ID,QtyOnHand`,
                },
                {
                source: "m_storage",
                path: `/models/m_storage?$filter=QtyOnHand neq 0&$select=M_Product_ID,M_Locator_ID,QtyOnHand`,
                },
            ]);

            // Langkah 3b: Reserved (SO). Kegagalan di sini TIDAK menggagalkan laporan.
            let reservedEntries = []; // [{ rec, whId, qty }]
            try {
                const reserved = await fetchWithFallback([
                    {
                        source: "m_storagereservation",
                        path: `/models/m_storagereservation?$filter=IsSOTrx eq true and Qty neq 0&$select=M_Product_ID,M_Warehouse_ID,Qty`,
                    },
                    {
                        source: "m_storage",
                        path: `/models/m_storage?$filter=QtyReserved neq 0&$select=M_Product_ID,M_Locator_ID,QtyReserved`,
                    },
                ]);
                const isReservationTable = reserved.source === "m_storagereservation";
                reservedEntries = reserved.records.map((rec) => ({
                    rec,
                    whId: isReservationTable
                        ? rec.M_Warehouse_ID?.id ?? rec.M_Warehouse_ID
                        : locatorMap.get(rec.M_Locator_ID?.id ?? rec.M_Locator_ID),
                    qty: parseFloat(isReservationTable ? rec.Qty : rec.QtyReserved) || 0,
                }));
            } catch (err) {
                console.error("Gagal mengambil data Reserved:", err.message);
                setWarningMsg(
                    `Data Reserved tidak dapat dibaca (${err.message}). Kolom Reserved ditampilkan 0, ` +
                    `jadi Available = On Hand. Cek akses role ke tabel M_StorageReservation.`
                );
            }

            // Langkah 4: join jadi baris stok, digabung per (produk × gudang).
            // Satu produk bisa punya beberapa locator di gudang yang sama,
            // jadi dijumlah dulu per kunci `${productId}|${warehouseId}`.
            const cellMap = new Map();
            const ensureCell = (productId, productName, warehouseId) => {
                const key = `${productId}|${warehouseId}`;
                if (!cellMap.has(key)) {
                    cellMap.set(key, {
                        productId,
                        productName,
                        warehouseId,
                        warehouseName: warehouseNameMap.get(warehouseId) || `#${warehouseId}`,
                        onHand: 0,
                        reserved: 0,
                    });
                }
                return cellMap.get(key);
            };
            const productOf = (rec) => ({
                id: rec.M_Product_ID?.id ?? rec.M_Product_ID,
                name: rec.M_Product_ID?.identifier || rec.M_Product_ID?.Name || "-",
            });

            onHand.records.forEach((rec) => {
                const { id, name } = productOf(rec);
                const whId = locatorMap.get(rec.M_Locator_ID?.id ?? rec.M_Locator_ID);
                if (id == null || whId == null) return; // locator di luar gudang aktif
                ensureCell(id, name, whId).onHand += parseFloat(rec.QtyOnHand || 0);
            });

            reservedEntries.forEach(({ rec, whId, qty }) => {
                const { id, name } = productOf(rec);
                if (id == null || whId == null || !warehouseNameMap.has(whId)) return;
                ensureCell(id, name, whId).reserved += qty;
            });

            setStockRows(
                Array.from(cellMap.values()).map((c) => ({ ...c, available: c.onHand - c.reserved }))
            );
        } catch (err) {
            console.error("Gagal mengambil data stok:", err.message);
            setStockRows([]);
            setErrorMsg(err.message || "Gagal mengambil data stok.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReportData();
    }, [fetchReportData]);

    // ── Filter gudang (multi-select) + pencarian produk (client-side) ───
    const filteredRows = useMemo(() => {
        let rows = stockRows;
        if (selectedWarehouseIds.length > 0) {
            rows = rows.filter((r) => selectedWarehouseIds.includes(r.warehouseId));
        }
        if (productSearchText.trim()) {
            const q = productSearchText.trim().toLowerCase();
            rows = rows.filter((r) => (r.productName || "").toLowerCase().includes(q));
        }
        return rows;
    }, [stockRows, selectedWarehouseIds, productSearchText]);

    // ── Pivot per gudang: tiap gudang bawa daftar produk + subtotal ─────
    const groupedByWarehouse = useMemo(() => {
        const map = new Map();
        filteredRows.forEach((r) => {
            if (!map.has(r.warehouseId)) {
                map.set(r.warehouseId, {
                    warehouseId: r.warehouseId,
                    warehouseName: r.warehouseName,
                    totalOnHand: 0,
                    totalReserved: 0,
                    totalAvailable: 0,
                    rows: [],
                });
            }
            const group = map.get(r.warehouseId);
            group.totalOnHand += r.onHand;
            group.totalReserved += r.reserved;
            group.totalAvailable += r.available;
            group.rows.push(r);
        });
        const groups = Array.from(map.values());
        groups.forEach((g) => g.rows.sort((a, b) => a.productName.localeCompare(b.productName)));
        groups.sort((a, b) => a.warehouseName.localeCompare(b.warehouseName));
        return groups;
    }, [filteredRows]);

    const grandTotal = useMemo(
        () =>
            filteredRows.reduce(
                (acc, r) => ({
                    onHand: acc.onHand + r.onHand,
                    reserved: acc.reserved + r.reserved,
                    available: acc.available + r.available,
                }),
                { onHand: 0, reserved: 0, available: 0 }
            ),
        [filteredRows]
    );

    // ── Handler filter ──────────────────────────────────────────────────
    const toggleWarehouse = useCallback((warehouseId) => {
        setSelectedWarehouseIds((prev) =>
            prev.includes(warehouseId) ? prev.filter((id) => id !== warehouseId) : [...prev, warehouseId]
        );
    }, []);
    const clearWarehouseFilter = useCallback(() => setSelectedWarehouseIds([]), []);

    return {
        // data & status
        loading, errorMsg, warningMsg, refresh: fetchReportData,
        // hasil olahan
        groupedByWarehouse, grandTotal,
        // filter
        warehouseOptions, selectedWarehouseIds, toggleWarehouse, clearWarehouseFilter,
        productSearchText, setProductSearchText,
    };
}
