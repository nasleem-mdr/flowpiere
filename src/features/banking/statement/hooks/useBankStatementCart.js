import { useState, useCallback, useMemo } from 'react';

// Key unik: payment → `payment-${C_Payment_ID}` (mencegah 1 payment double
// masuk saat import berkali-kali); charge → key sudah di-generate di
// ChargeLineForm (`charge-${timestamp}`), tiap kali add selalu baris baru
// (wajar — bisa ada >1 biaya admin dalam 1 statement).
export const lineKey = (item) => item.type === 'payment' ? `payment-${item.C_Payment_ID}` : item.key;

export function useBankStatementCart() {
  const [cart, setCart] = useState([]);

  const addItems = useCallback((items) => {
    setCart(prev => {
      const existingKeys = new Set(prev.map(lineKey));
      const newOnes = items.filter(i => !existingKeys.has(lineKey(i)));
      return [...prev, ...newOnes];
    });
  }, []);

  const addChargeLine = useCallback((item) => setCart(prev => [...prev, item]), []);

  const removeItem = useCallback((key) => setCart(prev => prev.filter(i => lineKey(i) !== key)), []);

  // Hanya charge line yang boleh diedit amount-nya manual di cart (sesuai
  // jawaban #2/#3 Anda — payment/receipt override manual JUGA diizinkan
  // utk kasus partial reconciliation, jadi tidak dibatasi type di sini).
  const updateStmtAmt = useCallback((key, amt) => {
    setCart(prev => prev.map(i => lineKey(i) === key ? { ...i, StmtAmt: amt } : i));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const totalItems = cart.length;
  const totalStmtAmt = useMemo(() => cart.reduce((s, i) => s + (i.StmtAmt || 0), 0), [cart]);

  return { cart, addItems, addChargeLine, removeItem, updateStmtAmt, clearCart, totalItems, totalStmtAmt };
}