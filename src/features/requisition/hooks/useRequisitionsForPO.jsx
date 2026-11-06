import { useState, useCallback } from 'react';
import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';
import { useProductVendorInfo } from '@/shared/hooks/useProductVendorInfo';


const APPROVED_STATUSES = ['CO'];

export function useRequisitionsForPO() {
  const [requisitions, setRequisitions] = useState([]);
  const [loadingList, setLoadingList]   = useState(false);

  const [selectedLines, setSelectedLines] = useState([]);
  const [loadingLines, setLoadingLines]   = useState(false);

  const { fetchVendorOptionsBatch, fetchListPrice } = useProductVendorInfo();

  const fetchApprovedRequisitions = useCallback(async ({ search = '' } = {}) => {
    setLoadingList(true);
    try {
      const statusFilter = APPROVED_STATUSES.map(s => `DocStatus eq '${s}'`).join(' or ');
      let filter = `(${statusFilter})`;
      if (search) {
        const safeQ = search.replace(/'/g, "''");
        filter += ` and contains(toupper(DocumentNo),'${safeQ.toUpperCase()}')`;
      }

      const res = await idempiereApi(
        `/models/m_requisition?$select=M_Requisition_ID,DocumentNo,DateDoc,M_Warehouse_ID,DocStatus,TotalLines,Description` +
        `&$filter=${filter}&$orderby=DateDoc desc&$top=50`
      );
      const records = Array.isArray(res.records) ? res.records : [];

      let list = records.map(r => ({
        M_Requisition_ID: fkId(r.M_Requisition_ID) ?? r.id,
        DocumentNo:       r.DocumentNo,
        DateDoc:          r.DateDoc,
        WarehouseName:    fkLabel(r.M_Warehouse_ID),
        DocStatus:        r.DocStatus?.id ?? r.DocStatus,
        TotalLines:       r.TotalLines ?? 0,
        Description:      r.Description || '',
      }));

      if (list.length > 0) {
        const results = await Promise.all(list.map(async (req) => {
          try {
            const lineRes = await idempiereApi(
              `/models/m_requisitionline?$filter=M_Requisition_ID eq ${req.M_Requisition_ID}` +
              `&$select=M_RequisitionLine_ID,C_OrderLine_ID`
            );
            const lineRecords = Array.isArray(lineRes.records) ? lineRes.records : [];
            const openCount = lineRecords.filter(l => !fkId(l.C_OrderLine_ID)).length;
            return { ...req, OpenLineCount: openCount, _queryOk: true };
          } catch (err) {
            console.error(`[useRequisitionsForPO] gagal cek C_OrderLine_ID FPB ${req.DocumentNo}:`, err);
            return { ...req, OpenLineCount: null, _queryOk: false };
          }
        }));
        list = results.filter(r => !r._queryOk || r.OpenLineCount > 0);
      }

      setRequisitions(list);
      return list;
    } catch (err) {
      console.error('[useRequisitionsForPO] fetchApprovedRequisitions error:', err);
      setRequisitions([]);
      return [];
    } finally {
      setLoadingList(false);
    }
  }, []);

  const fetchLinesRaw = useCallback(async (requisitionId) => {
    const baseSelect = 'M_RequisitionLine_ID,Line,M_Product_ID,C_UOM_ID,Qty,C_BPartner_ID,C_OrderLine_ID,Description';
    try {
      const res = await idempiereApi(
        `/models/m_requisitionline?$filter=M_Requisition_ID eq ${requisitionId}` +
        `&$select=${baseSelect},QtyEntered&$orderby=Line`
      );
      return { records: Array.isArray(res.records) ? res.records : [], hasQtyEntered: true };
    } catch (err) {
      const msg = String(err?.message || '');
      if (!/qtyentered/i.test(msg)) throw err;

      console.warn(
        '[useRequisitionsForPO] Kolom QtyEntered belum tersedia di server ini — ' +
        'fetch ulang TANPA field itu (fallback sementara).'
      );
      const res = await idempiereApi(
        `/models/m_requisitionline?$filter=M_Requisition_ID eq ${requisitionId}` +
        `&$select=${baseSelect}&$orderby=Line`
      );
      return { records: Array.isArray(res.records) ? res.records : [], hasQtyEntered: false };
    }
  }, []);

  // Fetch UOM dasar (ID + NAMA) untuk sekumpulan produk sekaligus. Nama
  // dibutuhkan untuk preview konversi di RequisitionToPOImportModal.jsx
  // (mis. "≈ 6 pcs") — BaseUOM_ID saja tidak cukup untuk ditampilkan.
  const fetchProductBaseUoms = useCallback(async (productIds) => {
    const uniqueIds = [...new Set(productIds)].filter(Boolean);
    if (uniqueIds.length === 0) return {};
    try {
      const filter = uniqueIds.map(id => `M_Product_ID eq ${id}`).join(' or ');
      const res = await idempiereApi(
        `/models/m_product?$filter=${filter}&$select=M_Product_ID,C_UOM_ID`
      );
      const records = Array.isArray(res.records) ? res.records : [];
      const map = {};
      records.forEach(r => {
        const pid = fkId(r.M_Product_ID) ?? r.id;
        map[pid] = { id: fkId(r.C_UOM_ID), name: fkLabel(r.C_UOM_ID) };
      });
      return map;
    } catch (err) {
      console.error('[useRequisitionsForPO] gagal fetch UOM dasar produk:', err);
      return {};
    }
  }, []);

  const fetchRequisitionLines = useCallback(async (requisitionId) => {
    if (!requisitionId) return [];
    setLoadingLines(true);
    try {
      const { records, hasQtyEntered } = await fetchLinesRaw(requisitionId);

      const allLines = records.map(l => ({
        M_RequisitionLine_ID: fkId(l.M_RequisitionLine_ID) ?? l.id,
        M_Product_ID:  fkId(l.M_Product_ID),
        ProductName:   fkLabel(l.M_Product_ID) || `Produk #${fkId(l.M_Product_ID)}`,
        C_UOM_ID:      fkId(l.C_UOM_ID),
        UomName:       fkLabel(l.C_UOM_ID) || 'EA',
        Qty:           parseFloat(l.Qty || 0),
        QtyEntered:    hasQtyEntered ? parseFloat(l.QtyEntered ?? l.Qty ?? 0) : null,
        LineBPartnerId:   fkId(l.C_BPartner_ID),
        LineBPartnerName: fkLabel(l.C_BPartner_ID),
        isOrdered:        !!fkId(l.C_OrderLine_ID),
      }));

      const openLinesRaw = allLines.filter(l => !l.isOrdered);

      const baseUomMap = await fetchProductBaseUoms(openLinesRaw.map(l => l.M_Product_ID));
      const openLines = openLinesRaw.map(l => {
        const baseUom = baseUomMap[l.M_Product_ID];
        return {
          ...l,
          BaseUOM_ID:   baseUom?.id ?? l.C_UOM_ID,   // fallback: dianggap C_UOM_ID sudah base
          BaseUOMName:  baseUom?.name ?? l.UomName,  // idem, untuk preview
        };
      });

      const needVendorLookup = openLines.filter(l => !l.LineBPartnerId);
      const vendorMap = await fetchVendorOptionsBatch(needVendorLookup.map(l => l.M_Product_ID));

      const enriched = await Promise.all(openLines.map(async (line) => {
        const qEntered = line.QtyEntered ?? line.Qty;
        // Rate konversi base→entered, mis. 200 (1 Drum = 200 Liter).
        // Dipakai untuk menyesuaikan harga, karena M_ProductPrice selalu
        // dalam base UOM produk sedangkan baris FPB bisa pakai UOM lain.
        const rate = qEntered > 0 ? (line.Qty / qEntered) : 1;
      
        if (line.LineBPartnerId) {
          const { priceStd, priceList } = await fetchListPrice(line.M_Product_ID, line.LineBPartnerId);
          const priceEntered = priceStd * rate;
          return {
            ...line,
            vendorOptions: [{
              C_BPartner_ID: line.LineBPartnerId,
              VendorName:    line.LineBPartnerName,
              Price:         priceEntered,
              PriceListRef:  priceList * rate,
              isCurrent:     true,
            }],
            C_BPartner_ID: line.LineBPartnerId,
            VendorName:    line.LineBPartnerName,
            Price:         priceEntered,
            PriceListRef:  priceList * rate,
          };
        }
      
        const rawVendorOptions = vendorMap[line.M_Product_ID] || [];
        // Sesuaikan harga TIAP opsi vendor ke UOM entered baris ini juga —
        // supaya kalau user ganti vendor lewat dropdown, harga yang terpasang
        // tetap dalam UOM yang benar (lihat handleVendorSelectChange di modal).
        const vendorOptions = rawVendorOptions.map(v => ({
          ...v,
          Price:        (v.Price ?? 0) * rate,
          PriceListRef: (v.PriceListRef ?? 0) * rate,
        }));
        const def = vendorOptions.find(v => v.isCurrent) || vendorOptions[0] || null;
        return {
          ...line,
          vendorOptions,
          C_BPartner_ID: def?.C_BPartner_ID ?? null,
          VendorName:    def?.VendorName ?? '',
          Price:         def?.Price ?? 0,
          PriceListRef:  def?.PriceListRef ?? 0,
        };
      }));

      setSelectedLines(enriched);
      return enriched;
    } catch (err) {
      console.error('[useRequisitionsForPO] fetchRequisitionLines error:', err);
      setSelectedLines([]);
      return [];
    } finally {
      setLoadingLines(false);
    }
  }, [fetchVendorOptionsBatch, fetchListPrice, fetchLinesRaw, fetchProductBaseUoms]);

  return {
    requisitions, loadingList, fetchApprovedRequisitions,
    selectedLines, loadingLines, fetchRequisitionLines,
  };
}
