/** Hooks ini bertindak  sebagai Orkestrator Product Analysis: 
 * satu pemilihan produk memicu paralel load history terhadap 
 * requisition / PO / Sales Order / Invoice / Fact_Acct,
 * lalu agregasi jadi KPI + series grafik.
 */

import { useState, useCallback, useRef } from 'react';
import { idempiereApi } from '@/api/idempiereApi';
import {
  searchProducts,
  fetchLinesWithHeaders,
  toRequisitionRows,
  toOrderRows,
  toInvoiceRows,
  toFactRows,
  computeKpis,
  buildPriceSeries,
  buildMonthlySeries,
} from '../utils/productAnalysisApi';

const EMPTY = { requisitions: [], purchases: [], sales: [], invoices: [], factAcct: [] };

export function useProductAnalysis() {
  const [product, setProduct]   = useState(null);
  const [data, setData]         = useState(EMPTY);
  const [kpis, setKpis]         = useState(null);
  const [priceSeries, setPriceSeries] = useState([]);
  const [monthlySeries, setMonthlySeries] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const reqRef = useRef(0);

  const findProducts = useCallback(async (keyword) => {
    try {
      return await searchProducts(keyword);
    } catch (err) {
      setError(err.message || 'Gagal mencari produk.');
      return [];
    }
  }, []);

  const selectProduct = useCallback(async (p, { purchaseOnly = false } = {}) => {
    if (!p?.id) return;
    const token = ++reqRef.current;
    setProduct(p);
    setLoading(true);
    setError(null);
    setData(EMPTY);
    setKpis(null);
    setPriceSeries([]);
    setMonthlySeries([]);
    try {
      const [reqPairs, orderPairs, invPairs, factRes] = await Promise.all([
        fetchLinesWithHeaders({ lineTable: 'm_requisitionline', headerTable: 'M_Requisition', productId: p.id }),
        fetchLinesWithHeaders({ lineTable: 'c_orderline', headerTable: 'C_Order', productId: p.id }),
        purchaseOnly ? [] : fetchLinesWithHeaders({ lineTable: 'c_invoiceline', headerTable: 'C_Invoice', productId: p.id }),
        purchaseOnly ? null : idempiereApi(`/models/fact_acct?$filter=M_Product_ID eq ${p.id}&$orderby=DateAcct desc&$top=100`),
      ]);
      if (token !== reqRef.current) return; // sudah ada request lebih baru

      const next = {
        requisitions: toRequisitionRows(reqPairs),
        purchases:    toOrderRows(orderPairs, false),
        sales:        purchaseOnly ? [] : toOrderRows(orderPairs, true),
        invoices:     toInvoiceRows(invPairs),
        factAcct:     toFactRows(factRes?.records || []),
      };
      setData(next);
      setKpis(computeKpis(next));
      setPriceSeries(buildPriceSeries(next.purchases, next.sales));
      setMonthlySeries(buildMonthlySeries(next.purchases, next.sales));
    } catch (err) {
      if (token === reqRef.current) setError(err.message || 'Gagal memuat analisis produk.');
    } finally {
      if (token === reqRef.current) setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    reqRef.current++;
    setProduct(null);
    setData(EMPTY);
    setKpis(null);
    setPriceSeries([]);
    setMonthlySeries([]);
    setError(null);
    setLoading(false);
  }, []);

  return { product, data, kpis, priceSeries, monthlySeries, loading, error,
    findProducts, selectProduct, clear };
}
