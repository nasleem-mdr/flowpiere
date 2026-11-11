import { useState, useCallback, useRef } from 'react';
import { idempiereApi } from '@/api/idempiereApi';

const getDefaultStartDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
};

const getDefaultEndDate = () => {
  return new Date().toISOString().split('T')[0];
};

export const useRequisitionsForInternalUse = () => {
  const [requisitions, setRequisitions] = useState([]);
  const [loadingList, setLoadingList]   = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const fetchingRef = useRef(false);

  const extractId = (val) => {
    if (!val) return null;
    if (typeof val === 'object') {
      return val.id || val.propertyLabel || null;
    }
    return val;
  };

  const extractLabel = (val, fallback = '') => {
    if (!val) return fallback;
    if (typeof val === 'object') {
      return val.identifier || val.propertyLabel || fallback;
    }
    return String(val);
  };

  const fetchApprovedRequisitions = useCallback(async ({ search = '', userId = '', startDate = getDefaultStartDate(), endDate = getDefaultEndDate() } = {}) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoadingList(true);

    try {
      let query = `/models/m_requisition?$filter=DocStatus eq 'CO'`;

      if (search) {
        query += ` and contains(DocumentNo, '${search}')`;
      }
      if (userId) {
        query += ` and CreatedBy eq ${userId}`;
      }
      if (startDate && endDate) {
        query += ` and DateDoc ge '${startDate}' and DateDoc le '${endDate}'`;
      }

      query += `&$orderby=DateDoc desc&$select=M_Requisition_ID,DocumentNo,DateDoc,DocStatus,Description,CreatedBy`;

      const res = await idempiereApi(query);
      setRequisitions(res.records || []);
    } catch (err) {
      console.error('Gagal memuat daftar Requisition:', err);
      setRequisitions([]);
    } finally {
      setLoadingList(false);
      fetchingRef.current = false;
    }
  }, []);

  // Terima resolveProductStock sebagai argumen kedua agar datanya setara dengan pengambilan manual
  const fetchRequisitionLines = useCallback(async (requisitionId, warehouseId, resolveProductStock) => {
    setLoadingLines(true);
    try {
      const res = await idempiereApi(
        `/models/m_requisitionline?$filter=M_Requisition_ID eq ${requisitionId}` +
        `&$select=M_RequisitionLine_ID,M_Requisition_ID,M_Product_ID,Qty,C_UOM_ID,PriceActual,C_Charge_ID`
      );

      const lines = res.records || [];
      
      const enrichedLines = await Promise.all(
        lines.map(async (line) => {
          const productId = extractId(line.M_Product_ID);
          const rawProductLabel = extractLabel(line.M_Product_ID, `Product #${productId}`);
          
          let productName = rawProductLabel;
          let lineUomId = extractId(line.C_UOM_ID);
          let uomName = 'Pcs';
          
          let chargeId = extractId(line.C_Charge_ID);
          let chargeName = extractLabel(line.C_Charge_ID, '');

          let locatorId = null;
          let locatorName = '';
          let qtyOnHand = 0;
          let uomOptions = [];
          let selectedUom = null;

          try {
            if (productId) {
              const prodRes = await idempiereApi(`/models/m_product/${productId}?$select=Name,C_UOM_ID,C_Charge_ID`);
              productName = prodRes.Name || productName;
              
              if (!lineUomId && prodRes.C_UOM_ID) {
                lineUomId = extractId(prodRes.C_UOM_ID);
              }

              if (!chargeId && prodRes.C_Charge_ID) {
                chargeId = extractId(prodRes.C_Charge_ID);
                chargeName = extractLabel(prodRes.C_Charge_ID, '');
              }
            }

            // 1. Coba resolve via resolveProductStock standar
            if (productId && warehouseId && typeof resolveProductStock === 'function') {
              const stock = await resolveProductStock(productId, warehouseId);
              if (stock) {
                locatorId = stock.M_Locator_ID;
                locatorName = stock.LocatorName;
                qtyOnHand = stock.QtyOnHand ?? 0;
                uomOptions = stock.uomOptions || [];
                
                selectedUom = uomOptions.find(u => u.C_UOM_ID === lineUomId) || uomOptions[0];
                if (selectedUom) {
                  uomName = selectedUom.Name;
                }
              }
            }

            // 2. FALLBACK: Jika locatorId masih kosong/null, cari locator default di gudang tersebut agar tidak "ilang"
            if (!locatorId && warehouseId) {
              try {
                const locDefaultRes = await idempiereApi(
                  `/models/m_locator?$filter=M_Warehouse_ID eq ${warehouseId}&$orderby=IsDefault desc&$select=M_Locator_ID,Value`
                );
                if (locDefaultRes.records && locDefaultRes.records.length > 0) {
                  locatorId = locDefaultRes.records[0].M_Locator_ID;
                  locatorName = locDefaultRes.records[0].Value || `Locator #${locatorId}`;
                }
              } catch (locErr) {
                console.warn('Gagal mengambil fallback locator:', locErr);
              }
            }

            if (lineUomId && (!uomOptions || uomOptions.length === 0)) {
              const uomRes = await idempiereApi(`/models/c_uom/${lineUomId}?$select=Name`);
              uomName = uomRes.Name || uomName;
              selectedUom = { C_UOM_ID: lineUomId, Name: uomName };
              uomOptions = [selectedUom];
            }

            if (chargeId && !chargeName) {
              const chargeRes = await idempiereApi(`/models/c_charge/${chargeId}?$select=Name`);
              chargeName = chargeRes.Name || '';
            }
          } catch (e) {
            console.error('Gagal memuat detail stok/produk line:', e);
          }
          
          return {
            ...line,
            M_Product_ID: productId,
            ProductName: productName,
            UomName: uomName,
            QtyEntered: line.Qty,
            QtyOnHand: qtyOnHand,       // ← Stok On Hand sekarang ikut terisi
            C_Charge_ID: chargeId || null,
            ChargeName: chargeName || null,
            M_Locator_ID: locatorId || null,
            LocatorName: locatorName || null,
            uomOptions: uomOptions,
            selectedUom: selectedUom || { C_UOM_ID: lineUomId, Name: uomName },
          };
        })
      );

      return enrichedLines;
    } catch (err) {
      console.error('Gagal memuat line Requisition:', err);
      return [];
    } finally {
      setLoadingLines(false);
    }
  }, []);

  return {
    requisitions,
    loadingList,
    loadingLines,
    fetchApprovedRequisitions,
    fetchRequisitionLines,
    getDefaultStartDate,
    getDefaultEndDate,
  };
};