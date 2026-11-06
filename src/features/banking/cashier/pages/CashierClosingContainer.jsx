import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dialog, AddIcon } from '@/shared/components';
import { useBankAccounts, getLoginInfo } from '@/shared/hooks';
import { useAccess } from '@/context/AccessContext';
import { COLOR, RADIUS } from '@/utils/styleTokens';

import ChargeLineForm from '@/features/banking/statement/components/ChargeLineForm';
import { useBankStatementCart, lineKey } from '@/features/banking/cashier/hooks/useBankStatementCart';
import { useBankStatementSubmit } from '@/features/banking/statement/hooks/useBankStatementSubmit';
import { useCashierClosingLines } from '@/features/banking/cashier/hooks/useCashierClosingLines';

const todayLocalISO = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const fmt = n => (n || 0).toLocaleString('id-ID');

const CashierClosingContainer = () => {
  const [dialog, setDialog] = useState({ isOpen: false, title: '', message: '' });
  const alert = useCallback((message, title = 'Attention') => setDialog({ isOpen: true, title, message }), []);

  const { bankAccounts } = useBankAccounts();
  const { canEdit } = useAccess();
  const canSubmit = canEdit('banking'); // ganti ke modul 'cashierclosing' bila sudah didaftarkan
  const loginInfo = getLoginInfo();
  const currentUserId = loginInfo?.userId;
  const userName = loginInfo?.userName || loginInfo?.username || loginInfo?.name || '';

  const [statementDate, setStatementDate] = useState(todayLocalISO());
  const [balances, setBalances] = useState({}); // { [bankId]: beginningBalance }

  // Add Charge: langkah 1 pilih bank, langkah 2 isi form charge
  const [bankPickOpen, setBankPickOpen] = useState(false);
  const [chargeBankId, setChargeBankId] = useState('');
  const [chargeFormOpen, setChargeFormOpen] = useState(false);

  // Kumpulkan error per bank selama proses posting (agar tidak saling menimpa dialog)
  const errorsRef = useRef([]);
  const collectError = useCallback((message) => { errorsRef.current.push(message); }, []);

  const { cart, addItems, addChargeLine, removeItem, removeItems, updateStmtAmt } = useBankStatementCart();
  const { submit, fetchBeginningBalance, isSubmitting } = useBankStatementSubmit({ onError: collectError });
  const { loading, fetchLines } = useCashierClosingLines();

  // ── Load unreconciled AR payment langsung saat form dibuka ──────────────
  // Filter: payment buatan user login (sesuai laporan "User skgUser").
  // Mau semua user? ganti createdById menjadi null.
  const loadPayments = useCallback(async () => {
    const items = await fetchLines({ createdById: currentUserId || null });
    addItems(items); // dedup by lineKey
  }, [fetchLines, addItems, currentUserId]);

  useEffect(() => { loadPayments(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // ── Grup per bank ───────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const map = new Map();
    cart.forEach(item => {
      const k = String(item.C_BankAccount_ID);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    });
    const order = bankAccounts.map(b => String(b.id));
    return [...map.entries()]
      .map(([bankId, items]) => ({
        bankId,
        name: bankAccounts.find(b => String(b.id) === bankId)?.name || `Bank #${bankId}`,
        items,
        subtotal: items.reduce((s, i) => s + (i.StmtAmt || 0), 0),
      }))
      .sort((a, b) => order.indexOf(a.bankId) - order.indexOf(b.bankId));
  }, [cart, bankAccounts]);

  const grandTotal = groups.reduce((s, g) => s + g.subtotal, 0);

  // ── Opening balance per bank ────────────────────────────────────────────
  const loadBalances = useCallback(async (bankIds) => {
    const entries = await Promise.all(bankIds.map(async id => [id, await fetchBeginningBalance(id)]));
    setBalances(prev => ({ ...prev, ...Object.fromEntries(entries) }));
  }, [fetchBeginningBalance]);

  const bankIdsKey = groups.map(g => g.bankId).join(',');
  useEffect(() => {
    const missing = groups.map(g => g.bankId).filter(id => balances[id] === undefined);
    if (missing.length) loadBalances(missing);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankIdsKey]);

  // ── Posting: 1 Bank Statement per bank ──────────────────────────────────
  const handleSubmit = async (submitMode) => {
    errorsRef.current = [];
    const done = [];
    const failed = [];

    for (const g of groups) {
      const { result, hadError } = await submit(g.items, {
        bankAccountId: g.bankId,
        beginningBalance: balances[g.bankId] ?? 0,
        statementDate,
        submitMode,
      });
      if (result) {
        done.push({ bank: g.name, docNo: result.documentNo, status: result.status });
        if (!hadError) removeItems(g.items.map(lineKey));
      } else {
        failed.push(g.name);
      }
    }

    if (done.length) await loadBalances(groups.map(g => g.bankId));

    const lines = [];
    if (done.length) {
      lines.push(...done.map(d => `✅ ${d.bank}: ${d.docNo} (${d.status === 'Completed' ? 'Completed' : 'Draft'})`));
    }
    if (failed.length) {
      lines.push('', ...failed.map(f => `❌ ${f}`), '', ...errorsRef.current);
    }
    alert(lines.join('\n'), failed.length ? (done.length ? 'Sebagian Berhasil' : 'Error') : 'Success');
  };

  // ── Add Charge ──────────────────────────────────────────────────────────
  const startAddCharge = () => {
    setChargeBankId(prev => prev || (bankAccounts[0] ? String(bankAccounts[0].id) : ''));
    setBankPickOpen(true);
  };
  const confirmBank = () => {
    if (!chargeBankId) return;
    setBankPickOpen(false);
    setChargeFormOpen(true);
  };
  const handleAddCharge = (item) => addChargeLine({ ...item, C_BankAccount_ID: String(chargeBankId) });

  const chargeBankName = bankAccounts.find(b => String(b.id) === String(chargeBankId))?.name;

  return (
    <div style={{ flex: 1, minHeight: 0, background: COLOR.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Dialog
        isOpen={dialog.isOpen} title={dialog.title}
        message={<div style={{ whiteSpace: 'pre-line' }}>{dialog.message}</div>}
        onClose={() => setDialog({ isOpen: false, title: '', message: '' })}
      />

      {/* Pilih bank untuk charge */}
      {bankPickOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setBankPickOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: COLOR.surface, width: '90%', maxWidth: '380px', borderRadius: RADIUS.lg, padding: '16px' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '10px' }}>Add Charge — Pilih Bank/Kas</div>
            <select
              value={chargeBankId}
              onChange={e => setChargeBankId(e.target.value)}
              style={{ width: '100%', padding: '8px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm, boxSizing: 'border-box' }}
            >
              {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
              <button onClick={() => setBankPickOpen(false)} style={{ padding: '8px 14px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md, background: 'none' }}>Cancel</button>
              <button onClick={confirmBank} disabled={!chargeBankId} style={{ padding: '8px 14px', border: 'none', borderRadius: RADIUS.md, background: COLOR.primary, color: '#fff', fontWeight: 700 }}>Lanjut</button>
            </div>
          </div>
        </div>
      )}

      <ChargeLineForm isOpen={chargeFormOpen} onClose={() => setChargeFormOpen(false)} onAdd={handleAddCharge} bankAccountName={chargeBankName} />

      <div className='header-content'>
        <span style={{ color: '#000', fontWeight: 700, fontSize: '15px' }}>🧾 Tutup Kasir</span>
      </div>

      {/* Header: tanggal, user, Add Charge, Refresh */}
      <div style={{ padding: '14px', background: COLOR.surface, marginBottom: '3px', borderBottom: `1px solid ${COLOR.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', flexWrap: 'wrap' }}>
          <label htmlFor="closingDate" style={{ fontWeight: 600 }}>Tanggal</label>
          <input
            id="closingDate" type="date" value={statementDate}
            onChange={e => setStatementDate(e.target.value)}
            style={{ padding: '5px 8px', height: '30px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md }}
          />
          {userName && <span style={{ marginLeft: 'auto' }}>User: <b>{userName}</b></span>}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <button
            onClick={startAddCharge}
            style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '4px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md, background: 'none', fontWeight: 600, height: '38px' }}
          >
            <AddIcon size={16} /> Add Charge
          </button>
          <button
            onClick={loadPayments} disabled={loading || isSubmitting}
            style={{ padding: '8px 14px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md, background: 'none', fontWeight: 600, height: '38px' }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Daftar per bank */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && cart.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: COLOR.textLt }}>⏳ Loading...</div>
        ) : groups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: COLOR.textLt }}>Tidak ada AR Payment yang belum direkonsiliasi.</div>
        ) : groups.map(g => {
          const opening = balances[g.bankId];
          const ending = (opening ?? 0) + g.subtotal;
          return (
            <div key={g.bankId} style={{ background: COLOR.surface, border: `1px solid ${COLOR.border}`, marginBottom: '8px' }}>
              {/* Header bank + opening balance */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', fontSize: '13px', fontWeight: 700, borderBottom: `1px solid ${COLOR.border}` }}>
                <span>{g.name}</span>
                <span style={{ fontWeight: 600 }}>
                  Opening Balance&nbsp;&nbsp;{opening === undefined ? '…' : fmt(opening)}
                </span>
              </div>

              {g.items.map(item => (
                <div key={lineKey(item)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>
                      {item.type === 'payment' ? `${item.DocumentNo} — ${item.BPName}` : `⚙️ ${item.ChargeName}`}
                    </div>
                    {item.Description && <div style={{ fontSize: '11px', color: COLOR.textLt }}>{item.Description}</div>}
                  </div>
                  <input
                    type="number" value={item.StmtAmt}
                    onChange={e => updateStmtAmt(lineKey(item), parseFloat(e.target.value) || 0)}
                    style={{ width: '120px', padding: '6px', height: '28px', textAlign: 'right', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm, color: item.StmtAmt >= 0 ? COLOR.success : '#dc2626', fontWeight: 700 }}
                  />
                  <button onClick={() => removeItem(lineKey(item))} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '16px', cursor: 'pointer' }}>✕</button>
                </div>
              ))}

              {/* Ending balance */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', fontSize: '13px', fontWeight: 700, borderTop: `2px solid ${COLOR.border}` }}>
                <span style={{ fontWeight: 500, color: COLOR.textLt }}>Subtotal: {fmt(g.subtotal)}</span>
                <span>
                  Ending Balance&nbsp;&nbsp;
                  <span style={{ color: COLOR.primary }}>{opening === undefined ? '…' : fmt(ending)}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {canSubmit && groups.length > 0 && (
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${COLOR.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: COLOR.surface }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              disabled={isSubmitting || !statementDate}
              onClick={() => handleSubmit('draft')}
              style={{ padding: '7px 12px', fontSize: '12px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md, background: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              Simpan Draft
            </button>
            <button
              disabled={isSubmitting || !statementDate}
              onClick={() => handleSubmit('complete')}
              style={{ padding: '7px 14px', fontSize: '12px', border: 'none', borderRadius: RADIUS.md, background: COLOR.primary, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              {isSubmitting ? 'Memproses…' : `Tutup Kasir (${groups.length} Statement)`}
            </button>
          </div>
          <div style={{ fontSize: '12px', color: COLOR.textLt, textAlign: 'right', paddingRight: '20px' }}>
            Total Semua Bank
            <div style={{ fontSize: '15px', fontWeight: 700, color: grandTotal >= 0 ? COLOR.success : '#dc2626' }}>
              {fmt(grandTotal)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashierClosingContainer;
