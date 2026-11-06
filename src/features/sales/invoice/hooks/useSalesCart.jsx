import { useState, useCallback, useMemo } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// useSalesCart.jsx
// Padanan usePOCart untuk Sales Invoice — BEDA UTAMA: 1 cart = 1 customer
// (tidak dikelompokkan per vendor seperti di Purchasing), karena satu Sales
// Invoice memang untuk satu Business Partner. Kalau kamu sudah punya cart
// hook sendiri (mis. reuse usePOCart yang di-generalize), file ini tinggal
// dibuang — SalesInvoiceContainer.jsx cuma butuh shape yang sama persis
// dengan yang di-return di bawah.
//
// lineKey — pakai fungsi yang sama dengan modul Purchasing (`lineKey` dari
// '@/shared/hooks') supaya key konsisten across modul; import ulang di sini
// biar file ini standalone.
// ─────────────────────────────────────────────────────────────────────────────
export const lineKey = (item) =>
  item.M_InOutLine_ID != null
    ? `shipline-${item.M_InOutLine_ID}`
    : `${item.M_Product_ID}__${item.C_UOM_ID}`;

export function useSalesCart() {
  const [cart, setCart] = useState([]);
  const [customer, setCustomerState] = useState(null); // { C_BPartner_ID, Name, locationId }

  const addItem = useCallback((item) => {
    setCart(prev => {
      const key = lineKey(item);
      const existing = prev.find(i => lineKey(i) === key);
      if (existing) {
        return prev.map(i => lineKey(i) === key ? { ...i, Qty: i.Qty + item.Qty } : i);
      }
      return [...prev, item];
    });
  }, []);

  //const addItems = useCallback((items) => setCart(items), []);
  const addItems = useCallback((items) => {
    setCart(prev => {
      const next = [...prev];
      items.forEach(item => {
        const key = lineKey(item);
        const idx = next.findIndex(i => lineKey(i) === key);
        if (idx >= 0) next[idx] = { ...next[idx], ...item };
        else next.push(item);
      });
      return next;
    });
  }, []);

  const removeItem = useCallback((itemKey) => {
    setCart(prev => prev.filter(i => lineKey(i) !== itemKey));
  }, []);

  const updateQty = useCallback((itemKey, qty) => {
    setCart(prev => prev.map(i => lineKey(i) === itemKey ? { ...i, Qty: qty } : i));
  }, []);

  const updatePrice = useCallback((itemKey, price) => {
    setCart(prev => prev.map(i => lineKey(i) === itemKey ? { ...i, Price: price } : i));
  }, []);

  const updateUom = useCallback((itemKey, uomPatch) => {
    setCart(prev => prev.map(i => lineKey(i) === itemKey ? { ...i, ...uomPatch } : i));
  }, []);
  
  const updateDescription = (itemKey, value) => {
    setCart(prev => prev.map(it =>
      lineKey(it) === itemKey ? { ...it, Description: value } : it
    ));
  };
  
  const updateDateService = (itemKey, value) => {
    setCart(prev => prev.map(it =>
      lineKey(it) === itemKey ? { ...it, DateService: value } : it
    ));
  };

  const clearCart = useCallback(() => {
    setCart([]);
    setCustomerState(null);
  }, []);

  const setCustomer = useCallback((c) => setCustomerState(c), []);

  const totalItems  = useMemo(() => cart.reduce((s, i) => s + i.Qty, 0), [cart]);
  const totalAmount = useMemo(() => cart.reduce((s, i) => s + (i.Qty * (i.Price || 0)), 0), [cart]);

  return {
    cart, addItem, addItems, removeItem, updateQty, updatePrice, updateUom, clearCart,
    customer, setCustomer, updateDescription, updateDateService,
    totalItems, totalAmount,
  };
}
