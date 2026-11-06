import React from 'react';
import CartItemDefault from './CartItem';
import { COLOR, RADIUS } from '@/utils/styleTokens';

/** ─────────────────────────────────────────────────────────────────────────────
* CartSidebar.jsx
* Versi desktop dari cart — panel statis di sisi kanan (bukan bottom sheet
* yang overlay/modal). Selalu terlihat selama ada layar produk di sebelahnya,
* tidak perlu di-toggle buka/tutup seperti versi mobile.
*
* Props-nya sengaja dibuat semirip mungkin dengan CartPanel.jsx supaya mudah
* dipakai bergantian dari satu state yang sama di container (lihat
* RequisitionContainer.jsx: render salah satu berdasarkan useIsDesktop()).
*
* Penggunaan:
*   {isDesktop && (
*     <CartSidebar
*       cart={cart} onRemove={removeFromCart} onQtyChange={updateQty} onUomChange={updateUom}
*       onClearCart={clearCart} totalItems={totalItems} totalQty={totalQty}
*       summaryRight="📦 Gudang Pusat" title="📝 Daftar Permintaan"
*       submitLabel="📤 KIRIM REQUISITION" onSubmit={handleSubmit} isSubmitting={isSubmitting}
*     />
*   )}
* ─────────────────────────────────────────────────────────────────────────────
*/

const CartSidebar = ({
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
  width = '560px',
  description,
  onDescriptionChange,
  descriptionPlaceholder = 'Catatan / keterangan (opsional)...',
  CartItemComponent = CartItemDefault, 
}) => {
  const isSingleButtonMode = !!onSubmit && !onSubmitDraft && !onSubmitComplete;
  return (
    <div style={{
      width, flexShrink: 0,
      background: COLOR.surface,
      borderLeft: `1px solid ${COLOR.border}`,
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 0,
     }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 18px', borderBottom: onDescriptionChange ? 'none' : `1px solid ${COLOR.border}`, flexShrink: 0,
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
        {cart.length > 0 && onClearCart && (
          <button
            onClick={onClearCart}
            style={{
              background: COLOR.dangerLt, border: 'none', color: COLOR.danger,
              borderRadius: RADIUS.sm, padding: '5px 10px',
              fontSize: '12px', cursor: 'pointer', fontWeight: 600,
            }}
          >Kosongkan</button>
        )}
      </div>

      {/* Description manual — di bawah title, di atas list produk */}
      {onDescriptionChange && (
        <div style={{ padding: '10px 18px 14px', borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0 }}>
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

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', minHeight: 0 }}>
        {cart.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: COLOR.textLt }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🛒</div>
            <p style={{ fontSize: '13px', margin: 0 }}>{emptyLabel}</p>
          </div>
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

      {/* Summary + submit */}
      
      {cart.length > 0 && (onSubmitDraft || onSubmitComplete || onSubmit ) && (
        <div style={{ borderTop: `1px solid ${COLOR.border}`, padding: '14px 16px', flexShrink: 0 }}>
          <div style={{
            background: '#f0f4ff', borderRadius: RADIUS.md,
            padding: '10px 14px', marginBottom: '12px',
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', flexWrap: 'wrap', gap: '6px',
          }}>
            <div style={{ fontSize: '13px', color: COLOR.textMd }}>
              <strong style={{ color: COLOR.textDk }}>{totalItems}</strong> jenis ·{' '}
              <strong style={{ color: COLOR.textDk }}>{totalQty.toLocaleString('id-ID')}</strong> qty
            </div>
            {summaryRight && <div style={{ fontSize: '12px', color: COLOR.textLt }}>{summaryRight}</div>}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
              {isSingleButtonMode ? (
                <button
                  onClick={onSubmit}
                  disabled={isSubmitting}
                  style={{
                    flex: 1,
                    background: isSubmitting ? '#9ca3af' : (COLOR.primary || '#2563eb'),
                    color: '#fff', border: 'none',
                    padding: '12px 8px', borderRadius: RADIUS.md,
                    fontWeight: 700, fontSize: '14px',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmitting ? '⏳...' : (submitLabel || 'SUBMIT')}
                </button>
              ) : (
                <>
            {/* Tombol DRAFT (Style Secondary / Outline) */}
            <button
              onClick={onSubmitDraft}
              disabled={isSubmitting}
              style={{
                flex: 1,
                background: isSubmitting ? '#e5e7eb' : (COLOR.surface || '#fff'),
                color: isSubmitting ? '#9ca3af' : (COLOR.primary || '#2563eb'),
                border: `1.5px solid ${isSubmitting ? '#d1d5db' : (COLOR.primary || '#2563eb')}`,
                padding: '12px 8px',
                borderRadius: RADIUS.md,
                fontWeight: 700,
                fontSize: '14px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                letterSpacing: '0.02em',
                transition: 'all 0.15s',
              }}
            >
              {isSubmitting ? '⏳...' : submitDraftLabel}
            </button>
            <button
              onClick={onSubmitComplete}
              disabled={isSubmitting}
              style={{
                flex: 1,
                background: isSubmitting ? '#9ca3af' : (COLOR.primary || '#2563eb'),
                color: '#fff',
                border: 'none',
                padding: '12px 8px',
                borderRadius: RADIUS.md,
                fontWeight: 700,
                fontSize: '14px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                letterSpacing: '0.02em',
                transition: 'all 0.15s',
              }}
            >
              {isSubmitting ? '⏳...' : submitCompleteLabel}
            </button>
            {/* Tombol ketiga (opsional) — hanya tampil bila onSubmitExtra diberikan */}
            {onSubmitExtra && (
              <button
                onClick={onSubmitExtra}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  background: isSubmitting ? '#9ca3af' : (COLOR.primary || '#2563eb'),
                  color: '#fff',
                  border: 'none',
                  padding: '12px 8px',
                  borderRadius: RADIUS.md,
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.02em',
                  transition: 'all 0.15s',
                }}
              >
                {isSubmitting ? '⏳...' : submitExtraLabel}
              </button>
            )}
            </>
              )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CartSidebar;