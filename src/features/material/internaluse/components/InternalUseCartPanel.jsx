import React from 'react';
import InternalUseCartItem from './InternalUseCartItem';
import { 
  COLOR, 
  RADIUS, 
} from '@/utils/styleTokens';

const InternalUseCartPanel = ({
  isOpen, onClose,
  cart, warehouses = [], onRemove, onQtyChange, onChargeClick, onUomChange, onWarehouseChange, onClearCart,
  totalItems, totalQty, missingChargeCount, summaryRight,
  title = '📤 Daftar Pengambilan', 
  submitLabelDraft = '✅ DRAFT', submitLabelComplete = '✅ COMPLETE',
  onSubmitDraft, onSubmitComplete, 
  isSubmitting = false,
  emptyLabel = 'Belum ada produk dipilih.',
}) => {
  if (!isOpen) return null;

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

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', minHeight: 0 }}>
          {totalItems === 0 ? (
            <p style={{ color: COLOR.textLt, fontSize: '13px', textAlign: 'center', margin: '20px 0' }}>{emptyLabel}</p>
          ) : (
            cart.map(item => (
              <InternalUseCartItem
                key={item.M_Product_ID}
                item={item}
                warehouses={warehouses}
                onRemove={onRemove}
                onQtyChange={onQtyChange}
                onChargeClick={onChargeClick}
                onUomChange={onUomChange}
                onWarehouseChange={onWarehouseChange}
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
                <strong style={{ color: COLOR.textDk }}>{totalItems}</strong> produk ·{' '}
                <strong style={{ color: COLOR.textDk }}>{totalQty}</strong> total qty
              </div>
            </div>
            {summaryRight && (
              <div style={{ fontSize: '11px', color: COLOR.textLt, marginBottom: '10px' }}>{summaryRight}</div>
            )}

            {missingChargeCount > 0 && (
              <div style={{
                fontSize: '11px', color: COLOR.danger, background: COLOR.dangerLt,
                borderRadius: RADIUS.sm, padding: '8px 10px', marginBottom: '10px',
              }}>
                ⚠ {missingChargeCount} item belum punya Charge. Ketuk badge 🏷️ pada item.
              </div>
            )}
              <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={onSubmitDraft}
                disabled={isSubmitting || missingChargeCount > 0}
                style={{
                  background: (isSubmitting || missingChargeCount > 0) ? '#9ca3af' : COLOR.success,
                  color: '#fff', border: 'none', padding: '14px', width: '100%',
                  borderRadius: RADIUS.md, fontWeight: 700, fontSize: '14px',
                  cursor: (isSubmitting || missingChargeCount > 0) ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? '⏳ Memproses...' : submitLabelDraft}
              </button>
              <button
                onClick={onSubmitComplete}
                disabled={isSubmitting || missingChargeCount > 0}
                style={{
                  background: (isSubmitting || missingChargeCount > 0) ? '#9ca3af' : COLOR.primary,
                  color: '#fff', border: 'none', padding: '14px', width: '100%',
                  borderRadius: RADIUS.md, fontWeight: 700, fontSize: '14px',
                  cursor: (isSubmitting || missingChargeCount > 0) ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? '⏳ Memproses...' : submitLabelComplete}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InternalUseCartPanel;
