// hooks/useWorkflowDocumentDetail.js
// Muat detail dokumen yang melekat pada satu Workflow Activity:
//   1. Dari node ambil "table-name" + record_id  (diisi iDempiere otomatis)
//   2. Baca konfigurasi WF_DETAIL_<Table>_* di SysConfig (mirror plugin)
//   3. Fetch record header via /models/<table>/<id>, resolve 4 kolom ringkasan
//   4. Kalau LINE_TABLE dikonfigurasi (dan bukan "-"), fetch lines + resolve
//      3 kolom baris (COL1/COL2/COL3) dengan fallback & FK chain yang sama
//      persis dengan WFTransactionDetailRenderer di plugin iDempiere Anda.
import { useState, useCallback } from 'react';
import { idempiereApi, fkId } from '@/api/idempiereApi';
import {
  getDetailConfig,
  resolveColumnValue,
  formatByType,
  formatMaybeDate,
} from '../utils/workflowDetailConfig';

export function useWorkflowDocumentDetail() {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const clearDetail = useCallback(() => {
    setDetail(null);
    setError(null);
  }, []);

  const loadDetail = useCallback(async (activity) => {
    const tableName = activity?.['table-name'];
    const recordId  = activity?.record_id;
    if (!tableName || !recordId) {
      clearDetail();
      return;
    }

    setLoading(true);
    setError(null);
    setDetail(null);
    try {
      const cfg    = await getDetailConfig(tableName);
      const record = await idempiereApi(`/models/${tableName.toLowerCase()}/${recordId}`);

      // ── Header: 4 field ringkasan (resolve async karena bisa FK chain) ──
      const headerDefs = [
        { key: 'h1', label: cfg.HDR_COL1_LABEL, def: cfg.HDR_COL1, type: 'string' },
        { key: 'h2', label: cfg.HDR_COL2_LABEL, def: cfg.HDR_COL2, type: 'string' },
        { key: 'h3', label: cfg.HDR_COL3_LABEL, def: cfg.HDR_COL3, type: 'date'   },
        { key: 'h4', label: cfg.HDR_COL4_LABEL, def: cfg.HDR_COL4, type: cfg.HDR_COL4_TYPE || 'numeric' },
      ];
      const header = await Promise.all(
        headerDefs.map(async (h) => {
          let raw = await resolveColumnValue(record, h.def);
          // Mirror resolveCreatedByName() plugin: kalau HDR_COL2 kosong,
          // tampilkan "By: <nama user pembuat dokumen>".
          if ((raw === null || raw === undefined || raw === '') && h.key === 'h2') {
            try {
              const createdById = fkId(record.CreatedBy);
              if (createdById) {
                const u = await idempiereApi(`/models/ad_user/${createdById}`);
                if (u?.Name) raw = `By: ${u.Name}`;
              }
            } catch (err) {
              console.warn('[useWorkflowDocumentDetail] fallback CreatedBy gagal:', err);
            }
          }
          const value = h.type === 'date' ? formatMaybeDate(raw) : raw;
          return { ...h, value: value ?? null };
        })
      );

      // ── Lines: tabel baris dokumen (opsional, "-" = dokumen tanpa lines) ──
      let lines = null;
      const lineTable = cfg.LINE_TABLE;
      if (lineTable && lineTable !== '-' && cfg.LINK_COL) {
        try {
          const res = await idempiereApi(
            `/models/${lineTable.toLowerCase()}?$filter=${cfg.LINK_COL} eq ${recordId}` +
            `&$orderby=${cfg.ORDER_BY || 'Line'}&$top=500`
          );
          const records = Array.isArray(res?.records) ? res.records : [];

          const colDefs = [
            { key: 'col1', label: cfg.COL1_LABEL, def: cfg.COL1, type: cfg.COL1_TYPE },
            { key: 'col2', label: cfg.COL2_LABEL, def: cfg.COL2, type: cfg.COL2_TYPE },
            ...(cfg.COL3 && cfg.COL3 !== '-'
              ? [{ key: 'col3', label: cfg.COL3_LABEL, def: cfg.COL3, type: cfg.COL3_TYPE }]
              : []),
          ];

          const rows = await Promise.all(records.map(async (r) => {
            const row = {
              id: r.id ?? r[`${lineTable}_ID`]?.id,
              // Simpan referensi raw record agar popup history bisa membaca
              // M_Product_ID dan LINK_COL dari baris yang diklik
              // (mirror: WFHistoryPopupHandler.open(linePO, ...)).
              _raw: r,
              _productId: fkId(r.M_Product_ID) ?? null,
            };
            for (const c of colDefs) {
              const raw = await resolveColumnValue(r, c.def);
              row[c.key] = formatByType(raw, c.type);
            }
            return row;
          }));

          lines = { columns: colDefs, rows };
        } catch (lineErr) {
          // Gagal render lines jangan sampai menggagalkan seluruh detail —
          // header tetap tampil, lines ditandai error.
          console.warn('[useWorkflowDocumentDetail] gagal load lines:', lineErr);
          lines = { columns: [], rows: [], error: 'Gagal memuat baris dokumen.' };
        }
      }

      setDetail({ header, lines, tableName, record });
    } catch (err) {
      setError(err.message || 'Gagal memuat detail dokumen.');
    } finally {
      setLoading(false);
    }
  }, [clearDetail]);

  return { detail, loading, error, loadDetail, clearDetail };
}