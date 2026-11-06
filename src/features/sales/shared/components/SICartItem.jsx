import React from 'react';
import QtyStepper from '@/shared/components/common/QtyStepper';
import UomSelector from '@/shared/components/product/UomSelector';
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { formatCurrency, formatPriceDisplay, parsePriceInput } from '@/utils/currency';
import PriceInput from '@/shared/components/common/PriceInput';

const fmtQty = (n) => {
  const rounded = Math.round(n * 1000) / 1000;
  return rounded % 1 === 0 ? String(rounded) : String(rounded);
};

// ─────────────────────────────────────────────────────────────────────────────
// SICartItem.jsx
// Padanan POCartItem.jsx untuk Sales Invoice — BEDA UTAMA: TIDAK ada badge
// vendor/customer per-baris (🚚 di POCartItem), karena satu Sales Invoice
// selalu untuk SATU customer yang sama untuk seluruh cart (dipilih 1x di
// header container, bukan per item seperti Purchasing yang bisa multi-vendor
// dalam 1 cart). Selain itu strukturnya sama persis: UOM selector, input
// harga, qty stepper, line amount dihitung live (Qty × Price).
// ─────────────────────────────────────────────────────────────────────────────
const SICartItem = ({ 
  item, itemKey, onRemove, onQtyChange, onPriceChange, 
  onUomChange, onDescriptionChange, onDateServiceChange, showDateService = false,
  priceLocked = false,   // pembatasan field: harga tampil tapi tidak bisa diubah
  priceHidden = false,   // pembatasan field: input harga disembunyikan
}) => {
  const lineAmount = item.Qty * (item.Price || 0);

  const isConverted = item.BaseUOM_ID && item.C_UOM_ID !== item.BaseUOM_ID
    && item.UnitsPerBaseUom && item.UnitsPerBaseUom !== 1;
  const convertedQty = isConverted ? item.Qty * item.UnitsPerBaseUom : null;
  const handleUomChange = (_productId, chosenUom) => onUomChange(itemKey, chosenUom);
  const descriptionValue = item.Description ?? item.Name;
  
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
        {showDateService && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
              <span style={{ fontSize: '10px', color: COLOR.textLt, whiteSpace: 'nowrap' }}>Date Service:</span>
              <input
                type="date"
                value={item.DateService || ''}
                onChange={e => onDateServiceChange(itemKey, e.target.value)}
                style={{
                  padding: '4px 6px', border: `1px solid ${COLOR.border}`,
                  borderRadius: RADIUS.sm, fontSize: '11px', color: COLOR.textDk, background: '#fff',
                }}
              />
            </div>
          )}
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
        {!priceHidden && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '11px', color: COLOR.textLt }}>Price:</span>
            {priceLocked ? (
              // Terkunci: tampilkan harga apa adanya, bukan input — tidak bergantung
              // pada dukungan disabled/readOnly di PriceInput.
              <span
                title="Role Anda tidak dapat mengubah harga"
                style={{
                  display: 'inline-block', width: '90px', boxSizing: 'border-box',
                  textAlign: 'right', padding: '5px 6px',
                  border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm,
                  fontSize: '12px', fontWeight: 600, color: COLOR.textDk,
                  background: '#f3f4f6', cursor: 'not-allowed',
                }}
              >
                {formatCurrency(item.Price || 0)}
              </span>
            ) : (
              <PriceInput
                value={item.Price}
                onChange={val => onPriceChange(itemKey, val)}
                style={{
                  width: '90px', textAlign: 'right', padding: '5px 6px', border: `1px solid ${COLOR.border}`,
                  borderRadius: RADIUS.sm, fontSize: '12px', fontWeight: 600, color: COLOR.textDk,
                }}
              />
            )}
          </div>
        )}
        <span style={{ fontSize: '11px', color: COLOR.textLt }}>Qty</span>
        <QtyStepper value={item.Qty} onChange={q => onQtyChange(itemKey, q)} size="sm" />
        
        <input
          type="text"
          value={descriptionValue}
          onChange={e => onDescriptionChange(itemKey, e.target.value)}
          placeholder="Deskripsi"
          style={{
            flex: 1, minWidth: '80px', padding: '5px 6px',
            border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm,
            fontSize: '11px', color: COLOR.textLt, background: '#fff',
          }}
        />
         = {formatCurrency(lineAmount)}
      </div>

    </div>
  );
};

export default SICartItem;