/**  ─────────────────────────────────────────────────────────────────────────────
* useInvoiceCart.jsx
* Key unik per baris = C_OrderLine_ID (bukan M_Product_ID+UOM seperti di cart
* PO/Requisition), karena 1 produk yg sama bisa muncul di >1 PO berbeda dan
* keduanya harus tetap jadi baris terpisah (masing² tertaut ke PO line asal
* masing-masing — wajib utk 3-way matching).
*
* TIDAK ADA updateUom/updateVendor di sini (beda dgn usePOCart) — UOM dan
* vendor SUDAH FIX dari PO asal, tidak bisa diganti user di layar Invoice.
* ─────────────────────────────────────────────────────────────────────────────
*/
import { 
  useState, 
  useCallback, 
  useMemo, 
} from 'react';

export const lineKey = (item) => String(item.C_OrderLine_ID);

export function useInvoiceCart() {
  const [cart, setCart] = useState([]);

  const addItem = useCallback((item) => {
    setCart(prev => prev.some(i => lineKey(i) === lineKey(item)) ? prev : [...prev, item]);
  }, []);

  const addItems = useCallback((items) => {
    setCart(prev => {
      const existingKeys = new Set(prev.map(lineKey));
      return [...prev, ...items.filter(i => !existingKeys.has(lineKey(i)))];
    });
  }, []);

  const removeItem = useCallback((key) => {
    setCart(prev => prev.filter(i => lineKey(i) !== key));
  }, []);

  const updateQty = useCallback((key, qty) => {
    setCart(prev => prev.map(i =>
      lineKey(i) === key ? { ...i, Qty: qty, QtyEntered: qty, QtyOrdered: qty } : i
    ));
  }, []);

  const updatePrice = useCallback((key, price) => {
    setCart(prev => prev.map(i => lineKey(i) === key ? { ...i, Price: price } : i));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const totalItems  = cart.length;
  const totalAmount = useMemo(() => cart.reduce((s, i) => s + (i.Qty || 0) * (i.Price || 0), 0), [cart]);
  const vendorGroups = useMemo(() => {
    const map = new Map();
    cart.forEach(item => {
      const key = item.C_BPartner_ID;
      if (!map.has(key)) {
        map.set(key, {
          C_BPartner_ID: item.C_BPartner_ID,
          VendorName: item.VendorName,
          C_BPartner_Location_ID: item.C_BPartner_Location_ID,
          items: [],
        });
      }
      map.get(key).items.push(item);
    });
    return Array.from(map.values());
  }, [cart]);

  return { cart, addItem, addItems, removeItem, updateQty, updatePrice, clearCart, totalItems, totalAmount, vendorGroups };
}