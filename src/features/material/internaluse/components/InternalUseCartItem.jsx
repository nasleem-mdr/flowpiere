/** Padanan POCartItem.jsx untuk Internal Use — badge-nya Charge (bukan
* vendor), ada info locator sumber stok (read-only), dan UomSelector untuk
* entry qty dalam UOM yang familiar bagi user (M_InventoryLine tidak punya
* C_UOM_ID, jadi konversi ke UOM dasar dilakukan di frontend — lihat
* useUomConversion.jsx).
*
* Qty dalam UOM dasar (buat dibandingkan ke QtyOnHand yang juga UOM dasar).
* ⚠️ WAJIB pakai toBaseQty() (bukan `item.Qty * multiplyRate` manual) —
* MultiplyRate mentah dari C_UOM_Conversion punya aturan pembagian khusus
* saat nilainya < 1 (mis. Rim = 0.002 -> base qty = qty / 0.002 = qty*500,
* BUKAN qty * 0.002). Lihat komentar "RUMUS SAKTI DIBALIK" di
* useUomConversion.jsx — sebelumnya di sini pakai perkalian langsung,
* itu sebabnya 1 Rim tampil sebagai "0.002 Lembar" alih-alih "500 Lembar".
*/ 

import React from 'react';
import { useUomConversion } from '@/shared/hooks/useUomConversion';
import { 
  QtyStepper, 
  UomSelector, 
} from '@/shared/components';
import { 
  COLOR, 
  RADIUS, 
} from '@/utils/styleTokens';

const InternalUseCartItem = ({ item, onRemove, onQtyChange, onChargeClick, onUomChange }) => {
  const hasCharge = !!item.C_Charge_ID;
  const { toBaseQty } = useUomConversion();
  
  const qtyInBaseUom = toBaseQty(item.Qty, item.selectedUom);
  const overStock = item.QtyOnHand != null && qtyInBaseUom > item.QtyOnHand;

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
            📍 {item.LocatorName || '-'}
            {item.QtyOnHand != null && (
              <span> · stok {item.QtyOnHand} {item.uomOptions?.[0]?.Name || item.UomName}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => onRemove(item.M_Product_ID)}
          style={{
            background: COLOR.dangerLt, border: 'none', cursor: 'pointer',
            color: COLOR.danger, fontSize: '13px', padding: '5px 8px',
            borderRadius: RADIUS.sm, flexShrink: 0, lineHeight: 1, height: 'fit-content',
          }}
        >✕</button>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => onChargeClick(item)}
          style={{
            background: hasCharge ? COLOR.vendorBg : COLOR.dangerLt,
            color: hasCharge ? COLOR.vendor : COLOR.danger,
            border: 'none', borderRadius: RADIUS.sm, padding: '5px 9px',
            fontSize: '11px', fontWeight: 700, cursor: 'pointer',
            maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          🏷️ {hasCharge ? item.ChargeName : 'Pilih Charge'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <QtyStepper value={item.Qty} onChange={q => onQtyChange(item.M_Product_ID, q)} size="sm" />
          <UomSelector item={item} onUomChange={(productId, uom) => onUomChange(productId, uom)} />
        </div>
      </div>

      {item.selectedUom && item.selectedUom.multiplyRate !== 1 && (
        <div style={{ marginTop: '6px', fontSize: '11px', color: COLOR.textLt }}>
          = {qtyInBaseUom} {item.uomOptions?.[0]?.Name || item.UomName} (UOM dasar)
        </div>
      )}

      {overStock && (
        <div style={{ marginTop: '6px', fontSize: '11px', color: COLOR.danger, fontWeight: 600 }}>
          ⚠ Qty ({qtyInBaseUom} {item.uomOptions?.[0]?.Name}) melebihi stok tersedia ({item.QtyOnHand})
        </div>
      )}
    </div>
  );
};

export default InternalUseCartItem;