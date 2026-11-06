import React, { useState } from "react";
import { useNavigate } from 'react-router-dom';
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { formatCurrency } from '@/utils/currency';
import { ShoppingCartIcon } from '@/shared/components';
import { generateInvoicePDF } from '@/features/sales/invoice/utils/generateInvoicePDF';
import { useOrgInfo } from "@/shared/hooks/useOrgInfo";

const SalesInvoiceSuccessModal = ({
  isOpen,
  data,
  onClose,
}) => {
  const { orgInfo } = useOrgInfo(); 
  const navigate = useNavigate();
  const handleClose = () => { onClose(); navigate('/dashboard'); };
  const [isPrinting, setIsPrinting] = useState(false);
  if (!isOpen || !data || data.length === 0) return null;

  const grandTotal = data.reduce((s, inv) => s + (inv.grandTotal ?? inv.total ?? 0), 0);
  const isAllDraft = data.every(inv => inv.status === 'Draft');
  const isMulti = data.length > 1;

  const headerTitle = isAllDraft
    ? (isMulti ? `${data.length} Draft Invoice Berhasil Dibuat!` : 'Draft Invoice Berhasil Dibuat!')
    : (isMulti ? `${data.length} Sales Invoice Berhasil Dibuat!` : 'Sales Invoice Berhasil Dibuat!');

  const headerSubtitle = isAllDraft
    ? 'Invoice masih Draft — periksa & tekan Complete dari iDempiere kalau sudah siap.'
    : 'Dokumen telah di-Complete.';

  // ── Print hanya masuk akal untuk 1 invoice sekaligus. Kalau multi-invoice
  //    (misal nanti ada mode submit banyak customer), print per-baris via
  //    handlePrintOne — tombol footer utama disembunyikan untuk kasus multi.
  const handlePrintOne = async (inv) => {
    if (!inv?.invoiceId) {
      console.warn('SalesInvoiceSuccessModal: invoiceId kosong pada data item, tidak bisa print.', inv);
      alert('Tidak bisa mencetak — ID Invoice tidak ditemukan pada data ini.');
      return;
    }
    setIsPrinting(true);
    try {
      await generateInvoicePDF(inv.invoiceId, inv.documentNo, orgInfo);
    } catch (err) {
      console.error("Gagal membuat PDF Invoice:", err.message);
      alert("Gagal membuat PDF Invoice: " + (err.message || "Terjadi kesalahan."));
    } finally {
      setIsPrinting(false);
    }
  };

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
          background: isAllDraft ? '#f3f4f6' : COLOR.successLt,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 8px',
        }}>
          {isAllDraft
            ? <ShoppingCartIcon size={30} color={COLOR.danger} />
            : <ShoppingCartIcon size={30} color={COLOR.success} />
          }
        </div>

        <div style={{ fontSize: '19px', fontWeight: 700, color: COLOR.success, marginBottom: '4px' }}>
          {headerTitle}
        </div>
        <div style={{ fontSize: '13px', color: COLOR.textMd, marginBottom: '18px' }}>
          {headerSubtitle}
        </div>

        {data.map((inv, i) => (
          <div key={i} style={{
            background: COLOR.successLt, border: '1px solid #bbf7d0',
            borderRadius: RADIUS.md, padding: '14px', marginBottom: '12px', textAlign: 'left',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '15px', color: COLOR.textDk }}>{inv.documentNo}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: COLOR.textDk }}>{formatCurrency(inv.grandTotal ?? inv.total)}</span>
            </div>
            <div style={{ fontSize: '11px', color: COLOR.textLt, marginBottom: '8px' }}>
              👤 {inv.customerName} · {inv.date}
            </div>
            {inv.items.map((item, j) => (
              <div key={j} style={{
                display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0',
                borderTop: j > 0 ? '1px solid #d1fae5' : 'none',
              }}>
                <span style={{ color: '#333', flex: 1, marginRight: '8px' }}>{item.Name}</span>
                <span style={{ color: COLOR.textMd, whiteSpace: 'nowrap' }}>
                  {item.Qty} {item.UomName} × {formatCurrency(item.Price)}
                </span>
              </div>
            ))}

            {/* ── Print per invoice — muncul kalau multi-invoice ────────── */}
            {isMulti && !isAllDraft && (
              <button
                onClick={() => handlePrintOne(inv)}
                disabled={isPrinting || !inv.invoiceId}
                style={{
                  marginTop: '10px', width: '100%',
                  background: 'transparent', color: COLOR.primary,
                  border: `1.5px solid ${COLOR.primary}`, borderRadius: RADIUS.sm,
                  padding: '8px', fontSize: '12px', fontWeight: 700,
                  cursor: (isPrinting || !inv.invoiceId) ? 'not-allowed' : 'pointer',
                  opacity: (isPrinting || !inv.invoiceId) ? 0.5 : 1,
                }}
              >
                {isPrinting ? '⏳ Menyiapkan PDF...' : '🖨️ Print Invoice Ini'}
              </button>
            )}
          </div>
        ))}

        {isMulti && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', padding: '10px 14px',
            background: '#f0f4ff', borderRadius: RADIUS.md, marginBottom: '18px',
          }}>
            <span style={{ fontSize: '13px', color: COLOR.textMd }}>Total Keseluruhan</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: COLOR.textDk }}>{formatCurrency(grandTotal)}</span>
          </div>
        )}

        {/* ── Footer actions — konsisten pakai token warna, bukan style lama ── */}
        <div style={{ display: 'flex', gap: '10px', marginTop: isMulti ? 0 : '4px' }}>
          {!isMulti && !isAllDraft && (
            <button
              onClick={() => handlePrintOne(data[0])}
              disabled={isPrinting || !data[0]?.invoiceId}
              style={{
                flex: 1,
                background: 'transparent', color: COLOR.primary,
                border: `1.5px solid ${COLOR.primary}`, borderRadius: RADIUS.md,
                padding: '14px', fontWeight: 700, fontSize: '14px',
                cursor: (isPrinting || !data[0]?.invoiceId) ? 'not-allowed' : 'pointer',
                opacity: (isPrinting || !data[0]?.invoiceId) ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              {isPrinting ? '⏳ Menyiapkan...' : '🖨️ Print Invoice'}
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: COLOR.primary, color: '#fff', border: 'none',
              borderRadius: RADIUS.md, padding: '14px', fontWeight: 700,
              fontSize: '14px', cursor: 'pointer',
            }}
          >
            Buat Invoice Baru
          </button>
        </div>
      </div>
    </div>
  );
};

export default SalesInvoiceSuccessModal;