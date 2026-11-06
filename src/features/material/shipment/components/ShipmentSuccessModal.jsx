import React from 'react';
import { useNavigate } from 'react-router-dom';
import { COLOR, RADIUS } from '@/utils';
import { DeliveryIcon } from '@/shared/components';

// Struktur & gaya sengaja identik dengan GoodsReceiptSuccessModal.jsx.
// Bedanya: modal ini sadar status — 'Completed' vs 'Draft' (simpan draft, atau
// Complete gagal mis. stok tidak cukup → data.completeError terisi).

const ShipmentSuccessModal = ({ isOpen, data, onClose }) => {
  const navigate = useNavigate();
  const handleClose = () => {
    onClose();
    navigate('/dashboard');
  };
  if (!isOpen || !data) return null;

  const isCompleted = data.status === 'Completed';
  const hasError    = !!data.completeError;
  const titleColor  = isCompleted ? COLOR.success : '#b45309';
  const title       = isCompleted
    ? 'Pengiriman Barang Berhasil!'
    : hasError ? 'Draft Tersimpan, Belum Complete' : 'Draft Pengiriman Tersimpan';

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1500, padding: '16px',
    }}>
      <div style={{
        background: COLOR.surface, borderRadius: RADIUS.xl, padding: '28px 20px',
        maxWidth: '440px', width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
        textAlign: 'center', maxHeight: '90vh', overflowY: 'auto',
        position: 'relative',
      }}>
        <button
          onClick={handleClose}
          style={{
            position: 'absolute', top: '12px', right: '12px',
            background: 'rgba(0,0,0,0.06)', border: 'none', color: COLOR.textMd,
            borderRadius: '50%', width: '30px', height: '30px', fontSize: '16px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}
        >✕</button>

        <div style={{ fontSize: '52px', marginBottom: '8px' }}>
          <DeliveryIcon size={30} />
        </div>
        <div style={{ fontSize: '19px', fontWeight: 700, color: titleColor, marginBottom: '4px' }}>
          {title}
        </div>
        <div style={{ fontSize: '13px', color: COLOR.textMd, marginBottom: '18px' }}>
          {isCompleted
            ? <>Dokumen telah di-<em>Complete</em> dan stok gudang sudah berkurang.</>
            : <>Dokumen masih berstatus <em>Draft</em> — stok gudang belum berubah.</>}
        </div>

        {hasError && (
          <div style={{
            background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e',
            borderRadius: RADIUS.md, padding: '10px 12px', marginBottom: '16px',
            fontSize: '12px', textAlign: 'left', whiteSpace: 'pre-wrap',
          }}>
            ⚠ Gagal Complete:{'\n'}{data.completeError}
            {'\n\n'}Dokumen sudah tersimpan. Complete ulang dari halaman daftar Shipment
            (jangan buat baru supaya tidak dobel).
          </div>
        )}

        <div style={{
          background: isCompleted ? COLOR.successLt : '#fffbeb',
          border: `1px solid ${isCompleted ? '#bbf7d0' : '#fde68a'}`,
          borderRadius: RADIUS.md, padding: '14px', marginBottom: '16px', textAlign: 'left',
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: '12px' }}>
            {[
              ['Document No', data.documentNo,   true],
              ['Tanggal',     data.date,         false],
              ['Customer',    data.customerName, false],
              ['Total Item',  `${data.items.length} produk`, false],
            ].map(([label, val, bold]) => (
              <div key={label} style={{ marginBottom: '6px', width: '50%' }}>
                <span style={{ color: COLOR.textLt, fontSize: '11px' }}>{label}</span>
                <div style={{ fontSize: bold ? '16px' : '14px', fontWeight: bold ? 700 : 500, color: COLOR.textDk }}>
                  {val}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'left', marginBottom: '20px' }}>
          <div style={{ fontWeight: 600, fontSize: '12px', color: COLOR.textMd, marginBottom: '6px' }}>
            Detail Pengiriman:
          </div>
          {data.items.map((item, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: '13px', padding: '5px 0',
              borderBottom: i < data.items.length - 1 ? `1px solid #eee` : 'none',
            }}>
              <span style={{ color: '#333', flex: 1, marginRight: '8px' }}>{item.Name}</span>
              <span style={{ fontWeight: 700, color: COLOR.textDk, whiteSpace: 'nowrap' }}>
                {item.Qty} {item.selectedUom?.Name || item.C_UOM_Name || 'EA'}
              </span>
            </div>
          ))}
        </div>

        <button onClick={onClose} style={{
          background: COLOR.primary, color: '#fff', border: 'none',
          borderRadius: RADIUS.md, padding: '14px', fontWeight: 700,
          fontSize: '15px', cursor: 'pointer', width: '100%',
        }}>
          Kirim Barang Baru
        </button>
      </div>
    </div>
  );
};

export default ShipmentSuccessModal;
