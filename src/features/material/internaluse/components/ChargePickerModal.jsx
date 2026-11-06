/**  ─────────────────────────────────────────────────────────────────────────────
* ChargePickerModal.jsx
* Padanan VendorPickerModal.jsx tapi untuk C_Charge (akun/alasan pemakaian
* internal) — dipakai sebagai fallback kalau produk tidak punya
* M_Product.Default_C_Charge_ID.
* ─────────────────────────────────────────────────────────────────────────────
*/

import React, { useState, useCallback } from 'react';
import { idempiereApi, fkId } from '@/api/idempiereApi';
import { COLOR, RADIUS } from '@/utils/styleTokens';

const ChargePickerModal = ({ isOpen, onClose, onSelect }) => {
  const [query, setQuery]     = useState('');
  const [charges, setCharges] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q) => {
    setQuery(q);
    if (!q) { setCharges([]); return; }
    setLoading(true);
    try {
      const safeQ = q.toUpperCase().replace(/'/g, "''");
      const res = await idempiereApi(
        `/models/c_charge?$select=C_Charge_ID,Name&$filter=IsActive eq true and contains(toupper(Name),'${safeQ}')&$orderby=Name&$top=30`
      );
      const records = Array.isArray(res.records) ? res.records : [];
      setCharges(records.map(c => ({ C_Charge_ID: fkId(c.C_Charge_ID) ?? c.id, Name: c.Name })));
    } catch (err) {
      console.error('[ChargePickerModal] search error:', err);
      setCharges([]);
    } finally {
      setLoading(false);
    }
  }, []);

  if (!isOpen) return null;

  const handlePick = (charge) => {
    onSelect(charge);
    setQuery('');
    setCharges([]);
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
          <span style={{ fontWeight: 700, fontSize: '14px', color: COLOR.textDk }}>🏷️ Pilih Charge</span>
          <button
            onClick={() => { setQuery(''); setCharges([]); onClose(); }}
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
            onChange={e => search(e.target.value)}
            placeholder="Cari nama Charge (mis. Pemakaian Internal)..."
            style={{
              width: '100%', boxSizing: 'border-box', padding: '9px 12px',
              border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.md,
              fontSize: '13px', outline: 'none',
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', minHeight: 0 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: COLOR.textLt, fontSize: '13px' }}>Mencari...</div>
          ) : !query ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: COLOR.textLt, fontSize: '13px' }}>Ketik nama Charge untuk mencari.</div>
          ) : charges.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: COLOR.textLt, fontSize: '13px' }}>Charge tidak ditemukan.</div>
          ) : (
            charges.map(c => (
              <div
                key={c.C_Charge_ID}
                onClick={() => handlePick(c)}
                style={{
                  padding: '10px 12px', fontSize: '13px', cursor: 'pointer',
                  color: COLOR.textDk, borderRadius: RADIUS.sm,
                  border: `1px solid ${COLOR.border}`, marginBottom: '6px',
                }}
              >
                {c.Name}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ChargePickerModal;
