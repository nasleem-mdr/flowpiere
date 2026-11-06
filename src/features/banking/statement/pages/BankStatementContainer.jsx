import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, AddIcon, ImportIcon } from '@/shared/components';
import { useBankAccounts, useIsDesktop, getLoginInfo } from '@/shared/hooks';
import { useAccess } from '@/context/AccessContext';
import { COLOR, RADIUS } from '@/utils/styleTokens';

import BankStatementImportModal from '@/features/banking/statement/components/BankStatementImportModal';
import ChargeLineForm from '@/features/banking/statement/components/ChargeLineForm';
import { useBankStatementCart, lineKey } from '@/features/banking/statement/hooks/useBankStatementCart';
import { useBankStatementSubmit } from '@/features/banking/statement/hooks/useBankStatementSubmit';
const todayLocalISO = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const BankStatementContainer = () => {
  const [dialog, setDialog] = useState({ isOpen: false, title: '', message: '' });
  const alert = (message, title = 'Attention') => setDialog({ isOpen: true, title, message });
  
  const { bankAccounts } = useBankAccounts();
  const [bankAccountId, setBankAccountId] = useState(null);
  const [beginningBalance, setBeginningBalance] = useState(0);
  const [statementDate, setStatementDate] = useState(todayLocalISO());
  const [importOpen, setImportOpen] = useState(false);
  const [chargeFormOpen, setChargeFormOpen] = useState(false);
  const selectedBank = bankAccounts.find(b => String(b.id) === String(bankAccountId));
  const { canEdit } = useAccess();
  const canSubmit = canEdit('banking'); 
  const isDesktop = useIsDesktop();
  const { cart, addItems, addChargeLine, removeItem, updateStmtAmt, clearCart, totalItems, totalStmtAmt } = useBankStatementCart();
  const { submit, fetchBeginningBalance, isSubmitting } = useBankStatementSubmit({ onError: alert });

  useEffect(() => {
    if (!bankAccountId) { setBeginningBalance(0); return; }
    fetchBeginningBalance(bankAccountId).then(setBeginningBalance);
    clearCart();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankAccountId]);

  
  const endingBalancePreview = beginningBalance + totalStmtAmt;

  const handleSubmit = async (submitMode) => {
    const { result, hadError } = await submit(cart, { bankAccountId, beginningBalance, statementDate, submitMode });
    if (!result) return;
    alert(`Bank Statement ${result.documentNo} has been successfully ${result.status === 'Completed' ? 'di-Complete' : 'Save as Draft'}.`, 'Success');
    fetchBeginningBalance(bankAccountId).then(setBeginningBalance);
    if (!hadError) { clearCart(); }
  };
  return (
    <div style={{ flex: 1, minHeight: 0, background: COLOR.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Dialog isOpen={dialog.isOpen} title={dialog.title} message={dialog.message} onClose={() => setDialog({ isOpen: false, title: '', message: '' })} />
      <BankStatementImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        bankAccountId={bankAccountId}
        bankAccountName={selectedBank?.name}
        onImport={addItems}
        excludePaymentIds={cart
          .filter(item => item.type === 'payment')
          .map(item => item.C_Payment_ID)
        }
      />
      <ChargeLineForm isOpen={chargeFormOpen} onClose={() => setChargeFormOpen(false)} onAdd={addChargeLine} />
  
      <div className='header-content'>
        <span style={{ color: '#000', fontWeight: 700, fontSize: '15px' }}>🏦 Cash/Bank Statement</span>
      </div>
  
      <div style={{ padding: '14px', background: COLOR.surface, marginBottom:'3px', borderBottom: `1px solid ${COLOR.border}` }}>
          
        <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', height:'38px', marginTop: '4px' }}>
          <select
            value={bankAccountId || ''}
            onChange={e => setBankAccountId(e.target.value || null)}
            style={{
              flex: '1 1 auto', minWidth: 0, padding: '5px',
              border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md,
            }}
          >
            <option value="">-- Choose Bank Account --</option>
            {bankAccounts.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
  
          {bankAccountId && (
            <>
              <button
                onClick={() => setImportOpen(true)}
                title="Import AP/AR"
                style={{
                  padding: isDesktop ? '10px 14px' : '10px',
                  width: isDesktop ? 'auto' : '40px',
                  height: isDesktop ? 'auto' : '40px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', borderRadius: RADIUS.md,
                  background: COLOR.primary, color: '#fff', fontWeight: 600,
                  whiteSpace: 'nowrap', flexShrink: 0,
                  height:'38px',
                }}
                >
                {isDesktop ? (
                  <>
                    <ImportIcon size={16} /> Import AP/AR
                  </>
                ) : (
                  <ImportIcon size={18} />
                )}
              </button>
              <button
                onClick={() => setChargeFormOpen(true)}
                title="Add Charge"
                style={{
                  padding: isDesktop ? '10px 14px' : '10px',
                  width: isDesktop ? 'auto' : '40px',
                  height: isDesktop ? 'auto' : '40px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md,
                  background: 'none', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                  height:'38px',
                }}
                >
                {isDesktop ? (
                  <>
                    <AddIcon size={16} /> Add Charge
                  </>
                ) : (
                  <AddIcon size={18} />
                )}
              </button>
            </>
          )}
        </div>
        {bankAccountId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '13px' }}>
            <label htmlFor="stmtDate" style={{ fontWeight: 600 }}>Statement Date</label>
            <input
              id="stmtDate"
              type="date"
              value={statementDate}
              onChange={e => setStatementDate(e.target.value)}
              style={{
                padding: '5px 8px', height: '30px',
                border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md,
              }}
            />
          </div>
        )}

        {bankAccountId && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '13px' }}>
            <span>Begining Balance: <b>{beginningBalance.toLocaleString('id-ID')}</b></span>
            <span>Ending Balance(preview): <b style={{ color: COLOR.primary }}>{endingBalancePreview.toLocaleString('id-ID')}</b></span>
          </div>
        )}
      </div>
      {bankAccountId && (
        <>
          

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: COLOR.textLt }}>There is no statement line yet.</div>
            ) : cart.map(item => (
              <div key={lineKey(item)} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '32px', padding: '8px', background: COLOR.surface, border: `1px solid ${COLOR.border}`, marginBottom: '3px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>
                    {item.type === 'payment' ? `${item.DocumentNo} — ${item.BPName}` : `⚙️ ${item.ChargeName}`}
                  </div>
                  {item.Description && <div style={{ fontSize: '11px', color: COLOR.textLt }}>{item.Description}</div>}
                </div>
                <input
                  type="number" value={item.StmtAmt}
                  onChange={e => updateStmtAmt(lineKey(item), parseFloat(e.target.value) || 0)}
                  style={{ width: '120px', padding: '6px', height: '28px',textAlign: 'right', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm, color: item.StmtAmt >= 0 ? COLOR.success : '#dc2626', fontWeight: 700 }}
                />
                <button onClick={() => removeItem(lineKey(item))} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '16px', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>

          {canSubmit && cart.length > 0 && (
          <div style={{
            padding: '10px 14px',
            borderTop: `1px solid ${COLOR.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            background: COLOR.surface,
          }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                disabled={isSubmitting || !statementDate}
                onClick={() => handleSubmit('draft')}
                style={{
                  padding: '7px 12px',
                  fontSize: '12px',
                  border: `1px solid ${COLOR.border}`,
                  borderRadius: RADIUS.md,
                  background: 'none',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                Simpan Draft
              </button>
              <button
                disabled={isSubmitting || !statementDate}
                onClick={() => handleSubmit('complete')}
                style={{
                  padding: '7px 14px',
                  fontSize: '12px',
                  border: 'none',
                  borderRadius: RADIUS.md,
                  background: COLOR.primary,
                  color: '#fff',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                Complete
              </button>
            </div>

            <div style={{ fontSize: '12px', color: COLOR.textLt, textAlign: 'right', paddingRight: '20px' }}>
              Total Amount
              <div style={{
                fontSize: '15px',
                fontWeight: 700,
                color: totalStmtAmt >= 0 ? COLOR.success : '#dc2626',
              }}>
                {totalStmtAmt.toLocaleString('id-ID')}
              </div>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
};

export default BankStatementContainer;
