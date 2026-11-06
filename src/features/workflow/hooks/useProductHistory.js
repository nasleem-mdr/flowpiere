// hooks/useProductHistory.js
// Mirror WFHistoryPopupHandler.java (plugin org.nsoft.workflow.activities):
// klik baris produk di detail approval → popup riwayat transaksi produk/jasa
// tersebut (maks HISTORY_LIMIT dokumen terakhir).
//
// Perbedaan implementasi vs plugin ZK (yang pakai 1 SQL dengan JOIN):
//   REST tidak bisa JOIN, jadi strateginya —
//     1. GET lines (lineTable) filter M_Product_ID + exclude header aktif,
//        LIMIT 3, urut Created desc.
//     2. Fetch header tiap line (maks 3 request PARALEL — bukan N+1 karena
//        ter-capped LIMIT) untuk DocNo / Tanggal / BPartner.
//     3. Sort client-side by tanggal header desc — hasil akhir identik popup ZK.
//
// Semua nama kolom tetap diambil dari SysConfig WF_DETAIL_<Table>_* yang sama
// (COL2 → qty, COL3 → amount, HDR_COL1 → docNo, HDR_COL3 → tanggal), jadi
// konfigurasi 2Pack yang sudah ada langsung dipakai tanpa perubahan.
import { useState, useCallback } from 'react';
import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';
import {
  getDetailConfig,
  resolveFirstSimpleColumn,
  resolveColumnValue, 
  formatHistoryNumber,
  formatMaybeDate,
} from '../utils/workflowDetailConfig';

export const HISTORY_LIMIT = 3; // mirror HISTORY_LIMIT di WFHistoryPopupHandler

const INITIAL = {
  open: false,
  loading: false,
  rows: [],
  itemLabel: '',
  error: null,
  noProduct: false,
};

export function useProductHistory() {
  const [state, setState] = useState(INITIAL);

  const closeHistory = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  /**
   * @param {object} args
   * @param {object} args.lineRecord  raw record line yang diklik (dari detail.lines row._raw)
   * @param {string} args.itemLabel   teks kolom-1 baris yang diklik (judul popup)
   * @param {object} args.activity    Workflow Activity node (butuh 'table-name' + record_id)
   */
  const openHistory = useCallback(async ({ lineRecord, itemLabel, activity }) => {
    const tableName = activity?.['table-name'];
    if (!tableName) return;

    const productId = fkId(lineRecord?.M_Product_ID);
    setState({ ...INITIAL, open: true, loading: true, itemLabel: itemLabel || '' });

    // Produk tidak ada di baris (mis. line non-produk) — tampilkan info saja.
    if (!productId) {
      setState({ ...INITIAL, open: true, noProduct: true, itemLabel: itemLabel || '' });
      return;
    }

    try {
      const cfg = await getDetailConfig(tableName);
      const lineTable = cfg.LINE_TABLE;
      const linkCol   = cfg.LINK_COL;

      // Sama dengan guard plugin: LINE_TABLE/LINK_COL wajib terkonfigurasi.
      if (!lineTable || lineTable === '-' || !linkCol || linkCol === '-') {
        setState({ ...INITIAL, open: true, error: 'LINE_TABLE/LINK_COL belum dikonfigurasi untuk tabel ini.', itemLabel: itemLabel || '' });
        return;
      }

      // Mirror resolveFirstSimpleColumn di plugin — kolom SQL sederhana pertama.
      const qtyCol      = resolveFirstSimpleColumn(cfg.COL2);
      const priceCol    = resolveFirstSimpleColumn(cfg.COL3);
      
      // Exclude dokumen yang sedang diapprove (mirror: l.<linkCol> != headerId).
      const currentHeaderId = fkId(lineRecord?.[linkCol]) ?? activity?.record_id;
      //const excludeFilter = currentHeaderId ? ` and ${linkCol} ne ${currentHeaderId}` : '';
      const excludeFilter = '';   // jangan kirim ne ke server
      const FETCH_BUFFER  = HISTORY_LIMIT + 5;
      
      const res = await idempiereApi(
        `/models/${lineTable.toLowerCase()}?$filter=M_Product_ID eq ${productId}` +
        ` and IsActive eq true` +
        `&$orderby=Created desc&$top=${FETCH_BUFFER}`
      );
      //const lines = Array.isArray(res?.records) ? res.records : [];
      const lines = (Array.isArray(res?.records) ? res.records : [])
      .filter((l) => !currentHeaderId || String(fkId(l?.[linkCol])) !== String(currentHeaderId))
      .slice(0, HISTORY_LIMIT);

      if (lines.length === 0) {
        setState({ ...INITIAL, open: true, error: null, itemLabel: itemLabel || '', empty: true });
        return;
      }

      // Fetch header tiap line (PARALEL, maks 3) untuk DocNo/Tanggal/BPartner.
      const rows = await Promise.all(lines.map(async (line) => {
        const row = {
          docNo: '-', date: '-', bpartner: '-',
          qty: formatHistoryNumber(line?.[qtyCol]),
          amount: formatHistoryNumber(line?.[priceCol]),
          _sort: 0,
        };
        const headerFkId = fkId(line?.[linkCol]);
        if (!headerFkId) return row;
        try {
          const h = await idempiereApi(`/models/${tableName.toLowerCase()}/${headerFkId}`);
          if (h) {
            const [docNo, dateVal, partner] = await Promise.all([
              resolveColumnValue(h, cfg.HDR_COL1),
              resolveColumnValue(h, cfg.HDR_COL3),
              resolveColumnValue(h, cfg.HDR_COL2),
            ]);

            if (docNo != null) row.docNo = String(docNo);
            if (dateVal) {
              row.date = formatMaybeDate(dateVal);
              const t = new Date(dateVal).getTime();
              if (!Number.isNaN(t)) row._sort = t;
            }
            if (partner) row.bpartner = String(partner);
          }
        } catch (err) {
          console.warn('[useProductHistory] fetch header gagal:', err);
        }
        return row;
      }));

      // ORDER BY tanggal header DESC (mirror SQL plugin).
      rows.sort((a, b) => b._sort - a._sort);

      setState({
        ...INITIAL, open: true, rows: rows.map(({ _sort, ...r }) => r), itemLabel: itemLabel || '',
      });
    } catch (err) {
      setState({ ...INITIAL, open: true, error: err.message || 'Gagal memuat riwayat transaksi.', itemLabel: itemLabel || '' });
    }
  }, []);

  return { history: state, openHistory, closeHistory };
}
