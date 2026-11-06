/**  ─────────────────────────────────────────────────────────────────────────────
* useInternalUseCart.jsx
* Padanan usePOCart.jsx untuk Internal Use — bedanya di sini tiap baris
* butuh M_Locator_ID (sumber stok, hasil resolve dari useProductStock) dan
* C_Charge_ID (mandatory di M_InventoryLine), BUKAN vendor/harga.
*
* Key baris = M_Product_ID saja (bukan produk+vendor seperti Purchasing) —
* asumsinya 1 produk cuma diambil dari 1 locator dalam 1 dokumen Internal
* Use. Kalau produk yang sama perlu diambil dari 2 locator berbeda dalam 1
* dokumen, itu di luar cakupan v1 ini.
*
* ⚠️ Setiap item SEKARANG juga bawa M_Warehouse_ID + WarehouseName (bukan
* cuma M_Locator_ID/LocatorName). Ini dipakai untuk:
*   1. Dropdown 🏭 di InternalUseCartItem — user bisa ganti gudang sumber
*      stok per item (bukan cuma ikut gudang default sesi login).
*   2. useInternalUseSubmit — mengelompokkan cart per M_Warehouse_ID untuk
*      dipecah jadi beberapa dokumen M_Inventory (1 header cuma boleh 1
*      M_Warehouse_ID).
* ─────────────────────────────────────────────────────────────────────────────
*/

import { 
  useState, 
  useCallback, 
  useMemo, 
} from 'react';

export function useInternalUseCart(initialItems = []) {
  const [cart, setCart] = useState(initialItems);

  const addItem = useCallback((item) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.M_Product_ID === item.M_Product_ID);
      if (idx >= 0) return prev.map((it, i) => i === idx ? { ...it, Qty: it.Qty + item.Qty } : it);
      return [...prev, item];
    });
  }, []);

  // Import banyak baris sekaligus dari InventoryPickerModal (checklist multi-select).
  const addItems = useCallback((items) => {
    setCart(prev => {
      const next = [...prev];
      items.forEach(item => {
        const idx = next.findIndex(i => i.M_Product_ID === item.M_Product_ID);
        if (idx >= 0) next[idx] = { ...next[idx], Qty: next[idx].Qty + item.Qty };
        else next.push(item);
      });
      return next;
    });
  }, []);

  const removeItem = useCallback((productId) => {
    setCart(prev => prev.filter(i => i.M_Product_ID !== productId));
  }, []);

  // Bulk remove — dipakai setelah submit sukses sebagian (partial success),
  // hanya menghapus item yang dokumennya berhasil di-Complete. Item pada
  // grup gudang yang gagal SENGAJA dibiarkan di cart supaya user bisa
  // retry tanpa input ulang dari awal.
  const removeItems = useCallback((productIds) => {
    if (!productIds || productIds.length === 0) return;
    const idSet = new Set(productIds);
    setCart(prev => prev.filter(i => !idSet.has(i.M_Product_ID)));
  }, []);

  const updateQty = useCallback((productId, qty) => {
    if (qty <= 0) { setCart(prev => prev.filter(i => i.M_Product_ID !== productId)); return; }
    setCart(prev => prev.map(i => i.M_Product_ID === productId ? { ...i, Qty: qty } : i));
  }, []);

  const updateCharge = useCallback((productId, charge) => {
    setCart(prev => prev.map(i => i.M_Product_ID === productId
      ? { ...i, C_Charge_ID: charge.C_Charge_ID, ChargeName: charge.Name }
      : i));
  }, []);

  // Ganti UOM entry — Qty TIDAK di-convert ulang otomatis di sini (biar
  // user tidak bingung angkanya berubah sendiri); qty tetap sama, cuma
  // konteks satuannya yang beda. Konversi ke UOM dasar baru dihitung saat
  // submit (lihat useUomConversion.toBaseQty di useInternalUseSubmit.jsx).
  const updateUom = useCallback((productId, uom) => {
    setCart(prev => prev.map(i => i.M_Product_ID === productId
      ? { ...i, selectedUom: uom }
      : i));
  }, []);

  // Toggle indikator loading saat item sedang resolve stok ke gudang baru
  // (dipakai Container selama menunggu resolveProductStock selesai).
  const setItemResolving = useCallback((productId, isResolving) => {
    setCart(prev => prev.map(i => i.M_Product_ID === productId
      ? { ...i, isResolvingWarehouse: isResolving }
      : i));
  }, []);

  // Terapkan hasil resolve stok utk gudang baru ke item terkait: locator,
  // qty on hand, opsi UOM, dan (kalau item belum punya charge) suggestion
  // charge dari gudang tsb. Qty entry (item.Qty) SENGAJA tidak diubah —
  // sama seperti updateUom, biar angka yang user ketik tidak berubah sendiri.
  const updateItemWarehouseStock = useCallback((productId, stockPatch) => {
    setCart(prev => prev.map(i => i.M_Product_ID === productId
      ? { ...i, ...stockPatch, isResolvingWarehouse: false }
      : i));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const totalItems = useMemo(() => cart.length, [cart]);
  const totalQty    = useMemo(() => cart.reduce((s, i) => s + i.Qty, 0), [cart]);
  const missingChargeCount = useMemo(() => cart.filter(i => !i.C_Charge_ID).length, [cart]);

  return {
    cart, setCart, addItem, addItems, removeItem, removeItems,
    updateQty, updateCharge, updateUom, clearCart,
    setItemResolving, updateItemWarehouseStock,
    totalItems, totalQty, missingChargeCount,
  };
}
