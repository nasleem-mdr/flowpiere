import React from 'react';
import { useNavigate } from 'react-router-dom';
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { formatCurrency } from '@/utils/currency';
import { ShoppingCartIcon } from '@/shared/components'; // ⬅️ sesuaikan nama icon utk versi Complete kalau perlu

// Status dari usePurchaseOrderSubmit: 'Draft' | 'Completed' | 'Pending Approval'
// ('Pending Approval' = PO sudah di-Complete tapi tertahan di approval workflow, status IP).
const PENDING = 'Pending Approval';

const STATUS_STYLE = {
  Draft: {
    label: 'Draft',
    cardBg: COLOR.successLt, cardBorder: '#bbf7d0', sep: '#d1fae5',
    badgeBg: '#e5e7eb', badgeFg: '#374151',
  },
  Completed: {
    label: 'Completed',
    cardBg: COLOR.successLt, cardBorder: '#bbf7d0', sep: '#d1fae5',
    badgeBg: '#dcfce7', badgeFg: '#166534',
  },
  [PENDING]: {
    label: 'Menunggu Approval',
    cardBg: '#fffbeb', cardBorder: '#fde68a', sep: '#fef3c7',
    badgeBg: '#fef3c7', badgeFg: '#92400e',
  },
};
const styleOf = (status) => STATUS_STYLE[status] || STATUS_STYLE.Completed;

const PurchaseOrderSuccessModal = ({ isOpen, data, onClose }) => {
  const navigate = useNavigate();
  const handleClose = () => { onClose(); navigate('/dashboard'); };
  if (!isOpen || !data || data.length === 0) return null;

  const count      = data.length;
  const grandTotal = data.reduce((s, po) => s + po.total, 0);
  const isAllDraft     = data.every(po => po.status === 'Draft');
  const isAllPending   = data.every(po => po.status === PENDING);
  const isAllCompleted = data.every(po => po.status === 'Completed');
  const hasPending     = data.some(po => po.status === PENDING);

  const headerTitle = isAllDraft
    ? (count > 1 ? `${count} Draft PO Berhasil Dibuat!` : 'Draft PO Berhasil Dibuat!')
    : isAllPending
      ? (count > 1 ? `${count} Purchase Order Berhasil Diajukan!` : 'Purchase Order Berhasil Diajukan!')
      : (count > 1 ? `${count} Purchase Order Berhasil Dibuat!` : 'Purchase Order Berhasil Dibuat!');

  const headerSubtitle = isAllDraft
    ? 'Anda perlu tekan tombol Complete untuk meminta persetujuan.'
    : isAllPending
      ? (count > 1
          ? 'Dokumen sudah diajukan dan menunggu persetujuan (approval) sesuai alur Workflow. Status berubah menjadi Completed setelah disetujui.'
          : 'Dokumen sudah diajukan dan menunggu persetujuan (approval) sesuai alur Workflow. Status berubah menjadi Completed setelah disetujui.')
      : isAllCompleted
        ? (count > 1
            ? 'Karena berasal dari vendor berbeda, sistem membuat dokumen terpisah untuk masing-masing vendor.'
            : 'Dokumen telah di-Complete.')
        : 'Sebagian dokumen sudah Completed dan sebagian menunggu persetujuan (approval). Lihat status tiap dokumen di bawah.';

  // Warna ikon & judul mengikuti kondisi keseluruhan.
  const iconBg    = isAllDraft ? '#f3f4f6' : hasPending ? '#fef3c7' : COLOR.successLt;
  const iconColor = isAllDraft ? COLOR.danger : hasPending ? '#d97706' : COLOR.success;
  const titleColor = hasPending ? '#b45309' : COLOR.success;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1500, padding: '16px',
    }}>
      <div style={{
        background: COLOR.surface, borderRadius: RADIUS.xl, padding: '28px 20px',
        maxWidth: '480px', width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
        textAlign: 'center', maxHeight: '90vh', overflowY: 'auto', position: 'relative',
      }}>
        <button
          onClick={handleClose}
          style={{
            position: 'absolute', top: '12px', right: '12px',
            background: 'rgba(0,0,0,0.06)', border: 'none', color: COLOR.textMd,
            borderRadius: '50%', width: '30px', height: '30px', fontSize: '16px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}
        >✕</button>

        <div style={{
          width: '64px', height: '64px', borderRadius: '50%',
          background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 8px',
        }}>
          <ShoppingCartIcon size={30} color={iconColor} />
        </div>

        <div style={{ fontSize: '19px', fontWeight: 700, color: titleColor, marginBottom: '4px' }}>
          {headerTitle}
        </div>
        <div style={{ fontSize: '13px', color: COLOR.textMd, marginBottom: '18px' }}>
          {headerSubtitle}
        </div>

        {data.map((po, i) => {
          const st = styleOf(po.status);
          return (
            <div key={i} style={{
              background: st.cardBg, border: `1px solid ${st.cardBorder}`,
              borderRadius: RADIUS.md, padding: '14px', marginBottom: '12px', textAlign: 'left',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: '15px', color: COLOR.textDk }}>{po.documentNo}</span>
                  <span style={{
                    fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                    background: st.badgeBg, color: st.badgeFg, whiteSpace: 'nowrap',
                  }}>{st.label}</span>
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: COLOR.textDk }}>{formatCurrency(po.total)}</span>
              </div>
              <div style={{ fontSize: '11px', color: COLOR.textLt, marginBottom: '8px' }}>
                🚚 {po.vendorName} · {po.date}
              </div>
              {po.statusNote && (
                <div style={{
                  fontSize: '11px', color: '#92400e', background: '#fef3c7',
                  borderRadius: RADIUS.sm, padding: '6px 8px', marginBottom: '8px',
                }}>{po.statusNote}</div>
              )}
              {po.items.map((item, j) => (
                <div key={j} style={{
                  display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0',
                  borderTop: j > 0 ? `1px solid ${st.sep}` : 'none',
                }}>
                  <span style={{ color: '#333', flex: 1, marginRight: '8px' }}>{item.Name}</span>
                  <span style={{ color: COLOR.textMd, whiteSpace: 'nowrap' }}>
                    {item.Qty} {item.UomName} × {formatCurrency(item.Price)}
                  </span>
                </div>
              ))}
            </div>
          );
        })}

        {count > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', padding: '10px 14px',
            background: '#f0f4ff', borderRadius: RADIUS.md, marginBottom: '18px',
          }}>
            <span style={{ fontSize: '13px', color: COLOR.textMd }}>Total Keseluruhan</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: COLOR.textDk }}>{formatCurrency(grandTotal)}</span>
          </div>
        )}

        <button onClick={onClose} style={{
          background: COLOR.primary, color: '#fff', border: 'none',
          borderRadius: RADIUS.md, padding: '14px', fontWeight: 700,
          fontSize: '15px', cursor: 'pointer', width: '100%',
        }}>
          Buat PO Baru
        </button>
      </div>
    </div>
  );
};

export default PurchaseOrderSuccessModal;