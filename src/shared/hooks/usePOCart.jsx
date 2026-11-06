import { useState, useCallback, useMemo } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// usePOCart.jsx
// Cart generic (useCart.jsx) tidak cukup untuk Purchasing karena tiap baris
// di sini butuh 2 atribut tambahan yang tidak ada di modul lain: Price
// (harga beli) dan C_BPartner_ID (vendor). Selain itu, satu produk yang sama
// bisa muncul sebagai 2 baris terpisah kalau dipesan dari 2 vendor berbeda —
// karena itu key baris di sini adalah kombinasi produk+vendor, bukan cuma
// produk seperti di useCart.jsx.
//
// ── FIX: UOM ikut jadi bagian lineKey ───────────────────────────────────────
// Sebelumnya key cuma produk+vendor — kalau produk yang sama ditambahkan dua
// kali dengan UOM BERBEDA (mis. "5 Dus" lalu "3 pcs"), baris digabung jadi
// Qty: 5+3=8 tanpa peduli unitnya beda (bug: 8 apa? Dus? pcs?). C_UOM_ID
// sekarang ikut jadi bagian key, jadi UOM berbeda = baris terpisah — sesuai
// realita 1 C_OrderLine cuma boleh 1 UOM. Kalau UOM-nya SAMA, tetap
// digabung/di-merge seperti biasa (Qty dijumlahkan, aman karena unitnya sama).
//
// vendorGroups (dihitung via useMemo) adalah representasi "PO yang akan
// terbentuk saat submit" — satu grup = satu C_Order yang akan dibuat.
// ─────────────────────────────────────────────────────────────────────────────
export const lineKey = (item) => `${item.M_Product_ID}_${item.C_BPartner_ID || 'none'}_${item.C_UOM_ID || 'nouom'}`;

export function usePOCart(initialItems = []) {
  const [cart, setCart] = useState(initialItems);

  const addItem = useCallback((item) => {
    setCart(prev => {
      const key = lineKey(item);
      const idx = prev.findIndex(i => lineKey(i) === key);
      if (idx >= 0) return prev.map((it, i) => i === idx ? { ...it, Qty: it.Qty + item.Qty } : it);
      return [...prev, item];
    });
  }, []);

  // Import banyak baris sekaligus (dari FPB) — tetap merge kalau ada
  // kombinasi produk+vendor+UOM yang sudah ada di cart sebelumnya.
  const addItems = useCallback((items) => {
    setCart(prev => {
      const next = [...prev];
      items.forEach(item => {
        const key = lineKey(item);
        const idx = next.findIndex(i => lineKey(i) === key);
        if (idx >= 0) next[idx] = { ...next[idx], Qty: next[idx].Qty + item.Qty };
        else next.push(item);
      });
      return next;
    });
  }, []);

  const removeItem = useCallback((key) => {
    setCart(prev => prev.filter(i => lineKey(i) !== key));
  }, []);

  const updateQty = useCallback((key, qty) => {
    if (qty <= 0) { setCart(prev => prev.filter(i => lineKey(i) !== key)); return; }
    setCart(prev => prev.map(i => lineKey(i) === key ? { ...i, Qty: qty } : i));
  }, []);

  const updatePrice = useCallback((key, price) => {
    setCart(prev => prev.map(i => lineKey(i) === key ? { ...i, Price: Math.max(price, 0) } : i));
  }, []);

  // Ganti vendor sebuah baris. Karena vendor adalah bagian dari lineKey,
  // baris lama dihapus & digantikan baris baru — kalau ternyata sudah ada
  // baris lain dengan kombinasi produk+vendor+UOM baru yang sama, keduanya
  // digabung (qty dijumlahkan) supaya tidak ada baris duplikat di cart.
  const updateVendor = useCallback((key, vendor) => {
    setCart(prev => {
      const target = prev.find(i => lineKey(i) === key);
      if (!target) return prev;
      const updated = {
        ...target,
        C_BPartner_ID: vendor.C_BPartner_ID,
        VendorName:    vendor.Name,
        C_BPartner_Location_ID: vendor.locationId ?? null,
      };
      const without = prev.filter(i => lineKey(i) !== key);
      const newKey  = lineKey(updated);
      const dupIdx  = without.findIndex(i => lineKey(i) === newKey);
      if (dupIdx >= 0) {
        return without.map((it, i) => i === dupIdx ? { ...it, Qty: it.Qty + updated.Qty } : it);
      }
      return [...without, updated];
    });
  }, []);
  // Ganti UOM sebuah baris. UOM adalah bagian dari lineKey, jadi mekanismenya
  // sama seperti updateVendor: hapus baris lama, buat baris baru dengan key
  // baru, merge kalau ternyata sudah ada baris produk+vendor+UOM yang sama.
  //
  // Qty & Price ikut dikonversi mengikuti rasio UnitsPerBaseUom lama vs baru,
  // supaya (a) Qty tetap merepresentasikan jumlah barang riil yang sama, dan
  // (b) total nilai baris (Qty × Price) tidak berubah hanya gara-gara ganti
  // UOM. Asumsi: tiap objek di item.uomOptions punya field UnitsPerBaseUom
  // (rasio ke base UOM) — sesuaikan nama field ini kalau berbeda di data-mu.
  const updateUom = useCallback((key, patch) => {
    setCart(prev => {
      const target = prev.find(i => lineKey(i) === key);
      if (!target) return prev;
  
      const updated = {
        ...target,
        C_UOM_ID: patch.C_UOM_ID,
        UomName: patch.Name,
        C_UOM_Name: patch.Name,
        selectedUom: patch,
        UnitsPerBaseUom: patch.UnitsPerBaseUom ?? target.UnitsPerBaseUom,
        Price: patch.Price ?? target.Price,
        // Qty TIDAK diubah
      };
  
      const without = prev.filter(i => lineKey(i) !== key);
      const newKey  = lineKey(updated);
      const dupIdx  = without.findIndex(i => lineKey(i) === newKey);
      if (dupIdx >= 0) {
        return without.map((it, i) => i === dupIdx ? { ...it, Qty: it.Qty + updated.Qty } : it);
      }
      return [...without, updated];
    });
  }, []);
  
  const clearCart = useCallback(() => setCart([]), []);

  const totalItems  = useMemo(() => cart.length, [cart]);
  const totalAmount = useMemo(() => cart.reduce((s, i) => s + i.Qty * (i.Price || 0), 0), [cart]);

  // Preview pengelompokan per vendor — persis representasi PO yang akan
  // tercipta saat submit (lihat usePurchaseOrderSubmit.jsx).
  const vendorGroups = useMemo(() => {
    const map = new Map();
    cart.forEach(item => {
      const k = item.C_BPartner_ID || 'unassigned';
      if (!map.has(k)) {
        map.set(k, {
          C_BPartner_ID: item.C_BPartner_ID,
          VendorName: item.VendorName || '⚠ Vendor belum ditentukan',
          items: [], subtotal: 0,
        });
      }
      const g = map.get(k);
      g.items.push(item);
      g.subtotal += item.Qty * (item.Price || 0);
    });
    return Array.from(map.values());
  }, [cart]);

  return {
    cart, setCart, addItem, addItems, removeItem,
    updateQty, updatePrice, updateVendor, updateUom, clearCart,
    totalItems, totalAmount, vendorGroups,
  };
}
