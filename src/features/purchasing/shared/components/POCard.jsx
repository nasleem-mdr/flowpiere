import React from 'react';
import { COLOR, RADIUS } from '@/utils/styleTokens';

// CHANGE vs original: `po.VendorName` -> `po.VendorName || po.CustomerName`
// so the same card works for both Purchase (vendor) and Sales (customer)
// documents. No behavior change for existing PO callers.
const POCard = ({ po, onClick }) => {
  const partnerName = po.VendorName || po.CustomerName;
  const formattedDate  = po.DateOrdered ? new Date(po.DateOrdered).toLocaleDateString('id-ID') : '-';
  const formattedTotal = po.GrandTotal?.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 });
  const sisaQty = po.lines.reduce((s, l) => s + l.qtyOutstanding, 0);

  return (
    <div
      onClick={() => !po.isFullyInvoiced && onClick(po)}
      style={{
        background: COLOR.surface, border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md,
        padding: '12px', cursor: po.isFullyInvoiced ? 'not-allowed' : 'pointer',
        opacity: po.isFullyInvoiced ? 0.55 : 1, position: 'relative', WebkitTapHighlightColor: 'transparent',
      }}
    >
      {po.isFullyInvoiced && (
        <span style={{ position: 'absolute', top: '8px', right: '8px', background: '#9ca3af', color: '#fff', fontSize: '10px', fontWeight: 700, borderRadius: '10px', padding: '2px 8px' }}>
          Sudah Ditagih
        </span>
      )}
      <div style={{ fontWeight: 700, fontSize: '13px', color: COLOR.textDk }}>{po.DocumentNo}</div>
      <div style={{ fontSize: '12px', color: COLOR.textLt, marginTop: '2px' }}>{partnerName}</div>
      <div style={{ fontSize: '11px', color: COLOR.textLt, marginTop: '4px' }}>📅 {formattedDate}</div>
      <div style={{ fontSize: '13px', fontWeight: 700, color: COLOR.primary, marginTop: '6px' }}>{formattedTotal}</div>
      {!po.isFullyInvoiced && (
        <div style={{ fontSize: '11px', color: COLOR.success, marginTop: '2px' }}>Sisa {sisaQty} unit blm ditagih</div>
      )}
    </div>
  );
};

export default POCard;
