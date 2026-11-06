/** ─────────────────────────────────────────────────────────────────────────────
* useInternalUseSubmit.jsx
* Window iDempiere "Inventory Decrease/Increase" → tabel M_Inventory /
* M_InventoryLine. Untuk kasus Internal Use (bukan physical count penuh),
* field yang relevan di tiap line:
*   • QtyBook   — qty sistem saat ini (informatif, hasil resolve stok, UOM DASAR)
*   • QtyCount  — disamakan dengan QtyBook (TIDAK ada selisih/variance,
*                 karena ini bukan stock opname, cuma pengambilan langsung)
*   • QtyInternalUse — qty yang benar-benar diambil, UOM DASAR
*   • C_Charge_ID    — MANDATORY, akun/alasan pemakaian (di-suggest dari
*                       M_Product.C_Charge_ID kalau ada)
*
* ⚠️ M_InventoryLine TIDAK punya kolom C_UOM_ID (dikonfirmasi dari struktur
* tabel) — SEMUA field qty di atas WAJIB dalam UOM dasar produk. Konversi
* dari UOM entry (mis. "Rim") ke UOM dasar (mis. "Lembar") WAJIB pakai
* `toBaseQty()` dari useUomConversion.jsx (pola sama seperti Purchasing),
* BUKAN kalkulasi manual `qty * selectedUom.multiplyRate`. Alasannya:
* MultiplyRate mentah dari C_UOM_Conversion punya arti "berapa <UOM_To>
* per 1 <UOM_Dasar>", jadi kalau rate < 1 (mis. 0.002 untuk 1 Rim = 500
* Lembar), base qty yang benar didapat dari MEMBAGI (entered / rate),
* bukan mengalikan — lihat komentar "RUMUS SAKTI DIBALIK" di
* useUomConversion.jsx. Versi sebelumnya di sini mengalikan langsung
* (qty * rate), jadi utk Rim hasilnya 1 * 0.002 = 0.002 Lembar (salah
* total, harusnya 500 Lembar) — sudah diperbaiki di bawah.
* JANGAN kirim field C_UOM_ID ke payload M_InventoryLine — kolomnya
* memang tidak ada di tabel ini (sudah dikonfirmasi dari struktur tabel).
*
* ⚠️ M_InventoryLine dipakai bersama oleh 2 jenis dokumen: Physical
* Inventory (MMI>PI) dan Internal Use (MMO>IU). Untuk Physical Inventory,
* QtyBook (stok sistem) dan QtyCount (hasil hitung fisik) memang harus
* diisi nilai riil karena itu intinya stock opname (selisihnya jadi
* variance). TAPI untuk Internal Use, iDempiere HANYA memproses
* QtyInternalUse — QtyBook dan QtyCount cukup diisi 0 (bukan resolve stok
* sistem), karena bukan proses opname dan tidak menghasilkan variance.
* Jangan resolve/fetch QtyOnHand untuk transaksi ini — cukup hardcode 0.
*
* ⚠️ MULTI-WAREHOUSE: 1 dokumen M_Inventory (header) cuma boleh punya
* 1 M_Warehouse_ID, dan M_Locator_ID tiap line HARUS berada di dalam
* warehouse header itu. Karena user bisa pilih gudang berbeda per item di
* cart (lihat InternalUseCartItem → onWarehouseChange), submit() di sini
* MENGELOMPOKKAN cart per item.M_Warehouse_ID dan membuat SATU dokumen
* M_Inventory terpisah untuk tiap kelompok gudang.
*
* submitMode ('draft' | 'complete', default 'complete') — SAMA pola dengan
* useRequisitionSubmit.jsx / usePurchaseOrderSubmit.jsx / useGoodsReceiptSubmit.jsx:
*   - 'complete' -> doc-action 'CO' dipanggil utk SETIAP dokumen per-gudang.
*   - 'draft'    -> TIDAK ada doc-action yang dipanggil sama sekali untuk
*                   dokumen manapun -> semua dokumen per-gudang tetap
*                   Drafted. Karena ini per-klik-tombol, submitMode berlaku
*                   SAMA untuk semua kelompok gudang dalam 1 submit (tidak
*                   bisa sebagian draft sebagian complete dalam 1 klik).
*
* Partial success: kalau salah satu kelompok gagal (mis. error validasi di
* tengah proses Complete), kelompok gudang lain yang SUDAH berhasil
* diproses (draft ATAU complete) TETAP dianggap sukses — proses tidak
* dihentikan di tengah jalan. Item pada kelompok yang gagal dikembalikan
* lewat field `failed` supaya Container bisa membiarkannya tetap di cart
* untuk di-retry, alih-alih menghapus semuanya begitu saja.
* ─────────────────────────────────────────────────────────────────────────────
*/
import { 
  useState, 
  useCallback,
} from 'react';
import { idempiereApi } from '@/api/idempiereApi';
import { getLoginInfo } from '@/shared/hooks/useLoginInfo';
import { useUomConversion } from '@/shared/hooks/useUomConversion';

