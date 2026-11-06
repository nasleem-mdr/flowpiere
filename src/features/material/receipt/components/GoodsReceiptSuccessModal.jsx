import React from 'react';
import { useNavigate } from 'react-router-dom';
import { COLOR, RADIUS } from '@/utils';
import { DeliveryIcon } from '@/shared/components'; 

// Struktur & gaya sengaja dibuat identik dengan RequisitionSuccessModal.jsx
// supaya konsisten secara visual antar modul.

const GoodsReceiptSuccessModal = ({ isOpen, data, onClose }) => {
  const navigate = useNavigate();
  const handleClose = () => {
    onClose();
    navigate('/dashboard');
  };
  if (!isOpen || !data) return null;
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
          < DeliveryIcon size={30}/>
          </div>
        <div style={{ fontSize: '19px', fontWeight: 700, color: COLOR.success, marginBottom: '4px' }}>
          Penerimaan Barang Berhasil!
        </div>
        <div style={{ fontSize: '13px', color: COLOR.textMd, marginBottom: '18px' }}>
          Dokumen telah di-<em>Complete</em> dan stok gudang sudah diperbarui.
        </div>

        <div style={{
          background: COLOR.successLt, border: `1px solid #bbf7d0`,
          borderRadius: RADIUS.md, padding: '14px', marginBottom: '16px', textAlign: 'left',
        }}>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            rowGap: '12px' /* Jarak antar baris atas dan bawah */
          }}>

          {[
            ['Document No', data.documentNo, true],
            ['Tanggal',     data.date,        false],
            ['Vendor',      data.vendorName,  false],
            ['Total Item',  `${data.items.length} produk`, false],
          ].map(([label, val, bold]) => (
            <div key={label} style={{ marginBottom: '6px' }}>
              <span style={{ 
                color: COLOR.textLt, 
                fontSize: '11px' }}>
                  {label}</span>
              <div style={{ fontSize: bold ? '16px' : '14px', fontWeight: bold ? 700 : 500, color: COLOR.textDk }}>
                {val}
              </div>
            </div>
          ))}
        </div>
      </div>
        <div style={{ textAlign: 'left', marginBottom: '20px' }}>
          <div style={{ fontWeight: 600, fontSize: '12px', color: COLOR.textMd, marginBottom: '6px' }}>
            Detail Penerimaan:
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
          Terima Barang Baru
        </button>
      </div>
    </div>
  );
};

export default GoodsReceiptSuccessModal;
