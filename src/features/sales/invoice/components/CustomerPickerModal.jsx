import React, { useState } from 'react';
import { useCustomerSearch } from '@/shared/hooks/useCustomerSearch'; // ⬅️ SESUAIKAN: kalau belum ada, bisa clone useVendorSearch dan filter IsCustomer eq true
import { COLOR, RADIUS } from '@/utils/styleTokens';

// ─────────────────────────────────────────────────────────────────────────────
// CustomerPickerModal.jsx
// Padanan VendorPickerModal.jsx — cari & pilih 1 customer (C_BPartner dengan
// IsCustomer eq true). onSelect dipanggil dengan { C_BPartner_ID, Name,
// locationId } — locationId sudah di-resolve di sini supaya pemanggil tidak
// perlu fetch lagi (sama pola seperti VendorPickerModal).
// ─────────────────────────────────────────────────────────────────────────────
const CustomerPickerModal = ({ isOpen, onClose, onSelect }) => {
  const { customers, loading, search, getDefaultBPLocation } = useCustomerSearch();
  const [query, setQuery] = useState('');
  const [resolving, setResolving] = useState(false);

  if (!isOpen) return null;

  const handlePick = async (customer) => {
    setResolving(true);
    const locationId = await getDefaultBPLocation(customer.C_BPartner_ID);
    setResolving(false);
    if (!locationId) {
      alert(`Customer "${customer.Name}" tidak memiliki alamat aktif. Tambahkan alamat customer dulu di Business Partner.`);
      return;
    }
    onSelect({ C_BPartner_ID: customer.C_BPartner_ID, Name: customer.Name, locationId });
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
          <span style={{ fontWeight: 700, fontSize: '14px', color: COLOR.textDk }}>👤 Pilih Customer</span>
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
            placeholder="Cari nama customer..."
            style={{
              width: '100%', boxSizing: 'border-box', padding: '9px 12px',
              border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.md,
              fontSize: '13px', outline: 'none',
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', minHeight: 0 }}>
          {resolving ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: COLOR.textLt, fontSize: '13px' }}>⏳ Memuat alamat customer...</div>
          ) : loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: COLOR.textLt, fontSize: '13px' }}>Mencari...</div>
          ) : !query ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: COLOR.textLt, fontSize: '13px' }}>Ketik nama customer untuk mencari.</div>
          ) : customers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: COLOR.textLt, fontSize: '13px' }}>Customer tidak ditemukan.</div>
          ) : (
            customers.map(c => (
              <div
                key={c.C_BPartner_ID}
                onClick={() => handlePick(c)}
                style={{
                  padding: '10px 12px', fontSize: '13px', cursor: 'pointer',
                  color: COLOR.textDk, borderRadius: RADIUS.sm,
                  border: `1px solid ${COLOR.border}`, marginBottom: '6px',
                }}
              >
                <strong>{c.Name}</strong>
                {c.Value ? <span style={{ color: COLOR.textLt }}> ({c.Value})</span> : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerPickerModal;