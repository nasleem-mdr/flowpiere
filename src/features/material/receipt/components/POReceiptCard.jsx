/** ─────────────────────────────────────────────────────────────────────────────
* POReceiptCard.jsx
* Kartu satu PO di grid Goods Receipt. Menampilkan berapa item yang belum
* diterima. `disabled` = vendor PO berbeda dari vendor yang sedang terkunci
* di cart (dikunci sampai cart dikosongkan).
* ─────────────────────────────────────────────────────────────────────────────
*/
import React from 'react';
import { COLOR, RADIUS } from '@/utils/styleTokens';

const POReceiptCard = ({ po, onClick, disabled = false }) => (
  <button
    type="button"
    onClick={() => onClick(po)}
    title={disabled ? 'Vendor berbeda dengan item di Daftar Penerimaan. Kosongkan daftar dulu.' : undefined}
    style={{
      display: 'flex', flexDirection: 'column', gap: '6px',
      textAlign: 'left', width: '100%', boxSizing: 'border-box',
      background: COLOR.surface, border: `1px solid ${COLOR.border}`,
      borderRadius: RADIUS.md, padding: '12px', cursor: 'pointer',
      opacity: disabled ? 0.45 : 1,
      WebkitTapHighlightColor: 'transparent',
    }}
  >
    <div style={{ fontWeight: 700, fontSize: '13px', color: COLOR.textDk }}>{po.DocumentNo}</div>

    <div style={{ fontSize: '12px', color: COLOR.textMd, lineHeight: 1.3 }}>
      {po.VendorName || '-'}
    </div>

    <div style={{ fontSize: '11px', color: COLOR.textLt }}>
      {po.DateOrdered ? new Date(po.DateOrdered).toLocaleDateString('id-ID') : '-'}
    </div>

    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
      <span style={{
        fontSize: '11px', fontWeight: 700, color: COLOR.primary,
        background: '#eef2ff', borderRadius: '20px', padding: '2px 8px',
      }}>
        {po.outstandingLines} dari {po.totalLines} item belum diterima
      </span>

      {po.hasDelivered && (
        <span style={{
          fontSize: '11px', fontWeight: 600, color: COLOR.success,
          background: COLOR.successLt, borderRadius: '20px', padding: '2px 8px',
        }}>
          Sebagian diterima
        </span>
      )}

      {po.hasReserved && (
        <span style={{
          fontSize: '11px', fontWeight: 600, color: '#b45309',
          background: '#fef3c7', borderRadius: '20px', padding: '2px 8px',
        }}>
          🔒 Ada Receipt draft
        </span>
      )}
    </div>
  </button>
);

export default POReceiptCard;
