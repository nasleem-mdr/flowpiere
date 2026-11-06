import React from 'react';
import { useNavigate } from 'react-router-dom';
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { RequisitionIcon } from '@/shared/components/icon';

const RequisitionSuccessModal = ({ isOpen, data, onClose }) => {
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
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',     
          fontSize: '52px', 
          marginBottom: '8px' 
        }}>
          <RequisitionIcon size={42} color={COLOR.success}/>
        </div>
        <div style={{ fontSize: '19px', fontWeight: 700, color: COLOR.success, marginBottom: '4px' }}>
          {data.status === 'Draft' ? 'Draft Tersimpan!' : 'Requisition Berhasil!'}
        </div>
        <div style={{ fontSize: '13px', color: COLOR.textMd, marginBottom: '18px' }}>
          {data.status === 'Draft'
            ? 'Dokumen disimpan sebagai draft dan belum masuk ke workflow. Anda bisa membukanya lagi lewat daftar Requisition untuk melengkapi atau submit.'
            : (<>Dokumen telah di-<em>Complete</em> dan diteruskan ke workflow pembelian.</>)}
        </div>

        <div style={{
          background: COLOR.successLt, 
          border: `1px solid #bbf7d0`,
          borderRadius: RADIUS.md, 
          padding: '14px', 
          marginBottom: '16px', 
          textAlign: 'left',
        }}>
          {/* Pembungkus Grid/Flexbox untuk membuat 2 kolom */}
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            rowGap: '12px' /* Jarak antar baris atas dan bawah */
          }}>
            {[
              ['Nomor',       data.documentNo,          true],
              ['Tanggal',     data.date,                false],
              ['Requester',   data.requesterName,       false],
              ['Total Item',  `${data.items.length} product`, false],
            ].map(([label, val, bold]) => (
              <div key={label} style={{ flex: '0 0 50%', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'baseline' }}>
                  {/* Label (Nomor, Tanggal, dll) */}
                  <span style={{ 
                    color: COLOR.textLt, 
                    fontSize: '13px', 
                    fontWeight: 500 
                  }}>
                    {label}:
                  </span>
                  
                  {/* Nilai / Value */}
                  <span style={{ 
                    fontSize: bold ? '15px' : '13px', 
                    fontWeight: bold ? 700 : 500, 
                    color: COLOR.textDk 
                  }}>
                    {val}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'left', marginBottom: '20px' }}>
          <div style={{ fontWeight: 600, fontSize: '12px', color: COLOR.textMd, marginBottom: '6px' }}>
            Detail Permintaan:
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
          Buat FPB Baru
        </button>
      </div>
    </div>
  );
};

export default RequisitionSuccessModal;
