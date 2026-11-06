import React from 'react';
import { COLOR, RADIUS } from '@/utils/styleTokens';

const UomSelector = ({ item, onUomChange }) => {
  if (!item.uomOptions || item.uomOptions.length <= 1) {
    return (
      <span style={{ fontSize: '11px', color: COLOR.textLt, marginLeft: '4px' }}>
        {item.selectedUom?.Name || item.C_UOM_Name || 'EA'}
      </span>
    );
  }
  return (
    <select
      value={item.selectedUom?.C_UOM_ID || item.C_UOM_ID}
      onChange={e => {
        const chosen = item.uomOptions.find(u => String(u.C_UOM_ID) === e.target.value);
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
        <option key={u.C_UOM_ID} value={String(u.C_UOM_ID)}>{u.Name}</option>
      ))}
    </select>
  );
};

export default UomSelector;
