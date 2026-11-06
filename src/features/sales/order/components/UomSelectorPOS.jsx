import React from 'react';
import { COLOR, RADIUS } from '@/utils/styleTokens';

const UomSelectorPOS = ({ item, onUomChange }) => {
  if (!item.uomOptions || item.uomOptions.length <= 1) {
    return (
      <span style={{ fontSize: '11px', color: COLOR.textLt, marginLeft: '4px' }}>
        {item.selectedUOM?.name || 'EA'}
      </span>
    );
  }
  return (
    <select
      value={item.selectedUOM?.id ?? ''}
      onChange={e => {
        const chosen = item.uomOptions.find(u => String(u.id) === e.target.value);
        if (chosen) onUomChange(item.M_Product_ID, chosen);
      }}
      onClick={e => e.stopPropagation()}
      style={{
        fontSize: '11px', color: COLOR.primary, background: COLOR.vendorBg,
        border: '1px solid #c5d0e8', borderRadius: RADIUS.sm, padding: '1px 4px',
        cursor: 'pointer', marginLeft: '4px', maxWidth: '90px',
      }}
    >
      {item.uomOptions.map(u => (
        <option key={u.id} value={String(u.id)}>{u.name}</option>
      ))}
    </select>
  );
};

export default UomSelectorPOS;