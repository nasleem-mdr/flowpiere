import React, { useState, useEffect, useMemo } from 'react';
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { useUnreconciledPaymentLines } from '@/features/banking/statement/hooks/useUnreconciledPaymentLines';
import useSubordinates from '@/shared/hooks/useSubordinates'; 
import { getLoginInfo } from '@/shared/hooks';

const todayISO = () => new Date().toISOString().split('T')[0];


const BankStatementImportModal = ({ isOpen, onClose, bankAccountId, bankAccountName, onImport, excludePaymentIds = [] }) => {
  const { lines: rawLines, loading, fetchLines } = useUnreconciledPaymentLines();
  // Filter out payment yang sudah ada di cart draft induk, supaya tidak
  // bisa ter-import dobel sebelum proses reconcile benar-benar tersimpan
  // di server (server belum tahu payment ini "terpakai").
  const excludeSet = useMemo(() => new Set(excludePaymentIds), [excludePaymentIds]);
  const lines = useMemo(
    () => rawLines.filter(l => !excludeSet.has(l.C_Payment_ID)),
    [rawLines, excludeSet]
  );
  const { subordinates } = useSubordinates();
  const currentUserId = getLoginInfo()?.userId;

  const [docTypeFilter, setDocTypeFilter] = useState(null); // 'AR' | 'AP' | null
  const [createdByOption, setCreatedByOption] = useState('all'); // 'all' | 'mine' | 'team'
  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [selected, setSelected] = useState({});

  // Punya bawahan atau tidak — kalau tidak, opsi "Tim Saya" tidak relevan
  // ditampilkan (subordinates = [] berarti user ini bukan atasan siapapun).
  const hasSubordinates = subordinates.length > 0;

  const createdByIds = useMemo(() => {
    if (createdByOption === 'mine') return currentUserId ? [currentUserId] : [];
    if (createdByOption === 'team') return currentUserId ? [currentUserId, ...subordinates] : subordinates;
    return null; // 'all' — tidak difilter
  }, [createdByOption, currentUserId, subordinates]);

  const runFilter = () => {
    fetchLines({ bankAccountId, docTypeFilter, createdByIds, dateFrom: dateFrom || null, dateTo: dateTo || null });
  };

  // Auto-fetch setiap filter berubah — tidak ada tombol Refresh manual lagi.
  useEffect(() => {
    if (isOpen && bankAccountId) runFilter();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, bankAccountId, docTypeFilter, createdByIds, dateFrom, dateTo]);

  useEffect(() => {
    if (isOpen) {
      setSelected({});
      setDateFrom(todayISO());
      setDateTo(todayISO());
      setDocTypeFilter(null);
      setCreatedByOption('all');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggle = (id) => setSelected(prev => { const n = { ...prev }; if (n[id]) delete n[id]; else n[id] = true; return n; });

  // Select All — dievaluasi terhadap `lines` yang SUDAH difilter exclude
  // (lihat useMemo di atas), jadi otomatis konsisten dengan baris yang
  // benar-benar tampil & bisa dipilih di tabel.
  const allSelected = lines.length > 0 && lines.every(l => selected[l.C_Payment_ID]);

  const toggleSelectAll = () => {
    setSelected(prev => {
      const n = { ...prev };
      if (allSelected) {
        lines.forEach(l => { delete n[l.C_Payment_ID]; });
      } else {
        lines.forEach(l => { n[l.C_Payment_ID] = true; });
      }
      return n;
    });
  };

  const selectedLines = lines.filter(l => selected[l.C_Payment_ID]);

  const sumSelected = selectedLines.reduce((s, l) => s + (l.IsReceipt ? l.PayAmt : -l.PayAmt), 0);

  const handleConfirm = () => {
    const cartItems = selectedLines.map(l => ({
      type: 'payment',
      C_Payment_ID: l.C_Payment_ID,
      DocumentNo:   l.DocumentNo,
      DateTrx:      l.DateTrx,
      StmtAmt:      l.IsReceipt ? l.PayAmt : -l.PayAmt,
      TrxAmt:       l.IsReceipt ? l.PayAmt : -l.PayAmt,
      C_BPartner_ID: l.C_BPartner_ID,
      BPName:        l.BPName,
      C_Invoice_ID:  l.C_Invoice_ID,
      InvoiceLabel:  l.InvoiceLabel,
      C_Currency_ID: l.C_Currency_ID,
    }));
    onImport(cartItems);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: COLOR.surface, width: '95%', maxWidth: '640px', maxHeight: '88vh', borderRadius: RADIUS.lg, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${COLOR.border}` }}>
          <div style={{ fontWeight: 700, fontSize: '14px' }}>Bank Statement — Create Lines From</div>
          <div style={{ fontSize: '11px', color: COLOR.textLt }}>Bank Account: {bankAccountName}</div>
        </div>

        <div
          style={{
            padding: '12px 16px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            borderBottom: `1px solid ${COLOR.border}`,
          }}
        >
          <select
            value={docTypeFilter || ''}
            onChange={e => setDocTypeFilter(e.target.value || null)}
            style={{
              width: '100%', minWidth: 0, boxSizing: 'border-box',
              padding: '8px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm,
            }}
          >
            <option value="">All Type(AR/AP)</option>
            <option value="AR">AR Receipt</option>
            <option value="AP">AP Payment</option>
          </select>

          <select
            value={createdByOption}
            onChange={e => setCreatedByOption(e.target.value)}
            style={{
              width: '100%', minWidth: 0, boxSizing: 'border-box',
              padding: '8px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm,
            }}
          >
            <option value="all">All User</option>
            <option value="mine">Made by myself</option>
            {hasSubordinates && <option value="team">Me + My Team</option>}
          </select>

          <input
            type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{
              width: '100%', minWidth: 0, boxSizing: 'border-box',
              padding: '8px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm,
            }}
          />
          <input
            type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{
              width: '100%', minWidth: 0, boxSizing: 'border-box',
              padding: '8px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm,
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px', color: COLOR.textLt }}>⏳ Loading...</div>
          ) : lines.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: COLOR.textLt }}>There are no unreconciled Payments/Receipts.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: COLOR.bg, textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      disabled={lines.length === 0}
                      title={allSelected ? 'Uncheck all' : 'Select all'}
                    />
                  </th>
                  <th style={{ padding: '8px' }}>Date</th>
                  <th style={{ padding: '8px' }}>Payment</th>
                  <th style={{ padding: '8px' }}>Type</th>
                  <th style={{ padding: '8px' }}>Vendor/Customer</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.C_Payment_ID} style={{ borderTop: `1px solid ${COLOR.border}`, background: selected[l.C_Payment_ID] ? '#e0f2fe' : 'transparent' }}
                    onClick={() => toggle(l.C_Payment_ID)}>
                    <td style={{ padding: '8px' }}><input type="checkbox" checked={!!selected[l.C_Payment_ID]} readOnly /></td>
                    <td style={{ padding: '8px' }}>{l.DateTrx ? new Date(l.DateTrx).toLocaleDateString('id-ID') : '-'}</td>
                    <td style={{ padding: '8px' }}>{l.DocumentNo}</td>
                    <td style={{ padding: '8px' }}>{l.IsReceipt ? '💰 Receipt' : '💸 Payment'}</td>
                    <td style={{ padding: '8px' }}>{l.BPName}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: l.IsReceipt ? COLOR.success : '#dc2626', fontWeight: 600 }}>
                      {l.IsReceipt ? '+' : '-'}{l.PayAmt.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: '10px 16px', borderTop: `1px solid ${COLOR.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 600 }}>
            {selectedLines.length} Selected — Sum {sumSelected.toLocaleString('id-ID')}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={{ padding: '8px 14px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md, background: 'none' }}>Cancel</button>
            <button onClick={handleConfirm} disabled={selectedLines.length === 0}
              style={{ padding: '8px 14px', border: 'none', borderRadius: RADIUS.md, background: COLOR.primary, color: '#fff', fontWeight: 700, opacity: selectedLines.length === 0 ? 0.5 : 1 }}>
              + Add ({selectedLines.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BankStatementImportModal;