export function useInternalUseSubmit({ docTypeId, description, onError }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toBaseQty } = useUomConversion();

  const submit = useCallback(async (cart, { warehouseId: fallbackWarehouseId, submitMode = 'complete' } = {}) => {
    if (cart.length === 0) {
      onError?.('Daftar pengambilan barang masih kosong!');
      return null;
    }

    const missingCharge = cart.filter(i => !i.C_Charge_ID);
    if (missingCharge.length > 0) {
      onError?.(
        `${missingCharge.length} produk belum ditentukan Charge (alasan pemakaian):\n` +
        missingCharge.map(i => `• ${i.Name}`).join('\n'),
        'Charge Belum Lengkap'
      );
      return null;
    }

    const missingLocator = cart.filter(i => !i.M_Locator_ID);
    if (missingLocator.length > 0) {
      onError?.(
        `${missingLocator.length} produk tidak punya lokasi stok yang valid:\n` +
        missingLocator.map(i => `• ${i.Name}`).join('\n'),
        'Lokasi Stok Tidak Ditemukan'
      );
      return null;
    }

    // fallbackWarehouseId (gudang default sesi login) dipakai HANYA kalau
    // ada item yang entah kenapa belum punya M_Warehouse_ID sendiri (mis.
    // cart lama sebelum fitur pilih-gudang-per-item ada). Item yang
    // ditambahkan lewat alur baru selalu bawa M_Warehouse_ID masing-masing.
    const missingWarehouse = cart.filter(i => !i.M_Warehouse_ID && !fallbackWarehouseId);
    if (missingWarehouse.length > 0) {
      onError?.(
        `${missingWarehouse.length} produk belum punya gudang sumber stok:\n` +
        missingWarehouse.map(i => `• ${i.Name}`).join('\n'),
        'Gudang Belum Ditentukan'
      );
      return null;
    }

    if (!docTypeId) {
      onError?.('Document Type belum siap. Muat ulang halaman.', 'Error');
      return null;
    }

    const { orgId, clientId } = getLoginInfo();
    if (!orgId || !clientId) {
      onError?.('Data sesi tidak lengkap.\nSilakan login kembali.', 'Error');
      return null;
    }

    // ── Kelompokkan cart per M_Warehouse_ID ───────────────────────────
    const groups = new Map(); // warehouseId -> { warehouseId, warehouseName, items: [] }
    for (const item of cart) {
      const whId = item.M_Warehouse_ID ?? fallbackWarehouseId;
      if (!groups.has(whId)) {
        groups.set(whId, { warehouseId: whId, warehouseName: item.WarehouseName, items: [] });
      }
      groups.get(whId).items.push(item);
    }

    setIsSubmitting(true);
    const todayISO = new Date().toISOString().split('T')[0];
    const documents = [];
    const failed = [];

    for (const group of groups.values()) {
      try {
        // ── 1. Header M_Inventory ────────────────────────────────────
        const headerRes = await idempiereApi('/models/m_inventory', {
          method: 'POST',
          body: JSON.stringify({
            AD_Client_ID:   { id: clientId },
            AD_Org_ID:      { id: orgId },
            C_DocType_ID:   { id: docTypeId },
            M_Warehouse_ID: { id: parseInt(group.warehouseId) },
            MovementDate:   todayISO,
            Description:    description,
            IsActive:       true,
          }),
        });
        const inventoryId = headerRes.id ?? headerRes.M_Inventory_ID;
        if (!inventoryId) throw new Error('Gagal mendapatkan M_Inventory_ID dari server.');

        // ── 2. Lines M_InventoryLine ───────────────────────────────
        // ⚠️ M_InventoryLine TIDAK punya kolom C_UOM_ID — field qty di
        // tabel ini SELALU dalam UOM DASAR produk. Konversi dari UOM entry
        // (mis. "Rim") ke UOM dasar WAJIB pakai toBaseQty() dari
        // useUomConversion.jsx (pola sama seperti Purchasing) — BUKAN
        // `qty * multiplyRate` manual, karena MultiplyRate mentah punya
        // aturan pembagian khusus saat nilainya < 1. Lihat catatan di
        // kepala file. C_UOM_ID juga SENGAJA TIDAK dikirim di payload.
        for (const item of group.items) {
          const qtyInput = parseFloat(item.Qty || 0);
          const qtyBase  = toBaseQty(qtyInput, item.selectedUom);

          // Pastikan ID charge valid berupa integer
          const chargeId = parseInt(item.C_Charge_ID, 10);
          if (isNaN(chargeId)) {
            throw new Error(`Charge ID untuk produk "${item.Name}" tidak valid.`);
          }

          const linePayload = {
            AD_Org_ID:      { id: parseInt(orgId, 10) },
            M_Inventory_ID: { id: parseInt(inventoryId, 10) },
            M_Product_ID:   { id: parseInt(item.M_Product_ID, 10) },
            M_Locator_ID:   { id: parseInt(item.M_Locator_ID, 10) },
            QtyBook:        0,
            QtyCount:       0,
            QtyInternalUse: qtyBase,
            C_Charge_ID:    { id: chargeId },
          };

          await idempiereApi('/models/m_inventoryline', {
            method: 'POST',
            body: JSON.stringify(linePayload),
          });
        }

        // ── 3. Complete / biarkan Draft ─────────────────────────────
        let docNo;
        let statusLabel;

        if (submitMode === 'complete') {
          const completedRes = await idempiereApi(`/models/m_inventory/${inventoryId}`, {
            method: 'PUT',
            body: JSON.stringify({ 'doc-action': 'CO' }),
          });
          docNo = completedRes.DocumentNo || `IU-${inventoryId}`;
          statusLabel = 'Completed';
        } else {
          // submitMode === 'draft' — TIDAK memanggil doc-action apa pun.
          // Header + lines sudah tersimpan; dokumen gudang ini tetap Drafted.
          const draftRes = await idempiereApi(`/models/m_inventory/${inventoryId}?$select=DocumentNo,DocStatus`);
          docNo = draftRes.DocumentNo || `IU-${inventoryId}`;
          statusLabel = 'Draft';
        }

        documents.push({
          documentNo:    docNo,
          status:        statusLabel, // 'Draft' | 'Completed'
          warehouseId:   group.warehouseId,
          warehouseName: group.warehouseName,
          date:          new Date().toLocaleString('id-ID'),
          items:         group.items,
        });
      } catch (err) {
        // Kelompok gudang ini gagal — LANJUT ke kelompok berikutnya,
        // jangan hentikan seluruh proses (partial success, bukan
        // all-or-nothing), supaya dokumen yang sudah berhasil diproses di
        // kelompok lain tidak "hilang" dari sisi user.
        failed.push({
          warehouseId:   group.warehouseId,
          warehouseName: group.warehouseName,
          items:         group.items,
          error:         err.message,
        });
      }
    }

    setIsSubmitting(false);

    if (documents.length === 0) {
      // Semua kelompok gagal.
      const action = submitMode === 'complete' ? 'membuat' : 'menyimpan draft';
      onError?.(
        `Gagal ${action} dokumen Internal Use:\n\n` +
        failed.map(f => `• Gudang ${f.warehouseName || f.warehouseId}: ${f.error}`).join('\n'),
        'Error'
      );
      return null;
    }

    if (failed.length > 0) {
      onError?.(
        `${failed.length} dari ${groups.size} dokumen gagal diproses, sisanya berhasil:\n\n` +
        failed.map(f =>
          `• Gudang ${f.warehouseName || f.warehouseId}: ${f.error}\n  Produk: ${f.items.map(i => i.Name).join(', ')}`
        ).join('\n\n') +
        '\n\nProduk yang gagal tetap ada di daftar pengambilan untuk dicoba lagi.',
        'Sebagian Dokumen Gagal'
      );
    }

    return { documents, failed };
  }, [docTypeId, description, onError, toBaseQty]);

  return { submit, isSubmitting };
}