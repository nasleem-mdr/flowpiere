import React, { useState } from 'react';
import { useVendorSearch } from '@/shared/hooks/useVendorSearch';
import { COLOR, RADIUS } from '@/utils/styleTokens';

// ─────────────────────────────────────────────────────────────────────────────
// VendorPickerModal.jsx
// Modal generic untuk mencari & memilih 1 vendor. Dipakai di 2 tempat:
//   1. POCartItem — tombol "Pilih Vendor" / ganti vendor pada baris cart
//   2. RequisitionToPOImportModal — opsi "Vendor lain" saat produk dari FPB
//      tidak punya data M_Product_PO (tidak ada suggestion otomatis)
//
// onSelect dipanggil dengan { C_BPartner_ID, Name, locationId } — locationId
// sudah di-resolve di sini (via getDefaultBPLocation) supaya pemanggil tidak
// perlu fetch lagi.
// ─────────────────────────────────────────────────────────────────────────────
const VendorPickerModal = ({ isOpen, onClose, onSelect }) => {
  const { vendors, loading, search, getDefaultBPLocation } = useVendorSearch();
  const [query, setQuery] = useState('');
  const [resolving, setResolving] = useState(false);

  if (!isOpen) return null;

  const handlePick = async (vendor) => {
    setResolving(true);
    const locationId = await getDefaultBPLocation(vendor.C_BPartner_ID);
    setResolving(false);
    if (!locationId) {
      alert(`Vendor "${vendor.Name}" tidak memiliki alamat aktif. Tambahkan alamat vendor dulu di Business Partner.`);
      return;
    }
    onSelect({ C_BPartner_ID: vendor.C_BPartner_ID, Name: vendor.Name, locationId });
    setQuery('');
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1700, padding: '16px',
    }}>
      <div style={{
        background: COLOR.surface, borderRadius: RADIUS.xl,
        width: '100%', maxWidth: '420px', maxHeight: '70vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: '14px', color: COLOR.textDk }}>🚚 Pilih Vendor</span>
          <button
            onClick={() => { setQuery(''); onClose(); }}
            style={{
              background: 'rgba(0,0,0,0.06)', border: 'none', color: COLOR.textMd,
              borderRadius: '50%', width: '28px', height: '28px', fontSize: '15px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        <div style={{ padding: '12px 16px', flexShrink: 0 }}>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); search(e.target.value); }}
            placeholder="Cari nama vendor..."
            style={{
              width: '100%', boxSizing: 'border-box', padding: '9px 12px',
              border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.md,
              fontSize: '13px', outline: 'none',
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', minHeight: 0 }}>
          {resolving ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: COLOR.textLt, fontSize: '13px' }}>⏳ Memuat alamat vendor...</div>
          ) : loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: COLOR.textLt, fontSize: '13px' }}>Mencari...</div>
          ) : !query ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: COLOR.textLt, fontSize: '13px' }}>Ketik nama vendor untuk mencari.</div>
          ) : vendors.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: COLOR.textLt, fontSize: '13px' }}>Vendor tidak ditemukan.</div>
          ) : (
            vendors.map(v => (
              <div
                key={v.C_BPartner_ID}
                onClick={() => handlePick(v)}
                style={{
                  padding: '10px 12px', fontSize: '13px', cursor: 'pointer',
                  color: COLOR.textDk, borderRadius: RADIUS.sm,
                  border: `1px solid ${COLOR.border}`, marginBottom: '6px',
                }}
              >
                <strong>{v.Name}</strong>
                {v.Value ? <span style={{ color: COLOR.textLt }}> ({v.Value})</span> : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default VendorPickerModal;
