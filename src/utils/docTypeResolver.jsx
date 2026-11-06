/* ─────────────────────────────────────────────────────────────────────────────
* docTypeResolver.jsx
* Menggantikan pola lama "C_DOCTYPE_ID: 1000019 * GANTI sesuai instance Anda"
* yang ada di GoodsReceiptContainer.jsx / PurchasingContainer.jsx (dan
* sebaiknya juga RequisitionContainer.jsx kalau masih hardcode serupa).
*
* MASALAH: C_DocType_ID adalah angka PK yang di-generate per baris data, dan
* selalu di-scope ke AD_Client_ID. Kalau 1 instance iDempiere melayani lebih
* dari 1 Client, angka hardcode dari Client A pasti salah (atau malah nyasar
* ke doc type Client lain) begitu user dari Client B login.
*
* SOLUSI: setiap C_DocType WAJIB punya DocBaseType (nilai standar iDempiere,
* SAMA di semua Client — mis. 'POO' utk Purchase Order, 'MMR' utk Material
* Receipt, 'POR' utk Purchase Requisition, 'MMM' utk Movement). Jadi alih-alih
* hardcode ID, kita cari C_DocType yang DocBaseType-nya cocok DAN
* AD_Client_ID-nya sama dengan client user yang sedang login — resolusinya
* otomatis benar untuk client manapun, sama seperti cara iDempiere sendiri
* menentukan "default doc type" (lihat MDocType.get() di core iDempiere).
*
* Preferensi urutan pemilihan kalau ada beberapa C_DocType yang cocok:
*   1. Yang AD_Org_ID-nya = org user login (override khusus org tsb)
*   2. Yang ditandai IsDefault = true
*   3. Fallback: yang pertama aktif ditemukan
*
* PENTING — kasus M_Inventory (Internal Use): DocBaseType='MMI' dipakai
* untuk 2 transaksi berbeda di tabel yang sama (M_Inventory), dibedakan
* lewat kolom DocSubTypeInv (dikonfirmasi dari Javadoc resmi
* org.compiere.model.X_C_DocType, AD_Reference_ID=200068):
*   • 'IU' = Internal Use Inventory  ← dipakai InternalUseContainer
*   • 'PI' = Physical Inventory      (stock opname — BUKAN cakupan modul ini)
*   • 'CA' = Cost Adjustment
* Karena itu resolveDocTypeId() menerima docSubTypeInv opsional — WAJIB
* diisi 'IU' saat resolve doc type untuk Internal Use, supaya tidak
* salah ambil C_DocType yang sebenarnya untuk Physical Inventory (yang
* DocBaseType-nya sama-sama 'MMI').
* ─────────────────────────────────────────────────────────────────────────────
*/
import { idempiereApi } from '@/api/idempiereApi';
import { getLoginInfo } from '@/shared/hooks/useLoginInfo';

// Cache di memori per sesi browser — key mencakup docSubTypeInv juga, supaya
// 'MMI'+'IU' dan 'MMI'+'PI' tidak saling menimpa cache satu sama lain.
const _cache = new Map();

/**
 * Resolve C_DocType_ID berdasarkan DocBaseType standar iDempiere.
 *
 * @param {string} docBaseType - mis. 'POO' (Purchase Order), 'MMR' (Material
 *   Receipt/Vendor Receipt), 'POR' (Purchase Requisition), 'MMI' (Inventory).
 * @param {{ orgId?: number, docSubTypeInv?: string }} opts - orgId opsional
 *   untuk preferensi doc type khusus org tertentu; docSubTypeInv WAJIB diisi
 *   ('IU'/'PI'/'CA') kalau docBaseType='MMI', karena DocBaseType saja tidak
 *   cukup membedakan Internal Use vs Physical Inventory.
 * @returns {Promise<number>} C_DocType_ID yang sesuai untuk client user login.
 */
