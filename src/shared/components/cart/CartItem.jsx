import React from 'react';
import QtyStepper from '@/shared/components/common/QtyStepper';
import UomSelector from '@/shared/components/product/UomSelector';
import { COLOR, RADIUS } from '@/utils/styleTokens';

const CartItem = ({ item, onRemove, onQtyChange, onUomChange }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '10px 10px', background: '#f7f9ff',
    borderRadius: RADIUS.md, marginBottom: '8px',
    border: `1px solid ${COLOR.border}`,
  }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{
        fontWeight: 600, fontSize: '13px', color: COLOR.textDk,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {item.Name}
      </div>
      <div style={{ fontSize: '11px', color: COLOR.textMd, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px' }}>
        <span>{item.Value}</span>
        <UomSelector item={item} onUomChange={onUomChange} />
      </div>
    </div>

    <QtyStepper value={item.Qty} onChange={q => onQtyChange(item.M_Product_ID, q)} size="sm" />
    
    <button
      onTouchEnd={e => { e.preventDefault(); onRemove(item.M_Product_ID); }}
      onClick={() => onRemove(item.M_Product_ID)}
      style={{
        background: COLOR.dangerLt, border: 'none', cursor: 'pointer',
        color: COLOR.danger, fontSize: '14px', padding: '6px 8px',
        borderRadius: RADIUS.sm, flexShrink: 0, lineHeight: 1,
      }}
    >✕</button>
  </div>
);

export default CartItem;
