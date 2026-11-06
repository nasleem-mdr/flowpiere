import React from 'react';
import POCartItem from '../../order/components/POCartItem';
import { lineKey } from '@/shared/hooks/usePOCart';
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { formatCurrency } from '@/utils/currency';
import { FcProcess } from "react-icons/fc";
import { MdAddBusiness } from "react-icons/md";
import { FaTruck, FaMoneyBillWave } from 'react-icons/fa';
import { AiOutlineDeliveredProcedure } from 'react-icons/ai';
import '@/css/POCartSidebar.css';

//const fmtRp = (n) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

// ─────────────────────────────────────────────────────────────────────────────
// POCartSidebar.jsx
// ─────────────────────────────────────────────────────────────────────────────
const POCartSidebar = ({
  vendorGroups, onRemove, onQtyChange, onPriceChange, onUomChange, onVendorClick,
  onClearCart, totalItems, totalAmount, summaryRight,
  title = '🧾 Daftar Purchase Order',
  onSubmitDraft, onSubmitComplete, 
  onSubmit,   
  onSubmitCash, 
  isSubmitting = false,
  emptyLabel = 'Belum ada produk dipilih.',
  width = '380px',
  description = '',
  onDescriptionChange,
  descriptionPlaceholder = 'Keterangan Purchase Order...',
  partnerIcon = <><MdAddBusiness /></>,
  partnerLabel = 'vendor',
  docLabel = 'PO',
  poReference = '',
  onPoReferenceChange,
  poReferencePlaceholder = 'Nomor invoice dari vendor...',
}) => {
  const vendorCount = vendorGroups.length;
  const hasIncompleteVendor = vendorGroups.some(g => !g.C_BPartner_ID);
  const isSingleButtonMode = !!onSubmit && !onSubmitDraft && !onSubmitComplete;
  const flexStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px' // Memberi jarak antara ikon dan teks
  };
  
  const submitLabel = (
    <span style={flexStyle}>
      <AiOutlineDeliveredProcedure /> Prosedur
    </span>
  );
  
  const cashSubmitLabel = (
    <span style={flexStyle}>
      <FaMoneyBillWave /> Tunai
    </span>
  );

  // Helper untuk menentukan tooltip tombol
  const getDisabledReasonTooltip = (defaultTooltip) => {
    if (isSubmitting) return 'Transaksi sedang diproses...';
    if (hasIncompleteVendor) return `Pilih ${partnerLabel} untuk semua item terlebih dahulu.`;
    return defaultTooltip;
  };

  return (
    <div style={{
      width, flexShrink: 0, background: COLOR.surface,
      borderLeft: `1px solid ${COLOR.border}`,
      display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 18px', borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: '15px', color: COLOR.textDk }}>
          {title}
          {totalItems > 0 && (
            <span style={{
              marginLeft: '8px', background: COLOR.primary, color: '#fff',
              borderRadius: '50%', width: '22px', height: '22px', fontSize: '12px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{totalItems}</span>
          )}
        </span>
        {totalItems > 0 && onClearCart && (
          <button
            onClick={onClearCart}
            style={{
              background: COLOR.dangerLt, border: 'none', color: COLOR.danger,
              borderRadius: RADIUS.sm, padding: '5px 10px', fontSize: '12px',
              cursor: 'pointer', fontWeight: 600,
            }}
          >Kosongkan</button>
        )}
      </div>
      {onPoReferenceChange && (
      <div style={{ padding: '12px 16px', flexShrink: 0 }}>
        <input
          type="text"
          value={poReference}
          onChange={e => onPoReferenceChange(e.target.value)}
          placeholder={poReferencePlaceholder}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '8px 10px',
            border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.sm,
            fontSize: '13px', color: COLOR.textDk, outline: 'none',
          }}
        />
      </div>
    )}
      {onDescriptionChange && (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0 }}>
          
          <input
            type="text"
            value={description}
            onChange={e => onDescriptionChange(e.target.value)}
            placeholder={descriptionPlaceholder}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '8px 10px',
              border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.sm,
              fontSize: '13px', color: COLOR.textDk, outline: 'none',
            }}
          />
        </div>
      )}
      
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', minHeight: 0 }}>
        {totalItems === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: COLOR.textLt }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🧾</div>
            <p style={{ fontSize: '13px', margin: 0 }}>{emptyLabel}</p>
          </div>
        ) : (
          vendorGroups.map(group => (
            <div key={group.C_BPartner_ID ?? 'unassigned'} style={{ marginBottom: '16px' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: '12px', fontWeight: 700,
                color: group.C_BPartner_ID ? COLOR.vendor : COLOR.danger,
                marginBottom: '6px', paddingBottom: '4px',
                borderBottom: `1px dashed ${COLOR.border}`,
              }}>
                <span>{partnerIcon} {group.VendorName || group.CustomerName}</span>
                <span>{formatCurrency(group.subtotal)}</span>
              </div>
              {group.items.map(item => (
                <POCartItem
                  key={lineKey(item)}
                  item={item}
                  itemKey={lineKey(item)}
                  onRemove={onRemove}
                  onUomChange={onUomChange}
                  onQtyChange={onQtyChange}
                  onPriceChange={onPriceChange}
                  onVendorClick={onVendorClick}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {totalItems > 0 && (onSubmitDraft || onSubmitComplete || onSubmit || onSubmitCash) && (
        <div style={{ borderTop: `1px solid ${COLOR.border}`, padding: '14px 16px', flexShrink: 0 }}>
          <div style={{
            background: '#f0f4ff', borderRadius: RADIUS.md, padding: '10px 14px',
            marginBottom: '10px', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', flexWrap: 'wrap', gap: '6px',
          }}>
            <div style={{ fontSize: '13px', color: COLOR.textMd }}>
              <strong style={{ color: COLOR.textDk }}>{totalItems}</strong> item ·{' '}
              <strong style={{ color: COLOR.textDk }}>{vendorCount}</strong> {partnerLabel}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: COLOR.textDk }}>{formatCurrency(totalAmount)}</div>
          </div>

          {summaryRight && (
            <div style={{ fontSize: '11px', color: COLOR.textLt, marginBottom: '10px' }}>{summaryRight}</div>
          )}

          {hasIncompleteVendor && (
            <div style={{
              fontSize: '11px', color: COLOR.danger, background: COLOR.dangerLt,
              borderRadius: RADIUS.sm, padding: '8px 10px', marginBottom: '10px',
            }}>
              ⚠ Masih ada item tanpa {partnerLabel}. Ketuk badge {partnerIcon} pada item untuk memilih {partnerLabel}.
            </div>
          )}

          {/* Wrapper Flexbox Kanan-Kiri */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {isSingleButtonMode ? (
               
              <button
                onClick={onSubmit}
                disabled={isSubmitting || hasIncompleteVendor}
                data-tooltip={getDisabledReasonTooltip(`Prosedur, anda harus mengikuti manual prosedur procurement (Input PO, Input Penerimaan Barang, Input Invoice Vendor, Input Pembayaran, semuanya secara manual)`)}
               className="custom-tooltip"
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: (isSubmitting || hasIncompleteVendor) ? '#9ca3af' : COLOR.primary,
                  color: '#fff', border: 'none', padding: '14px',
                  borderRadius: RADIUS.md, fontWeight: 700, fontSize: '14px',
                  cursor: (isSubmitting || hasIncompleteVendor) ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? (
                  <>
                    <FcProcess /> Memproses...
                  </>
                ) : (
                  submitLabel || 'Procedure'
                )}
              </button>
            ) : (
              <>
                {onSubmitDraft && (
                  <button
                    onClick={onSubmitDraft}
                    disabled={isSubmitting || hasIncompleteVendor}
                    title={getDisabledReasonTooltip(`Simpan sebagai draft,tanpa menyelesaikan transaksi.`)}
                    style={{
                      flex: 1,
                      background: (isSubmitting || hasIncompleteVendor) ? '#f3f4f6' : '#fff',
                      color: (isSubmitting || hasIncompleteVendor) ? '#9ca3af' : COLOR.primary,
                      border: `1.5px solid ${(isSubmitting || hasIncompleteVendor) ? '#d1d5db' : COLOR.primary}`,
                      padding: '14px',
                      borderRadius: RADIUS.md, fontWeight: 700, fontSize: '14px',
                      cursor: (isSubmitting || hasIncompleteVendor) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isSubmitting ? '⏳ Memproses...' : `📝 DRAFT ${vendorCount} ${docLabel}`}
                  </button>
                )}
                
                {onSubmitComplete && (
                  <button
                  onClick={onSubmitComplete}
                  disabled={isSubmitting || hasIncompleteVendor}
                  data-tooltip={getDisabledReasonTooltip(`Selesaikan dan finalisasi ${vendorCount} dokumen ${docLabel}.`)}
                  className="custom-tooltip"
                  style={{
                    flex: 1,
                    background: (isSubmitting || hasIncompleteVendor) ? '#9ca3af' : '#16a34a',
                    color: '#fff', border: 'none', padding: '14px',
                    borderRadius: RADIUS.md, fontWeight: 700, fontSize: '14px',
                    cursor: (isSubmitting || hasIncompleteVendor) ? 'not-allowed' : 'pointer',
                    position: 'relative' // Pastikan position relative agar tooltip berada tepat di atas tombol ini
                  }}
                >
                  {isSubmitting ? '⏳ Memproses...' : `✅ COMPLETE ${vendorCount} ${docLabel}`}
                </button>
                )}
              </>
            )}

            {onSubmitCash && (() => {
              const cashDisabled = isSubmitting || hasIncompleteVendor || vendorCount > 1;

              // Kondisi pesan tooltip untuk tombol Cash
              let cashTooltip = "Akan generate PO, Material Receipt, Invoice Vendor dan Pembayaran (Cash/Bank).";
              if (vendorCount > 1) {
                cashTooltip = `Cash Purchase hanya mendukung 1 ${partnerLabel} per transaksi.`;
              } else {
                cashTooltip = getDisabledReasonTooltip(cashTooltip);
              }

              return (
                <button
                  onClick={onSubmitCash}
                  disabled={cashDisabled}
                  data-tooltip={cashTooltip}
                  className="custom-tooltip"
                  style={{
                    flex: 1,
                    background: cashDisabled ? '#9ca3af' : '#16a34a',
                    color: '#fff', border: 'none', padding: '14px',
                    borderRadius: RADIUS.md, fontWeight: 700, fontSize: '14px',
                    cursor: cashDisabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmitting ? '⏳ Memproses...' : cashSubmitLabel}
                </button>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default POCartSidebar;
