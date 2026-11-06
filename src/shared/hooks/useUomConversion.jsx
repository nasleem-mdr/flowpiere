import { useCallback } from 'react';
import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';

// ─────────────────────────────────────────────────────────────────────────────
export function useUomConversion() {
  
  const fetchUomOptions = useCallback(async (productId, baseUomId, baseUomName) => {
    const base = { C_UOM_ID: baseUomId, Name: baseUomName || 'EA', multiplyRate: 1 };
    if (!productId || !baseUomId) return [base];
    
    try {
      const res = await idempiereApi(
        `/models/c_uom_conversion?$filter=M_Product_ID eq ${productId} and C_UOM_ID eq ${baseUomId} and IsActive eq true` +
        `&$select=C_UOM_To_ID,MultiplyRate`
      );
      
      const records = Array.isArray(res.records) ? res.records : [];
      
      const extra = records
        .map(r => {
          return {
            C_UOM_ID: fkId(r.C_UOM_To_ID),
            Name: fkLabel(r.C_UOM_To_ID),
            multiplyRate: parseFloat(r.MultiplyRate || 0), // Nilainya 0.166666666667
          };
        })
        .filter(u => u.C_UOM_ID && u.C_UOM_ID !== baseUomId && u.multiplyRate);
        
      return [base, ...extra];
    } catch (err) {
      console.error(`[useUomConversion] gagal fetch konversi UOM produk #${productId}:`, err);
      return [base];
    }
  }, []);

  // ─── RUMUS SAKTI DIBALIK ───
  const toBaseQty = useCallback((qtyEntered, selectedUom) => {
    const entered = parseFloat(qtyEntered || 0);
    const rate = selectedUom?.multiplyRate ?? 1;

    let finalQty = entered;

    if (rate > 0) {
      // Jika rate kurang dari 1 (seperti 0.166666666667), kita bagi nilainya supaya membesar
      // Input 6 / 0.166666666667 = 36
      // Input 1 / 0.166666666667 = 6
      if (rate < 1) {
        finalQty = entered / rate;
      } else {
        // Fallback jika suatu saat ada data konversi yang tipenya angka bulat (> 1)
        finalQty = entered * rate;
      }
    }

    // Gunakan Math.round untuk membersihkan angka gaib JavaScript (misal 35.9999999998 jadi 36)
    return Math.round(finalQty);
  }, []);

  return { fetchUomOptions, toBaseQty };
}