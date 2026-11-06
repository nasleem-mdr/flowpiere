import React, { useState, useEffect, useRef } from 'react';

import { BottomSheet, QtyStepper } from '@/shared/components/common';

import { useUomConversion } from '@/shared/hooks/useUomConversion';

import { COLOR, RADIUS } from '@/utils/styleTokens';
import { 
  getProductImageBlobUrls, 
  getProductAvailability 
} from '@/api/idempiereApi';

import '@/css/ProductDetailSheet.css';

const ProductDetailSheet = ({
  isOpen,
  product,
  onClose,
  onConfirm,
  confirmLabel = 'Tambah ke Keranjang',
}) => {
  const [qty, setQty]                   = useState(1);
  const [uom, setUom]                   = useState(null);
  const [uomOptions, setUomOptions]     = useState([]); // ← BARU: hasil fetchUomOptions, bukan product.uomOptions (yang tidak pernah terisi)
  const [images, setImages]             = useState([]);
  const [activeIdx, setActiveIdx]       = useState(0);
  const [imageLoading, setImageLoading] = useState(false);
  const [stock, setStock]               = useState(null);
  const [stockLoading, setStockLoading] = useState(false);
  const touchStartX                     = useRef(null);

  const { fetchUomOptions } = useUomConversion();

  // ── Reset qty & uom saat produk berganti ──────────────────────────────────
  useEffect(() => {
    if (product) {
      setQty(1);
      setUom({ C_UOM_ID: product.C_UOM_ID, Name: product.C_UOM_Name, multiplyRate: 1 });
      setUomOptions([]); // reset dulu — diisi ulang oleh effect fetch di bawah
    }
  }, [product]);

  // ── Fetch pilihan UOM (base + semua konversi produk ini) ──────────────────
  // SEBELUMNYA komponen ini baca `product.uomOptions`, yang TIDAK PERNAH
  // diisi di mana pun — jadi dropdown UOM selalu dead code (user tidak
  // pernah bisa pilih UOM selain dasar). Sekarang fetch langsung di sini,
  // lazy per-produk saat sheet dibuka (bukan di list pencarian, supaya
  // tidak query C_UOM_Conversion untuk SETIAP baris hasil pencarian).
  useEffect(() => {
    let cancelled = false;
    if (isOpen && product?.M_Product_ID && product?.C_UOM_ID) {
      fetchUomOptions(product.M_Product_ID, product.C_UOM_ID, product.C_UOM_Name)
        .then(options => { if (!cancelled) setUomOptions(options); });
    }
    return () => { cancelled = true; };
  }, [isOpen, product?.M_Product_ID, product?.C_UOM_ID, product?.C_UOM_Name, fetchUomOptions]);

  // ── Fetch semua image attachment ──────────────────────────────────────────
  useEffect(() => {
    let cancelled  = false;
    let loadedUrls = [];

    if (isOpen && product?.M_Product_ID) {
      setImageLoading(true);
      setImages([]);
      setActiveIdx(0);

      getProductImageBlobUrls(product.M_Product_ID)
        .then(imgs => {
          if (cancelled) {
            imgs.forEach(i => URL.revokeObjectURL(i.url));
            return;
          }
          loadedUrls = imgs;
          setImages(imgs);
        })
        .finally(() => { if (!cancelled) setImageLoading(false); });
    }

    return () => {
      cancelled = true;
      loadedUrls.forEach(i => URL.revokeObjectURL(i.url));
    };
  }, [isOpen, product?.M_Product_ID]);

  // ── Fetch stock availability ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    if (isOpen && product?.M_Product_ID) {
      setStockLoading(true);
      setStock(null);
      getProductAvailability(product.M_Product_ID)
        .then(data => { if (!cancelled) setStock(data); })
        .finally(() => { if (!cancelled) setStockLoading(false); });
    }

    return () => { cancelled = true; };
  }, [isOpen, product?.M_Product_ID]);

  // ── Swipe handler ─────────────────────────────────────────────────────────
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) setActiveIdx(i => Math.min(i + 1, images.length - 1));
    if (delta > 0) setActiveIdx(i => Math.max(i - 1, 0));
  };

  if (!product) return null;

  const hasMultiUom = uomOptions.length > 1;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} maxHeight="90dvh" position="center">
      <div className="pds-wrapper">

        {/* Header */}
        <div className="pds-header">
          <div className="pds-header-info">
            <div className="pds-product-name" style={{ color: COLOR.textDk }}>
              {product.Name}
            </div>
            <div className="pds-meta-row">
              <span className="pds-product-value" style={{ color: COLOR.textLt }}>
                {product.Value}
              </span>
              {product.VendorName && (
                <span
                  className="pds-vendor-badge"
                  style={{ color: COLOR.vendor, background: COLOR.vendorBg }}
                >
                  🏭 Vendor : {product.VendorName}
                </span>
              )}
            </div>
          </div>
          <button className="pds-close-btn" onClick={onClose} style={{ color: COLOR.textMd }}>
            ✕
          </button>
        </div>

        {/* Scroll Area */}
        <div className="pds-scroll-area">

          {/* Image Carousel */}
          {imageLoading && (
            <div className="pds-image-placeholder" style={{ background: COLOR.bg, color: COLOR.textLt }}>
              Memuat gambar...
            </div>
          )}

          {!imageLoading && images.length > 0 && (
            <div
              className="pds-image-container"
              style={{ background: COLOR.bg, position: 'relative', userSelect: 'none' }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <img 
                src={images[activeIdx].url} 
                alt={`${product.Name} ${activeIdx + 1}`}
                onError={(e) => {
                  console.warn('Gagal load image blob, mungkin sudah di-revoke:', images[activeIdx].name);
                  // opsional: skip ke gambar berikutnya kalau ada, atau sembunyikan
                }}
                />

              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setActiveIdx(i => Math.max(i - 1, 0))}
                    disabled={activeIdx === 0}
                    className="pds-carousel-btn pds-carousel-prev"
                  >‹</button>
                  <button
                    onClick={() => setActiveIdx(i => Math.min(i + 1, images.length - 1))}
                    disabled={activeIdx === images.length - 1}
                    className="pds-carousel-btn pds-carousel-next"
                  >›</button>

                  <div className="pds-carousel-dots">
                    {images.map((_, i) => (
                      <span
                        key={i}
                        onClick={() => setActiveIdx(i)}
                        className="pds-carousel-dot"
                        style={{ background: i === activeIdx ? COLOR.primary : COLOR.border }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Description */}
          {product.Description && (
            <div className="pds-description" style={{ color: COLOR.textMd, background: COLOR.bg }}>
              {product.Description}
            </div>
          )}

          {/* Stock Loading */}
          {stockLoading && (
            <div className="pds-stock-loading" style={{ color: COLOR.textLt }}>
              Memuat ketersediaan stok...
            </div>
          )}

          {/* Stock Box */}
          {!stockLoading && stock && (
            <div className="pds-stock-box" style={{ border: `1px solid ${COLOR.border}` }}>
              <div
                className="pds-stock-header"
                style={{ background: stock.totals.qtyAvailable > 0 ? COLOR.successLt : COLOR.dangerLt }}
              >
                <span className="pds-stock-label" style={{ color: COLOR.textMd }}>
                  📦 Produk tersedia di gudang
                </span>
                <span
                  className="pds-stock-qty"
                  style={{ color: stock.totals.qtyAvailable > 0 ? COLOR.success : COLOR.danger }}
                >
                  {stock.totals.qtyAvailable.toLocaleString('id-ID')} {product.C_UOM_Name || 'EA'}
                </span>
              </div>

              {stock.perLocator.length > 0 && (
                <div className="pds-stock-locators">
                  {stock.perLocator.map(loc => (
                    <div key={loc.locatorId} className="pds-stock-locator-row" style={{ color: COLOR.textMd }}>
                      <span style={{ color: COLOR.textLt }}>{loc.locatorName}</span>
                      <span>
                        {loc.qtyAvailable.toLocaleString('id-ID')} {product.C_UOM_Name || 'EA'}
                        {loc.qtyReserved > 0 && (
                          <span style={{ color: COLOR.textLt }}>
                            {' '}(reserved: {loc.qtyReserved.toLocaleString('id-ID')})
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Qty + UoM */}
          <div className="pds-qty-uom-row">
            <div className="pds-qty-col">
              <div className="pds-field-label" style={{ color: COLOR.textMd }}>Jumlah</div>
              <QtyStepper value={qty} onChange={setQty} size="sm" />
            </div>

            <div className="pds-uom-col">
              <div className="pds-field-label" style={{ color: COLOR.textMd }}>Satuan (UoM)</div>
              {hasMultiUom ? (
                <select
                  className="pds-uom-select"
                  value={uom?.C_UOM_ID}
                  onChange={e => {
                    const chosen = uomOptions.find(
                      u => String(u.C_UOM_ID) === e.target.value
                    );
                    if (chosen) setUom(chosen);
                  }}
                  style={{ color: COLOR.textDk, background: COLOR.bg, borderColor: COLOR.border }}
                >
                  {uomOptions
                    .filter(u => u.C_UOM_ID != null)
                    .map(u => (
                      <option key={u.C_UOM_ID} value={String(u.C_UOM_ID)}>{u.Name}</option>
                    ))
                  }
                </select>
              ) : (
                <div
                  className="pds-uom-display"
                  style={{ color: COLOR.textDk, background: COLOR.bg, borderColor: COLOR.border }}
                >
                  {product.C_UOM_Name || 'EA'}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="pds-footer" style={{ borderTopColor: COLOR.border, background: COLOR.surface }}>
          <button
            className="pds-confirm-btn"
            onClick={() => { if (qty > 0) onConfirm(product, qty, uom); }}
            style={{ background: COLOR.primary, borderRadius: RADIUS.md }}
          >
            ➕ {confirmLabel}
          </button>
        </div>

      </div>
    </BottomSheet>
  );
};

export default ProductDetailSheet;
