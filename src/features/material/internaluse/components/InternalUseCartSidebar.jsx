import React from 'react';
import InternalUseCartItem from './InternalUseCartItem';
import { 
  COLOR, 
  RADIUS, 
} from '@/utils/styleTokens';

const InternalUseCartSidebar = ({
  cart, warehouses = [], onRemove, onQtyChange, onChargeClick, onUomChange, onWarehouseChange, onClearCart,
  totalItems, totalQty, missingChargeCount, summaryRight,
  title = '📤 Daftar Pengambilan', 
  submitLabelDraft = '✅ DRAFT', submitLabelComplete = '✅ COMPLETE',
  onSubmitDraft, onSubmitComplete, 
   isSubmitting = false,
  emptyLabel = 'Belum ada produk dipilih.',
  width = '380px',
}) => {
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', minHeight: 0 }}>
        {totalItems === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: COLOR.textLt }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📤</div>
            <p style={{ fontSize: '13px', margin: 0 }}>{emptyLabel}</p>
          </div>
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
        <div style={{ borderTop: `1px solid ${COLOR.border}`, padding: '14px 16px', flexShrink: 0 }}>
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
              ⚠ {missingChargeCount} item belum punya Charge. Klik badge 🏷️ pada item untuk memilih.
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
  );
};

export default InternalUseCartSidebar;
