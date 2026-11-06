// utils/workflowDetailConfig.js
// ─────────────────────────────────────────────────────────────────────────────
// Mirror konfigurasi SysConfig plugin iDempiere `org.nsoft.workflow.activities`
// (WFTransactionDetailRenderer) ke sisi React. Konfigurasi `WF_DETAIL_<Table>_*`
// yang sudah Anda set di iDempiere LANGSUNG dipakai di sini, jadi detail dokumen
// (header + lines) tampil konsisten antara form Workflow Activities ZK dan
// aplikasi React ini — tanpa perlu konfigurasi ulang.
//
// Konvensi nilai (sama persis dengan plugin):
//   - "A,B,C"          → fallback list, kolom pertama yang bernilai dipakai
//   - "FK_ID>Kol>Kol2" → FK chain lookup (multi-level didukung)
//   - "-"              → nonaktifkan field tersebut
// ─────────────────────────────────────────────────────────────────────────────
import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';

export const WF_DETAIL_DEFAULTS = {
  // Header (4 field ringkasan dokumen)
  HDR_COL1:       'DocumentNo,Value,Name',
  HDR_COL1_LABEL: 'No. Dokumen',
  HDR_COL2:       'C_BPartner_ID>Name',
  HDR_COL2_LABEL: 'Business Partner',
  HDR_COL3:       'DateOrdered,DateInvoiced,MovementDate,DateRequired,DateDoc,Created',
  HDR_COL3_LABEL: 'Tanggal',
  HDR_COL4:       'GrandTotal,TotalLines,-',
  HDR_COL4_LABEL: 'Total',
  HDR_COL4_TYPE:  'numeric',
  // Lines (3 kolom baris dokumen)
  COL1:       'M_Product_ID>Name,Description,Name',
  COL1_LABEL: 'Deskripsi',
  COL1_TYPE:  'string',
  COL2:       'QtyOrdered,QtyInvoiced,MovementQty,QtyEntered,Qty',
  COL2_LABEL: 'Qty',
  COL2_TYPE:  'numeric',
  COL3:       'LineNetAmt,PriceActual,-',
  COL3_LABEL: 'Amount',
  COL3_TYPE:  'numeric',
  ORDER_BY:   'Line',
};

// ⚠️ Nama tabel di iDempiere adalah AD_SysConfig (kelas Java-nya MSysConfig,
// tapi tabelnya AD_SysConfig). Jangan sampai tertukar — kesalahan ini membuat
// query 404 dan konfigurasi LINE_TABLE/LINK_COL jatuh ke default tanpa lines.
// Cache per table-name supaya polling/list tidak memicu ulang request SysConfig.
const configCache = new Map();

// Ambil konfigurasi WF_DETAIL_<TableName>_*. Kalau server tidak punya SysConfig
// (atai request gagal), fallback ke WF_DETAIL_DEFAULTS — persis perilaku plugin.
export async function getDetailConfig(tableName) {
  if (!tableName) return { ...WF_DETAIL_DEFAULTS };
  if (configCache.has(tableName)) return configCache.get(tableName);

  const prefix = `WF_DETAIL_${tableName}_`;
  let values = {};
  try {
    const res = await idempiereApi(
      `/models/ad_sysconfig?$select=Name,Value&$filter=contains(Name,'${prefix}')&$top=200`
    );
    (Array.isArray(res?.records) ? res.records : []).forEach((r) => {
      if (typeof r.Name === 'string' && r.Name.startsWith(prefix)) {
        values[r.Name.slice(prefix.length)] = r.Value;
      }
    });
  } catch (err) {
    console.warn(`[workflowDetailConfig] gagal baca SysConfig untuk ${tableName}:`, err);
  }

  const cfg = { ...WF_DETAIL_DEFAULTS, ...values };
  configCache.set(tableName, cfg);
  return cfg;
}

// Pecah fallback list jadi kandidat kolom. Comma di dalam FK chain tetap utuh
// untuk kasus yang didokumentasikan plugin: "M_Product_ID>Name,Description"
// → ["M_Product_ID>Name", "Description"].
export function splitColumnDefs(def) {
  if (!def) return [];
  return def.split(',').map((s) => s.trim()).filter(Boolean);
}

function normalizeValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return fkLabel(raw) ?? fkId(raw);
  return raw;
}

// Resolve SATU definisi kolom, dukung FK chain "A_ID>B_ID>C".
// Hop diturunkan dari nama kolom: kolom berakhiran "_ID" → tabel = nama tanpa _ID
// (konvensi penamaan standar iDempiere).
async function resolveOneColumn(record, columnDef) {
  const parts = columnDef.split('>').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  let current = record;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!current || typeof current !== 'object') return null;

    if (i === parts.length - 1) {
      return normalizeValue(current[part]);
    }

    const fkValue = fkId(current[part]);
    if (!fkValue) return null;
    const tableName = part.endsWith('_ID') ? part.slice(0, -3) : null;
    if (!tableName) return normalizeValue(current[part]);

    try {
      current = await idempiereApi(`/models/${tableName.toLowerCase()}/${fkValue}`);
    } catch (err) {
      console.warn(`[workflowDetailConfig] FK chain putus di ${part}:`, err);
      return null;
    }
  }
  return null;
}

// Resolve definisi kolom ber-fallback: coba tiap kandidat dari kiri,
// pakai yang pertama bernilai non-null (null-coalescing antar nama kolom).
export async function resolveColumnValue(record, def) {
  if (!def || def === '-') return null;
  for (const candidate of splitColumnDefs(def)) {
    const value = await resolveOneColumn(record, candidate);
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

// Format angka dengan pemisah ribuan (locale id-ID); nilai lain dikembalikan apa adanya.
export function formatByType(value, type) {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'numeric') {
    const num = Number(value);
    if (!Number.isNaN(num)) {
      return num.toLocaleString('id-ID', { maximumFractionDigits: 2 });
    }
  }
  return String(value);
}

// Deteksi tanggal ISO sederhana untuk diformat rapi di header.
export function formatMaybeDate(value) {
  if (typeof value !== 'string') return value;
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Mirror resolveFirstSimpleColumn() plugin WFHistoryPopupHandler:
// ambil kandidat kolom PERTAMA yang bukan FK-chain (tanpa '>') dan bukan "-".
// Dipakai untuk memetakan SysConfig column-def ke nama kolom REST yang bisa
// dipakai langsung di filter/sort (mis. "Qty" dari "QtyEntered,QtyOrdered,...").
export function resolveFirstSimpleColumn(def) {
  if (!def) return null;
  for (const candidate of splitColumnDefs(def)) {
    if (candidate && candidate !== '-' && !candidate.includes('>')) return candidate;
  }
  return null;
}

// Format angka riwayat (qty/amount) — dua desimal, locale id-ID,
// persis formatBigDecimal() / formatAmount() di plugin.
export function formatHistoryNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  const num = Number(value);
  if (Number.isNaN(num)) return '-';
  return num.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}