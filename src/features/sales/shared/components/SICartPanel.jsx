import React from 'react';
import SICartItem from './SICartItem';
import { lineKey } from '@/features/sales/invoice/hooks/useSalesCart';
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { formatCurrency } from '@/utils/currency';

// ─────────────────────────────────────────────────────────────────────────────
// SICartPanel.jsx
// Padanan POCartPanel.jsx untuk Sales Invoice — konten sama dengan
// SICartSidebar (flat-list, 1 customer per cart), dibungkus sebagai
// bottom-sheet mobile. Lihat komentar di SICartSidebar.jsx untuk penjelasan
// beda utama dari POCartPanel (tidak ada grouping/badge vendor per-item).
// ─────────────────────────────────────────────────────────────────────────────
const SICartPanel = ({
  isOpen, onClose,
  items = [], onRemove, onQtyChange, onPriceChange, onUomChange, onClearCart,
  totalItems, totalAmount, summaryRight,
  title = '🧾 Sales Invoice',
  onSubmitDraft, onSubmitComplete,
  onSubmit, submitLabel,
  isSubmitting = false,
  emptyLabel = 'Belum ada produk dipilih.',
  description = '',
  onDescriptionChange,
  onLineDescriptionChange,
  descriptionPlaceholder = 'Keterangan Sales Invoice...',
  customerName,
  customerLabel = 'customer',
  onDateServiceChange,      // ← tambahan
  showDateService = false,
  priceLocked = false,      // pembatasan field: harga tidak boleh diubah (role terbatas)
  priceHidden = false,      // pembatasan field: harga disembunyikan
}) => {
  if (!isOpen) return null;
  const hasCustomer = !!customerName;
  const isSingleButtonMode = !!onSubmit && !onSubmitDraft && !onSubmitComplete;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.35)' }}
    >
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: COLOR.surface, borderRadius: `${RADIUS.xl} ${RADIUS.xl} 0 0`,
        maxHeight: '85dvh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -4px 30px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div onClick={onClose} style={{ width: '40px', height: '4px', borderRadius: '2px', background: '#d1d5db', cursor: 'pointer' }} />
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px 6px', borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0,
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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {totalItems > 0 && onClearCart && (
              <button
                onClick={() => { onClearCart(); onClose(); }}
                style={{
                  background: COLOR.dangerLt, border: 'none', color: COLOR.danger,
                  borderRadius: RADIUS.sm, padding: '5px 10px', fontSize: '12px',
                  cursor: 'pointer', fontWeight: 600,
                }}
              >Kosongkan</button>
            )}
            <button
              onClick={onClose}
              style={{
                background: '#f3f4f6', border: 'none', borderRadius: '50%',
                width: '30px', height: '30px', cursor: 'pointer', fontSize: '16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLOR.textMd,
              }}
            >✕</button>
          </div>
        </div>

        {onDescriptionChange && (
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0 }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: COLOR.textMd, marginBottom: '4px' }}>
              Keterangan
            </label>
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

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', minHeight: 0 }}>
          {totalItems === 0 ? (
            <p style={{ color: COLOR.textLt, fontSize: '13px', textAlign: 'center', margin: '20px 0' }}>{emptyLabel}</p>
          ) : (
            items.map(item => (
              <SICartItem
                key={lineKey(item)}
                item={item}
                itemKey={lineKey(item)}
                onRemove={onRemove}
                onQtyChange={onQtyChange}
                onPriceChange={onPriceChange}
                onUomChange={onUomChange}
                onDescriptionChange={onLineDescriptionChange} 
                onDateServiceChange={onDateServiceChange}
              showDateService={showDateService}
                priceLocked={priceLocked}
                priceHidden={priceHidden}    
              />
            ))
          )}
        </div>

        {totalItems > 0 && (onSubmitDraft || onSubmitComplete || onSubmit) && (
          <div style={{
            borderTop: `1px solid ${COLOR.border}`, padding: '12px 14px', flexShrink: 0,
            paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
          }}>
            <div style={{
              background: '#f0f4ff', borderRadius: RADIUS.md, padding: '10px 14px',
              marginBottom: '10px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: '6px',
            }}>
              <div style={{ fontSize: '13px', color: COLOR.textMd }}>
                <strong style={{ color: COLOR.textDk }}>{totalItems}</strong> item
                {hasCustomer && <> · <strong style={{ color: COLOR.textDk }}>{customerName}</strong></>}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: COLOR.textDk }}>{formatCurrency(totalAmount)}</div>
            </div>
            {summaryRight && (
              <div style={{ fontSize: '11px', color: COLOR.textLt, marginBottom: '10px' }}>{summaryRight}</div>
            )}

            {!hasCustomer && (
              <div style={{
                fontSize: '11px', color: COLOR.danger, background: COLOR.dangerLt,
                borderRadius: RADIUS.sm, padding: '8px 10px', marginBottom: '10px',
              }}>
                ⚠ Belum ada {customerLabel} dipilih. Pilih {customerLabel} dulu sebelum submit.
              </div>
            )}

            {isSingleButtonMode ? (
              <button
                onClick={onSubmit}
                disabled={isSubmitting || !hasCustomer}
                style={{
                  background: (isSubmitting || !hasCustomer) ? '#9ca3af' : COLOR.primary,
                  color: '#fff', border: 'none', padding: '14px', width: '100%',
                  borderRadius: RADIUS.md, fontWeight: 700, fontSize: '14px',
                  cursor: (isSubmitting || !hasCustomer) ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? '⏳ Memproses...' : (submitLabel || 'Kirim')}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={onSubmitDraft}
                  disabled={isSubmitting || !hasCustomer}
                  style={{
                    background: (isSubmitting || !hasCustomer) ? '#f3f4f6' : '#fff',
                    color: (isSubmitting || !hasCustomer) ? '#9ca3af' : COLOR.primary,
                    border: `1.5px solid ${(isSubmitting || !hasCustomer) ? '#d1d5db' : COLOR.primary}`,
                    padding: '14px', width: '100%',
                    borderRadius: RADIUS.md, fontWeight: 700, fontSize: '14px',
                    cursor: (isSubmitting || !hasCustomer) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmitting ? '⏳ Memproses...' : '📝 DRAFT Invoice'}
                </button>
                <button
                  onClick={onSubmitComplete}
                  disabled={isSubmitting || !hasCustomer}
                  style={{
                    background: (isSubmitting || !hasCustomer) ? '#9ca3af' : '#16a34a',
                    color: '#fff', border: 'none', padding: '14px', width: '100%',
                    borderRadius: RADIUS.md, fontWeight: 700, fontSize: '14px',
                    cursor: (isSubmitting || !hasCustomer) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmitting ? '⏳ Memproses...' : '✅ COMPLETE Invoice'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SICartPanel;