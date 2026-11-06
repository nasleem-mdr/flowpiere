/** ─────────────────────────────────────────────────────────────────────────────
* InventoryPickerModal.jsx
* "Product Info" ala iDempiere — menampilkan produk beserta qty on hand per
* gudang (filterable), dengan checklist supaya user bisa pilih BANYAK produk
* sekaligus lalu import semuanya ke cart dalam 1 klik (bukan 1-per-1 seperti
* ProductDetailSheet biasa).
*
* Tiap baris yang dicentang otomatis bawa serta:
*   - M_Warehouse_ID + WarehouseName — gudang yang SEDANG AKTIF dipilih di
*     dropdown modal ini (bisa beda dari gudang default sesi login). Field
*     ini WAJIB ada karena useInternalUseSubmit mengelompokkan cart per
*     M_Warehouse_ID untuk dipecah jadi beberapa dokumen M_Inventory.
*   - M_Locator_ID hasil resolve dari useProductStock (locator dengan qty
*     terbanyak untuk produk itu di gudang terpilih)
*   - C_Charge_ID hasil suggestion dari M_Product.C_Charge_ID (kalau
*     ada) — kalau tidak ada, item tetap bisa diimport tapi ditandai perlu
*     dilengkapi Charge manual di cart (badge merah, sama seperti pola
*     vendor di modul Purchasing).
* ─────────────────────────────────────────────────────────────────────────────
*/

import React, { useEffect, useState } from 'react';
import { useProductStock } from '@/shared/hooks';
import { 
  COLOR, 
  RADIUS, 
} from '@/utils/styleTokens';

