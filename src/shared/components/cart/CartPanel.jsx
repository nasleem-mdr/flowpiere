import React from 'react';
import CartItemDefault from './CartItem';
import { COLOR, RADIUS } from '@/utils/styleTokens';

const CartPanel = ({
  isOpen, onClose,
  cart, onRemove, onQtyChange, onUomChange, onPriceChange, onClearCart,
  totalItems, totalQty,
  summaryRight,
  submitLabel,
  submitDraftLabel = 'DRAFT',
  submitCompleteLabel = 'COMPLETE',
  submitExtraLabel = 'EXTRA',
  onSubmit, isSubmitting = false,
  onSubmitDraft, onSubmitComplete, onSubmitExtra,
  title = 'Keranjang',
  emptyLabel = 'Belum ada produk dipilih.',
  description,
  onDescriptionChange,
  descriptionPlaceholder = 'Catatan / keterangan (opsional)...',
  CartItemComponent = CartItemDefault,   // ⬅️ BUG #2 — sebelumnya tidak ada di destructure props
}) => {
  if (!isOpen) return null;
  const isSingleButtonMode = !!onSubmit && !onSubmitDraft && !onSubmitComplete;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.35)' }}
    >
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: COLOR.surface,
        borderRadius: `${RADIUS.xl} ${RADIUS.xl} 0 0`,
        maxHeight: '85dvh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 -4px 30px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div
            onClick={onClose}
            style={{ width: '40px', height: '4px', borderRadius: '2px', background: '#d1d5db', cursor: 'pointer' }}
          />
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px 6px', borderBottom: onDescriptionChange ? 'none' : `1px solid ${COLOR.border}`, flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: '15px', color: COLOR.textDk }}>
            {title}
            {totalItems > 0 && (
              <span style={{
                marginLeft: '8px', background: COLOR.primary, color: '#fff',
                borderRadius: '50%', width: '22px', height: '22px',
                fontSize: '12px', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
              }}>{totalItems}</span>
            )}
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {cart.length > 0 && onClearCart && (
              <button
                onClick={() => { onClearCart(); onClose(); }}
                style={{
                  background: COLOR.dangerLt, border: 'none', color: COLOR.danger,
                  borderRadius: RADIUS.sm, padding: '5px 10px',
                  fontSize: '12px', cursor: 'pointer', fontWeight: 600,
                }}
              >Kosongkan</button>
            )}
            <button
              onClick={onClose}
              style={{
                background: '#f3f4f6', border: 'none', borderRadius: '50%',
                width: '30px', height: '30px', cursor: 'pointer',
                fontSize: '16px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: COLOR.textMd,
              }}
            >✕</button>
          </div>
        </div>

        {onDescriptionChange && (
          <div style={{ padding: '8px 16px 12px', borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0 }}>
            <textarea
              value={description || ''}
              onChange={e => onDescriptionChange(e.target.value)}
              placeholder={descriptionPlaceholder}
              rows={2}
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'vertical',
                padding: '8px 10px', border: `1.5px solid ${COLOR.border}`,
                borderRadius: RADIUS.sm, fontSize: '13px', color: COLOR.textDk,
                fontFamily: 'inherit', outline: 'none', minHeight: '38px',
              }}
            />
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', minHeight: 0 }}>
          {cart.length === 0 ? (
            <p style={{ color: COLOR.textLt, fontSize: '13px', textAlign: 'center', margin: '20px 0' }}>
              {emptyLabel}
            </p>
          ) : (
            cart.map((item, idx) => (
              <CartItemComponent
                key={`${item.M_Product_ID}-${idx}`}
                item={item}
                onRemove={onRemove}
                onQtyChange={onQtyChange}
                onUomChange={onUomChange}
                onPriceChange={onPriceChange}
              />
            ))
          )}
        </div>

        {cart.length > 0 && (onSubmitDraft || onSubmitComplete || onSubmit) && (
          <div style={{
            borderTop: `1px solid ${COLOR.border}`, padding: '12px 14px', flexShrink: 0,
            paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
          }}>
            <div style={{
              background: '#f0f4ff', borderRadius: RADIUS.md,
              padding: '10px 14px', marginBottom: '12px',
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: '6px',
            }}>
              <div style={{ fontSize: '13px', color: COLOR.textMd }}>
                <strong style={{ color: COLOR.textDk }}>{totalItems}</strong> jenis produk ·{' '}
                <strong style={{ color: COLOR.textDk }}>{totalQty.toLocaleString('id-ID')}</strong> total qty
              </div>
              {summaryRight && <div style={{ fontSize: '12px', color: COLOR.textLt }}>{summaryRight}</div>}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              {isSingleButtonMode ? (
                <button
                  onClick={onSubmit}
                  disabled={isSubmitting}
                  style={{
                    background: isSubmitting ? '#9ca3af' : COLOR.primary,
                    color: '#fff', border: 'none',
                    padding: '15px', width: '100%',
                    borderRadius: RADIUS.md, fontWeight: 700,
                    fontSize: '16px', cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    letterSpacing: '0.02em',
                  }}
                >
                  {isSubmitting ? '⏳ Memproses...' : (submitLabel || 'SUBMIT')}
                </button>
              ) : (
                <>
                  <button
                    onClick={onSubmitDraft}
                    disabled={isSubmitting}
                    style={{
                      background: isSubmitting ? '#9ca3af' : COLOR.primary,
                      color: '#fff', border: 'none',
                      padding: '15px', width: '100%',
                      borderRadius: RADIUS.md, fontWeight: 700,
                      fontSize: '16px', cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      letterSpacing: '0.02em', transition: 'background 0.15s',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {isSubmitting ? '⏳ Memproses...' : submitDraftLabel}
                  </button>
                  <button
                    onClick={onSubmitComplete}
                    disabled={isSubmitting}
                    style={{
                      background: isSubmitting ? '#9ca3af' : COLOR.primary,
                      color: '#fff', border: 'none',
                      padding: '15px', width: '100%',
                      borderRadius: RADIUS.md, fontWeight: 700,
                      fontSize: '16px', cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      letterSpacing: '0.02em', transition: 'background 0.15s',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {isSubmitting ? '⏳ Memproses...' : submitCompleteLabel}
                  </button>
                  {/* Tombol ketiga (opsional) — hanya tampil bila onSubmitExtra diberikan */}
                  {onSubmitExtra && (
                    <button
                      onClick={onSubmitExtra}
                      disabled={isSubmitting}
                      style={{
                        background: isSubmitting ? '#9ca3af' : COLOR.primary,
                        color: '#fff', border: 'none',
                        padding: '15px', width: '100%',
                        borderRadius: RADIUS.md, fontWeight: 700,
                        fontSize: '16px', cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        letterSpacing: '0.02em', transition: 'background 0.15s',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      {isSubmitting ? '⏳ Memproses...' : submitExtraLabel}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartPanel;