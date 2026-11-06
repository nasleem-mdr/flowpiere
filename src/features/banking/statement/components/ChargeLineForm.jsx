import React, { useState, useEffect } from 'react';
import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';
import { COLOR, RADIUS } from '@/utils/styleTokens';

// Form sederhana (bukan modal besar) — user pilih C_Charge_ID + input amount
// (boleh + boleh -, sesuai jawaban Anda: jasa giro = pendapatan/+, biaya
// admin/PPh final = biaya/-).
const ChargeLineForm = ({ isOpen, onClose, onAdd }) => {
  const [charges, setCharges] = useState([]);
  const [chargeId, setChargeId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    idempiereApi(`/models/c_charge?$filter=IsActive eq true&$select=C_Charge_ID,Name&$orderby=Name&$top=200`)
      .then(res => setCharges(Array.isArray(res.records) ? res.records : []))
      .catch(() => setCharges([]));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAdd = () => {
    const amt = parseFloat(amount);
    if (!chargeId || !amt) return;
    const charge = charges.find(c => (c.id ?? c.C_Charge_ID) === parseInt(chargeId));
    onAdd({
      type: 'charge',
      key: `charge-${Date.now()}`,
      C_Charge_ID: parseInt(chargeId),
      ChargeName: charge?.Name || '',
      StmtAmt: amt,
      TrxAmt: amt,
      Description: description,
    });
    setChargeId(''); setAmount(''); setDescription('');
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 310, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: COLOR.surface, width: '90%', maxWidth: '360px', borderRadius: RADIUS.lg, padding: '16px' }}>
        <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px' }}>Tambah Transaksi Bank (Charge)</div>

        <label style={{ fontSize: '11px', color: COLOR.textLt }}>Charge</label>
        <select value={chargeId} onChange={e => setChargeId(e.target.value)}
          style={{ width: '100%', padding: '8px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm, marginBottom: '10px' }}>
          <option value="">-- Pilih Charge --</option>
          {charges.map(c => <option key={c.id ?? c.C_Charge_ID} value={c.id ?? c.C_Charge_ID}>{c.Name}</option>)}
        </select>

        <label style={{ fontSize: '11px', color: COLOR.textLt }}>Jumlah (+ jasa giro, - biaya admin/PPh)</label>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="mis. -25000 atau 15000"
          style={{ width: '100%', padding: '8px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm, marginBottom: '10px', boxSizing: 'border-box' }} />

        <label style={{ fontSize: '11px', color: COLOR.textLt }}>Keterangan (opsional)</label>
        <input type="text" value={description} onChange={e => setDescription(e.target.value)}
          style={{ width: '100%', padding: '8px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm, marginBottom: '14px', boxSizing: 'border-box' }} />

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md, background: 'none' }}>Batal</button>
          <button onClick={handleAdd} disabled={!chargeId || !amount}
            style={{ flex: 1, padding: '10px', border: 'none', borderRadius: RADIUS.md, background: COLOR.primary, color: '#fff', fontWeight: 700, opacity: (!chargeId || !amount) ? 0.5 : 1 }}>
            Tambahkan
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChargeLineForm;