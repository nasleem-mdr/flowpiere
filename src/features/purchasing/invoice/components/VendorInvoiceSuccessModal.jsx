/**  ─────────────────────────────────────────────────────────────────────────────
* VendorInvoiceSuccessModal.jsx
* `data` = ARRAY hasil useInvoiceSubmit (1 elemen per vendor/invoice yang
* berhasil dibuat — bisa >1 kalau cart berisi baris dari beberapa vendor).
*
* Bentuk tiap elemen results[] (dari useInvoiceSubmit):
* {
*   invoiceId, documentNo, status, grandTotal,
*   vendorId, vendorName, vendorLocationId, date,
*   items: [ cart item asli — Name, UomName, QtyOrdered, Price, OrderDocumentNo, ... ]
* }
* ─────────────────────────────────────────────────────────────────────────────
*/

import React from 'react';

import { useNavigate } from 'react-router-dom';

import { 
  COLOR, 
  RADIUS, 
} from '@/utils/styleTokens';

import { formatCurrency } from '@/utils/currency';

const VendorInvoiceSuccessModal = ({ isOpen, data, onClose }) => {
  const navigate = useNavigate();
  const handleClose = () => { onClose(); navigate('/dashboard'); };

  const invoices = Array.isArray(data) ? data : (data ? [data] : []);
  if (!isOpen || invoices.length === 0) return null;

  const grandTotalAll = invoices.reduce((s, inv) => s + (inv.grandTotal || 0), 0);

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

        <div style={{ fontSize: '52px', marginBottom: '8px' }}>📄✅</div>
        <div style={{ fontSize: '19px', fontWeight: 700, color: COLOR.success, marginBottom: '4px' }}>
          {invoices.length > 1 ? `${invoices.length} Invoice Vendor Berhasil Dibuat!` : 'Invoice Vendor Berhasil Dibuat!'}
        </div>
        <div style={{ fontSize: '13px', color: COLOR.textMd, marginBottom: '18px' }}>
          Dokumen telah di-Complete dan menunggu proses pembayaran sesuai alur di iDempiere.
        </div>

        {invoices.map((inv, i) => (
          <div key={inv.invoiceId ?? i} style={{
            background: COLOR.successLt, border: '1px solid #bbf7d0',
            borderRadius: RADIUS.md, padding: '14px', marginBottom: '14px', textAlign: 'left',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontWeight: 700, fontSize: '15px', color: COLOR.textDk }}>{inv.documentNo}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: COLOR.textDk }}>{formatCurrency(inv.grandTotal)}</span>
            </div>
            <div style={{ fontSize: '11px', color: COLOR.textLt, marginBottom: '8px' }}>
              🚚 {inv.vendorName} · {inv.date}
            </div>

            {(inv.items || []).map((item, j) => (
              <div key={item.C_OrderLine_ID ?? j} style={{
                display: 'flex', flexDirection: 'column', fontSize: '12px', padding: '4px 0',
                borderTop: j > 0 ? '1px solid #d1fae5' : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#333', flex: 1, marginRight: '8px' }}>{item.Name}</span>
                  <span style={{ color: COLOR.textMd, whiteSpace: 'nowrap' }}>
                    {item.QtyOrdered} {item.UomName} × {formatCurrency(item.Price)}
                  </span>
                </div>
                {item.OrderDocumentNo && (
                  <div style={{ fontSize: '10px', color: COLOR.textLt }}>
                    📎 dari PO: {item.OrderDocumentNo}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {invoices.length > 1 && (
          <div style={{ fontSize: '13px', fontWeight: 700, color: COLOR.textDk, marginBottom: '14px' }}>
            Total Semua Invoice: {formatCurrency(grandTotalAll)}
          </div>
        )}

        <button onClick={onClose} style={{
          background: COLOR.primary, color: '#fff', border: 'none',
          borderRadius: RADIUS.md, padding: '14px', fontWeight: 700,
          fontSize: '15px', cursor: 'pointer', width: '100%',
        }}>
          Buat Invoice Baru
        </button>
      </div>
    </div>
  );
};

export default VendorInvoiceSuccessModal;