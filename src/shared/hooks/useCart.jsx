import { useState, useCallback, useMemo } from 'react';

export function useCart(initialItems = []) {
  const [cart, setCart] = useState(initialItems);

  const addToCart = useCallback((product, qty = 1, uom = null) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.M_Product_ID === product.M_Product_ID);
      if (idx >= 0) {
        return prev.map((item, i) => i === idx ? { ...item, Qty: item.Qty + qty } : item);
      }
      return [...prev, {
        ...product,
        Qty: qty,
        selectedUom: uom || { C_UOM_ID: product.C_UOM_ID, Name: product.C_UOM_Name, multiplyRate: 1 },
      }];
    });
  }, []);

  const removeFromCart = useCallback((productId) => {
    setCart(prev => prev.filter(i => i.M_Product_ID !== productId));
  }, []);

  const updateQty = useCallback((productId, newQty) => {
    if (newQty <= 0) {
      setCart(prev => prev.filter(i => i.M_Product_ID !== productId));
      return;
    }
    setCart(prev => prev.map(i => i.M_Product_ID === productId ? { ...i, Qty: newQty } : i));
  }, []);

  const updateUom = useCallback((productId, uom) => {
    setCart(prev => prev.map(i => i.M_Product_ID === productId ? { ...i, selectedUom: uom } : i));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const totalQty   = useMemo(() => cart.reduce((s, i) => s + i.Qty, 0), [cart]);
  const totalItems = useMemo(() => cart.length, [cart]);

  return {
    cart, setCart,
    addToCart, removeFromCart, updateQty, updateUom, clearCart,
    totalQty, totalItems,
  };
}
