import React from 'react';
import QtyStepper from '@/shared/components/common/QtyStepper';
import UomSelector from '@/shared/components/product/UomSelector';  
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { formatCurrency } from '@/utils/currency';

//const fmtRp = (n) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

// Format qty untuk preview konversi — buang residu floating point (mis.
// 5.999999999998 → 6) tanpa memaksa semua angka jadi bilangan bulat (qty
// pecahan yang memang valid, mis. 2.5, tetap tampil apa adanya).
const fmtQty = (n) => {
  const rounded = Math.round(n * 1000) / 1000;
  return rounded % 1 === 0 ? String(rounded) : String(rounded);
};

// ─────────────────────────────────────────────────────────────────────────────
// POCartItem.jsx
// Padanan CartItem.jsx untuk modul Purchasing — ditambah 2 kontrol yang tidak
// ada di modul lain: badge vendor (klik untuk ganti) dan input harga satuan.
// Line Amount dihitung langsung di render (Qty × Price), tidak disimpan
// terpisah supaya tidak pernah stale saat qty/harga diubah.
//
// ── PREVIEW KONVERSI UOM ────────────────────────────────────────────────────
// Kalau item pakai UOM yang BUKAN UOM dasar produk (mis. "6-Pack" bukan
// "pcs"), tampilkan preview "≈ 6 pcs" di bawah nama UOM — dihitung dari
// item.Qty × item.UnitsPerBaseUom (rasio yang sudah dilekatkan saat item
// ditambahkan, lihat PurchasingContainer.jsx & RequisitionToPOImportModal.jsx).
// Dihitung dari Qty SAAT INI (bukan angka statis), jadi tetap akurat kalau
// user mengubah Qty lewat QtyStepper di bawah — preview ikut update live.
// ─────────────────────────────────────────────────────────────────────────────
const POCartItem = ({ item, itemKey, onRemove, onQtyChange, onPriceChange, onUomChange, onVendorClick }) => {
  const lineAmount = item.Qty * (item.Price || 0);
  const hasVendor = !!item.C_BPartner_ID;

  const isConverted = item.BaseUOM_ID && item.C_UOM_ID !== item.BaseUOM_ID
    && item.UnitsPerBaseUom && item.UnitsPerBaseUom !== 1;
  const convertedQty = isConverted ? item.Qty * item.UnitsPerBaseUom : null;
  const handleUomChange = (_productId, chosenUom) => onUomChange(itemKey, chosenUom);
  return (
    <div style={{
      background: '#f7f9ff', border: `1px solid ${COLOR.border}`,
      borderRadius: RADIUS.md, padding: '10px', marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600, fontSize: '13px', color: COLOR.textDk,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{item.Name}</div>
          <div style={{ fontSize: '11px', color: COLOR.textLt }}>
            <span>{item.UomName || item.C_UOM_Name}</span>
            {onUomChange && <UomSelector item={item} onUomChange={handleUomChange} />}
            </div>
          {isConverted && (
            <div style={{ fontSize: '10px', color: COLOR.vendor, fontWeight: 600, marginTop: '1px' }}>
              ≈ {fmtQty(convertedQty)} {item.BaseUOMName || 'unit dasar'}
            </div>
          )}
        </div>
        <button
          onClick={() => onRemove(itemKey)}
          style={{
            background: COLOR.dangerLt, border: 'none', cursor: 'pointer',
            color: COLOR.danger, fontSize: '13px', padding: '5px 8px',
            borderRadius: RADIUS.sm, flexShrink: 0, lineHeight: 1, height: 'fit-content',
          }}
        >✕</button>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => onVendorClick(item, itemKey)}
          style={{
            background: hasVendor ? COLOR.vendorBg : COLOR.dangerLt,
            color: hasVendor ? COLOR.vendor : COLOR.danger,
            border: 'none', borderRadius: RADIUS.sm, padding: '5px 9px',
            fontSize: '11px', fontWeight: 700, cursor: 'pointer',
            maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          🚚 {hasVendor ? item.VendorName : 'Pilih Vendor'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ fontSize: '11px', color: COLOR.textLt }}>Rp</span>
          <input
            type="number"
            min="0"
            value={item.Price}
            onChange={e => onPriceChange(itemKey, parseFloat(e.target.value) || 0)}
            style={{
              width: '90px', padding: '5px 6px', border: `1px solid ${COLOR.border}`,
              borderRadius: RADIUS.sm, fontSize: '12px', fontWeight: 600, color: COLOR.textDk,
            }}
          />
        </div>

        <QtyStepper value={item.Qty} onChange={q => onQtyChange(itemKey, q)} size="sm" />
      </div>

      <div style={{ textAlign: 'right', marginTop: '6px', fontSize: '12px', fontWeight: 700, color: COLOR.textDk }}>
        = {formatCurrency(lineAmount)}
      </div>
    </div>
  );
};

export default POCartItem;