export async function resolveDocTypeId(docBaseType, { orgId = null, docSubTypeInv = null, isSOTrx = null, name = null, excludeName = null } = {}) {
  const { clientId } = getLoginInfo();
  if (!clientId) {
    throw new Error('AD_Client_ID tidak ditemukan di sesi login — silakan login kembali.');
  }

  const cacheKey =`${clientId}_${docBaseType}_${docSubTypeInv ?? '-'}_${isSOTrx ?? '-'}_${orgId ?? 0}` +
    `_${name ?? '-'}_${excludeName ?? '-'}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);

  const esc = (s) => s.replace(/'/g, "''");
  let filter = `DocBaseType eq '${docBaseType}' and AD_Client_ID eq ${clientId} and IsActive eq true`;
  if (docSubTypeInv) filter += ` and DocSubTypeInv eq '${docSubTypeInv}'`;
  if (isSOTrx !== null) filter += ` and IsSOTrx eq ${isSOTrx}`;
  if (name)        filter += ` and Name eq '${esc(name)}'`;
  if (excludeName) filter += ` and Name neq '${esc(excludeName)}'`;

  const res = await idempiereApi(
    `/models/c_doctype?$select=C_DocType_ID,Name,AD_Org_ID,IsDefault` +
    `&$filter=${filter}&$orderby=IsDefault desc`
  );
  const records = Array.isArray(res.records) ? res.records : [];

  if (records.length === 0) {
    throw new Error(
      `Tidak ditemukan Document Type aktif dengan DocBaseType='${docBaseType}'` +
      (docSubTypeInv ? ` dan DocSubTypeInv='${docSubTypeInv}'` : '') +
      (isSOTrx !== null ? ` dan IsSOTrx=${isSOTrx}` : '') +
      ` untuk Client ini (AD_Client_ID=${clientId}).\n` +
      `Buat/aktifkan Document Type-nya dulu di iDempiere: Window "Document Type", ` +
      `set Document Base Type = ${docBaseType}` +
      (docSubTypeInv ? ` dan Inv Sub Type = ${docSubTypeInv}` : '') +
      `, lalu centang "Default".`
    );
  }

  const orgSpecific = orgId
    ? records.find(r => (r.AD_Org_ID?.id ?? r.AD_Org_ID) === orgId)
    : null;
  const defaultOne = records.find(r => r.IsDefault);
  const chosen = orgSpecific || defaultOne || records[0];

  const docTypeId = chosen.C_DocType_ID?.id ?? chosen.id ?? chosen.C_DocType_ID;
  _cache.set(cacheKey, docTypeId);
  return docTypeId;
}

// Dipanggil manual kalau Anda perlu paksa refetch (mis. setelah admin
// mengubah konfigurasi Document Type tanpa reload aplikasi).
export function clearDocTypeCache() {
  _cache.clear();
}

// Referensi nilai DocBaseType standar iDempiere yang dipakai di aplikasi ini
// — supaya tidak perlu hardcode string di banyak tempat.
export const DOC_BASE_TYPE = {
  PURCHASE_REQUISITION: 'POR', // FPB — Requisition
  PURCHASE_ORDER:        'POO', // Purchasing
  MATERIAL_RECEIPT:      'MMR', // Goods Receipt (Vendor Receipt)
  MATERIAL_SHIPMENT:     'MMS',
  MATERIAL_MOVEMENT:     'MMM', // Perpindahan gudang↔gudang (TIDAK dipakai Internal Use)
  MATERIAL_INVENTORY:    'MMI', // M_Inventory — WAJIB dikombinasikan dengan
  AP_INVOICE:            'API',  // ⬅️ baru
  AP_PAYMENT:            'APP', 
  AR_INVOICE:            'ARI', // DOC_SUB_TYPE_INV di bawah (lihat catatan di atas).
  AR_RECEIPT:            'ARR',
  SALES_ORDER:            'SOO',
};

//Pada setup IDempiere, kita harus membuat Document Type dengan nama Cash Purchase Order (POO)
export const CASH_PO_DOCTYPE_NAME = 'Cash Purchase Order';

// Referensi nilai DocSubTypeInv (AD_Reference_ID=200068) — pembeda transaksi
// di dalam DocBaseType='MMI' (M_Inventory).
export const DOC_SUB_TYPE_INV = {
  INTERNAL_USE:       'IU', // Internal Use Inventory — dipakai InternalUseContainer
  PHYSICAL_INVENTORY: 'PI', // Physical Inventory (stock opname)
  COST_ADJUSTMENT:    'CA', // Cost Adjustment
};

export const IS_SO_TRX = {
  PURCHASE: false,
  SALES:    true,
};
