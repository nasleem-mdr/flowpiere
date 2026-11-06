import { useState, useRef, useCallback } from 'react';

import { 
  StockIcon, 
  VendorIcon 
} from '@/shared/components/icon';

import { COLOR } from '@/utils/styleTokens';

import '@/css/ProductCard.css';

const truncateText = (text, maxLength = 12) => {
  if (!text) return '';
  return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
};

const ProductCard = ({ product, onClick }) => {
  const [pressed, setPressed] = useState(false);
  const [tooltipBelow, setTooltipBelow] = useState(false);
  const descRef = useRef(null);

   // Cek ruang di atas elemen sebelum hover selesai render tooltip —
   // kalau kurang dari ~40px (perkiraan tinggi tooltip + jarak), tampilkan
   // ke bawah supaya tidak kepotong overflow container scroll.
   const handleTooltipEnter = useCallback(() => {
     if (!descRef.current) return;
     const rect = descRef.current.getBoundingClientRect();
     setTooltipBelow(rect.top < 65);
   }, []);
  // Produk Service tidak punya stok — jangan tampilkan "Stok: 0" merah.
  const isService = product.isService === true || (product.ProductType?.id ?? product.ProductType) === 'S';
  const qty = product.QtyOnHand ?? 0;
  const stockColor = qty <= 0 ? '#dc2626' : qty < 10 ? '#d97706' : COLOR.textLt;
  return (
    <div
      onClick={() => onClick(product)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      className={`product-card ${pressed ? 'pressed' : ''}`}
    >
      {/* Nama Produk */}
      <span className="prod-name" style={{ color: COLOR.textDk }}>
        {truncateText(product.Name, 16)}
      </span>

      {/* Kode/Value Produk, diganti dengan Description */}
      <span
        ref={descRef}
        className={`prod-value tooltip-target ${tooltipBelow ? 'tooltip-below' : ''}`}
        onMouseEnter={handleTooltipEnter}
        style={{ color: COLOR.textLt }}
        data-tooltip={product.Description || product.Value || ''}
      >
        {truncateText(product.Description || product.Value, 32)}
      </span>

      {/* Vendor */}
      {product.VendorName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            className="prod-vendor"
            style={{ color: COLOR.vendor, background: COLOR.vendorBg }}
          >
            <VendorIcon size={18}/> {truncateText(product.VendorName, 12)}
          </span>
        </div>
      )}
      {/* Stok (Service: tanpa stok) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isService ? (
          <span className="prod-stock" style={{ color: COLOR.textLt, fontSize: '11px', fontWeight: 600 }}>
            🛠 Jasa (tanpa stok)
          </span>
        ) : (
          <span className="prod-stock" style={{ color: stockColor, fontSize: '11px', fontWeight: 600 }}>
            <StockIcon size={18}/> Stok: {qty.toLocaleString('id-ID')} {product.C_UOM_Name || 'EA'}
          </span>
        )}
      </div>
      {/* Spacer */}
      <div className="prod-spacer" /></div>
    );
  };

export default ProductCard;