const InventoryPickerModal = ({ isOpen, defaultWarehouseId, onClose, onImport }) => {
  const {
    warehouses, loadingWarehouses, fetchWarehouses,
    stockList, loadingStock, fetchProductsWithStock,
  } = useProductStock();

  const [warehouseId, setWarehouseId] = useState(null);
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState({});  // { [M_Product_ID]: true }
  const [qtyMap, setQtyMap]   = useState({});  // { [M_Product_ID]: number }
  const [uomMap, setUomMap]   = useState({});  // { [M_Product_ID]: { C_UOM_ID, Name, multiplyRate } }

  useEffect(() => {
    if (isOpen) {
      setChecked({});
      setQtyMap({});
      setUomMap({});
      setSearch('');
      fetchWarehouses().then((list) => {
        const initial = defaultWarehouseId || list[0]?.M_Warehouse_ID || null;
        setWarehouseId(initial);
        if (initial) fetchProductsWithStock({ warehouseId: initial, search: '' });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleWarehouseChange = (id) => {
    setWarehouseId(id);
    setChecked({});
    setQtyMap({});
    setUomMap({});
    fetchProductsWithStock({ warehouseId: id, search });
  };

  const handleSearch = (val) => {
    setSearch(val);
    fetchProductsWithStock({ warehouseId, search: val });
  };

  const toggleCheck = (product) => {
    setChecked(prev => {
      const next = { ...prev, [product.M_Product_ID]: !prev[product.M_Product_ID] };
      if (next[product.M_Product_ID] && !qtyMap[product.M_Product_ID]) {
        setQtyMap(q => ({ ...q, [product.M_Product_ID]: 1 }));
        setUomMap(u => ({ ...u, [product.M_Product_ID]: product.selectedUom || product.uomOptions?.[0] }));
      }
      return next;
    });
  };

  const checkedCount = Object.values(checked).filter(Boolean).length;

  const handleImport = () => {
    // Nama gudang yang sedang aktif di modal ini — dibawa serta ke tiap
    // item yang diimport, supaya Container/useInternalUseSubmit tahu item
    // ini milik gudang mana (dan bisa ditampilkan di dropdown 🏭 cart item).
    const activeWarehouseName = warehouses.find(w => w.M_Warehouse_ID === warehouseId)?.Name;

    const items = stockList
      .filter(p => checked[p.M_Product_ID])
      .map(p => ({
        M_Product_ID:   p.M_Product_ID,
        Name:           p.Name,
        UomName:        p.UomName,
        Qty:            parseFloat(qtyMap[p.M_Product_ID] || 1),
        QtyOnHand:      p.QtyOnHand,
        M_Warehouse_ID: warehouseId,
        WarehouseName:  activeWarehouseName,
        M_Locator_ID:   p.M_Locator_ID,
        LocatorName:    p.LocatorName,
        C_Charge_ID:    p.DefaultChargeId,
        ChargeName:     p.DefaultChargeName,
        uomOptions:     p.uomOptions,
        selectedUom:    uomMap[p.M_Product_ID] || p.selectedUom,
      }));
    onImport(items);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1600, padding: '16px',
    }}>
      <div style={{
        background: COLOR.surface, borderRadius: RADIUS.xl,
        width: '100%', maxWidth: '640px', maxHeight: '86vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 18px', borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: '15px', color: COLOR.textDk }}>📦 Info Stok Produk</span>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(0,0,0,0.06)', border: 'none', color: COLOR.textMd,
              borderRadius: '50%', width: '30px', height: '30px', fontSize: '16px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* Filter gudang + search */}
        <div style={{ padding: '14px 18px 0', flexShrink: 0, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select
            value={warehouseId ?? ''}
            onChange={e => handleWarehouseChange(parseInt(e.target.value))}
            disabled={loadingWarehouses}
            style={{
              padding: '9px 10px', border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.md,
              fontSize: '13px', minWidth: '160px', background: '#fff',
            }}
          >
            {warehouses.map(w => (
              <option key={w.M_Warehouse_ID} value={w.M_Warehouse_ID}>{w.Name}</option>
            ))}
          </select>
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Cari nama produk..."
            style={{
              flex: 1, minWidth: '160px', boxSizing: 'border-box', padding: '9px 12px',
              border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.md,
              fontSize: '13px', outline: 'none',
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px', minHeight: 0 }}>
          {loadingStock ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>⏳ Memuat stok...</div>
          ) : stockList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>
              Tidak ada produk dengan stok di gudang ini.
            </div>
          ) : (
            stockList.map(p => {
              const isChecked = !!checked[p.M_Product_ID];
              return (
                <div
                  key={p.M_Product_ID}
                  onClick={() => toggleCheck(p)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    background: isChecked ? '#eff6ff' : '#f7f9ff',
                    border: `1.5px solid ${isChecked ? COLOR.primary : COLOR.border}`,
                    borderRadius: RADIUS.md, padding: '10px 12px', marginBottom: '8px', cursor: 'pointer',
                  }}
                >
                  <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(p)} onClick={e => e.stopPropagation()} style={{ width: '18px', height: '18px', flexShrink: 0 }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: COLOR.textDk }}>{p.Name}</div>
                    <div style={{ fontSize: '11px', color: COLOR.textLt }}>
                      Stok: {p.QtyOnHand} {p.UomName} · {p.LocatorName || '-'}
                      {!p.DefaultChargeId && <span style={{ color: COLOR.danger }}> · Charge belum ada default</span>}
                    </div>
                  </div>

                  {isChecked && (
                    <>
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={qtyMap[p.M_Product_ID] ?? 1}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setQtyMap(q => ({ ...q, [p.M_Product_ID]: e.target.value }))}
                        style={{
                          width: '64px', padding: '6px 8px', border: `1px solid ${COLOR.border}`,
                          borderRadius: RADIUS.sm, fontSize: '12px', fontWeight: 600, flexShrink: 0,
                        }}
                      />
                      {p.uomOptions && p.uomOptions.length > 1 ? (
                        <select
                          value={uomMap[p.M_Product_ID]?.C_UOM_ID ?? p.uomOptions[0].C_UOM_ID}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            const chosen = p.uomOptions.find(u => String(u.C_UOM_ID) === e.target.value);
                            if (chosen) setUomMap(u => ({ ...u, [p.M_Product_ID]: chosen }));
                          }}
                          style={{
                            fontSize: '11px', color: COLOR.primary, background: COLOR.vendorBg,
                            border: '1px solid #c5d0e8', borderRadius: RADIUS.sm, padding: '6px 4px',
                            flexShrink: 0, maxWidth: '80px',
                          }}
                        >
                          {p.uomOptions.map(u => (
                            <option key={u.C_UOM_ID} value={u.C_UOM_ID}>{u.Name}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ fontSize: '11px', color: COLOR.textLt, flexShrink: 0 }}>{p.UomName}</span>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {checkedCount > 0 && (
          <div style={{ borderTop: `1px solid ${COLOR.border}`, padding: '14px 18px', flexShrink: 0 }}>
            <button
              onClick={handleImport}
              style={{
                background: COLOR.primary, color: '#fff', border: 'none',
                padding: '13px', width: '100%', borderRadius: RADIUS.md,
                fontWeight: 700, fontSize: '14px', cursor: 'pointer',
              }}
            >
              📥 Import {checkedCount} Produk ke Daftar Pengambilan
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryPickerModal;
