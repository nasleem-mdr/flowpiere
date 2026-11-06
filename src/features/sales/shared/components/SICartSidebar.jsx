import React from 'react';
import SICartItem from './SICartItem';
import { lineKey } from '@/features/sales/invoice/hooks/useSalesCart';
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { formatCurrency } from '@/utils/currency';

/** ─────────────────────────────────────────────────────────────────────────────
* SICartSidebar.jsx
* Padanan POCartSidebar.jsx untuk Sales Invoice. BEDA UTAMA dari POCartSidebar:
*   - `items` FLAT (bukan `vendorGroups`) — tidak dikelompokkan, karena 1 cart
*     Sales Invoice selalu untuk 1 customer yang sama (dipilih di header
*     container via CustomerPickerModal, bukan per-item seperti Purchasing).
*   - Tidak ada badge/tombol "Pilih Vendor" per baris (lihat SICartItem.jsx)
*     — status customer ditampilkan sekali di summary bar (`customerName`)
*     dan warning kalau belum dipilih.
*   - `onSubmit` (single-button mode, dipakai SalesInvoiceContainer untuk
*     buka SalesInvoiceSubmitModal berisi DRAFT/COMPLETE) TETAP didukung,
*     tapi kalau kamu mau tombol Draft/Complete langsung di sidebar (tanpa
*     modal), tinggal pasang `onSubmitDraft`/`onSubmitComplete` — sama pola
*     seperti POCartSidebar (isSingleButtonMode auto-detect).
* ─────────────────────────────────────────────────────────────────────────────
*/

const SICartSidebar = ({
  items = [], onRemove, onQtyChange, onPriceChange, onUomChange,
  onClearCart, totalItems, totalAmount, summaryRight,
  title = '🧾 Sales Invoice',
  onSubmitDraft, onSubmitComplete,
  onSubmit, submitLabel,
  isSubmitting = false,
  emptyLabel = 'Belum ada produk dipilih.',
  width = '740px',
  description = '',
  onDescriptionChange,
  onLineDescriptionChange, 
  descriptionPlaceholder = 'Keterangan Sales Invoice...',
  customerName,          // ⬅️ nama customer terpilih (undefined/null kalau belum dipilih)
  customerLabel = 'customer',
  onDateServiceChange,      // ← tambahan
  showDateService = false,
  priceLocked = false,      // pembatasan field: harga tidak boleh diubah (role terbatas)
  priceHidden = false,      // pembatasan field: harga disembunyikan
}) => {
  const hasCustomer = !!customerName;
  const isSingleButtonMode = !!onSubmit && !onSubmitDraft && !onSubmitComplete;

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

      {onDescriptionChange && (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0 }}>
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', minHeight: 0 }}>
        {totalItems === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: COLOR.textLt }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🧾</div>
            <p style={{ fontSize: '13px', margin: 0 }}>{emptyLabel}</p>
          </div>
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
        <div style={{ borderTop: `1px solid ${COLOR.border}`, padding: '14px 16px', flexShrink: 0 }}>
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
              ⚠ Belum ada {customerLabel} dipilih. Pilih {customerLabel} dulu di bagian atas sebelum submit.
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
  );
};

export default SICartSidebar;