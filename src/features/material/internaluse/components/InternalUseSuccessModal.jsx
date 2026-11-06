/** Struktur & gaya identik dengan GoodsReceiptSuccessModal.jsx, disesuaikan
* untuk field Internal Use (Charge & Locator, bukan vendor).
*
* ⚠️ `data` sekarang berbentuk { documents: [...] } — BISA lebih dari 1
* dokumen M_Inventory sekaligus, karena useInternalUseSubmit memecah
* submission per M_Warehouse_ID (1 cart bisa berisi produk dari beberapa
* gudang berbeda). Tiap entri di data.documents:
*   { documentNo, warehouseId, warehouseName, date, items }
*/

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  COLOR, 
  RADIUS, 
} from '@/utils/styleTokens';

const InternalUseSuccessModal = ({ isOpen, data, onClose }) => {
  const navigate = useNavigate();
  const handleClose = () => { onClose(); navigate('/dashboard'); };

  const documents = data?.documents ?? [];
  if (!isOpen || !data || documents.length === 0) return null;

  const totalItemCount = documents.reduce((s, d) => s + d.items.length, 0);
  const isMulti = documents.length > 1;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1500, padding: '16px',
    }}>
      <div style={{
        background: COLOR.surface, borderRadius: RADIUS.xl, padding: '28px 20px',
        maxWidth: '460px', width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
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

        <div style={{ fontSize: '52px', marginBottom: '8px' }}>📤✅</div>
        <div style={{ fontSize: '19px', fontWeight: 700, color: COLOR.success, marginBottom: '4px' }}>
          Pengambilan Barang Berhasil!
        </div>
        <div style={{ fontSize: '13px', color: COLOR.textMd, marginBottom: '18px' }}>
          {isMulti
            ? `${documents.length} dokumen di-Complete (dipecah per gudang) dan stok sudah diperbarui.`
            : 'Dokumen telah di-Complete dan stok gudang sudah diperbarui.'}
        </div>

        {documents.map((doc, docIdx) => (
          <div key={doc.documentNo || docIdx} style={{ marginBottom: '16px', textAlign: 'left' }}>
            <div style={{
              background: COLOR.successLt, border: '1px solid #bbf7d0',
              borderRadius: RADIUS.md, padding: '14px',
            }}>
              {[
                ['Document No', doc.documentNo, true],
                ...(isMulti ? [['Gudang', doc.warehouseName || `#${doc.warehouseId}`, false]] : []),
                ['Tanggal',     doc.date,        false],
                ['Total Produk', `${doc.items.length} produk`, false],
              ].map(([label, val, bold]) => (
                <div key={label} style={{ marginBottom: '6px' }}>
                  <span style={{ color: COLOR.textLt, fontSize: '11px' }}>{label}</span>
                  <div style={{ fontSize: bold ? '16px' : '14px', fontWeight: bold ? 700 : 500, color: COLOR.textDk }}>
                    {val}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '10px' }}>
              <div style={{ fontWeight: 600, fontSize: '12px', color: COLOR.textMd, marginBottom: '6px' }}>
                Detail Pengambilan:
              </div>
              {doc.items.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  fontSize: '13px', padding: '6px 0',
                  borderBottom: i < doc.items.length - 1 ? '1px solid #eee' : 'none',
                }}>
                  <div style={{ flex: 1, marginRight: '8px' }}>
                    <div style={{ color: '#333' }}>{item.Name}</div>
                    <div style={{ fontSize: '11px', color: COLOR.textLt }}>
                      🏷️ {item.ChargeName || '-'} · 📍 {item.LocatorName || '-'}
                    </div>
                  </div>
                  <span style={{ fontWeight: 700, color: COLOR.textDk, whiteSpace: 'nowrap' }}>
                    {item.Qty} {item.selectedUom?.Name || item.UomName}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {isMulti && (
          <div style={{ fontSize: '11px', color: COLOR.textLt, marginBottom: '16px' }}>
            Total {totalItemCount} produk di {documents.length} gudang berbeda.
          </div>
        )}

        <button onClick={onClose} style={{
          background: COLOR.primary, color: '#fff', border: 'none',
          borderRadius: RADIUS.md, padding: '14px', fontWeight: 700,
          fontSize: '15px', cursor: 'pointer', width: '100%',
        }}>
          Ambil Barang Lagi
        </button>
      </div>
    </div>
  );
};

export default InternalUseSuccessModal;
