/** ─────────────────────────────────────────────────────────────────────────────
* POReceiptDetailModal.jsx
* REVISI dari PurchaseOrderImportModal.jsx — Step 1 (daftar PO + search) DIHAPUS
* karena daftar PO sekarang jadi grid utama GoodsReceiptContainer. Modal ini
* hanya tinggal Step 2: dibuka dengan `order` yang diklik di grid, menampilkan
* chart "Sudah Diterima" vs "Sisa" per produk, lalu tombol menambahkan sisa
* tsb ke Daftar Penerimaan (cart).
*
* Logika qty tetap dari useApprovedPurchaseOrders (fetchOrderLines,
* buildChartData, linesToCartItems) — bentuk item cart tidak berubah.
* ─────────────────────────────────────────────────────────────────────────────
*/
import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid,
  Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';

import {
  useApprovedPurchaseOrders
} from '@/features/material/receipt/hooks/useApprovedPurchaseOrders';

import { COLOR, RADIUS } from '@/utils/styleTokens';

const fmtQty = (n) => Number(Number(n).toFixed(2)).toString();

const POReceiptDetailModal = ({ isOpen, order, onClose, onConfirm }) => {
  const {
    selectedLines, loadingLines, fetchOrderLines,
    buildChartData, linesToCartItems,
  } = useApprovedPurchaseOrders();
  const [fullyReceivedCount, setFullyReceivedCount] = useState(0);

  const orderId = order?.C_Order_ID;

  useEffect(() => {
    if (!isOpen || orderId == null) return;
    let cancelled = false;
    setFullyReceivedCount(0);
    (async () => {
      const { allLines, receivableLines } = await fetchOrderLines(orderId);
      if (!cancelled) setFullyReceivedCount(allLines.length - receivableLines.length);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, orderId]);

  if (!isOpen || !order) return null;

  const handleConfirm = () => {
    const cartItems = linesToCartItems(selectedLines, order.C_Order_ID);
    onConfirm(cartItems, order);
  };

  const chartData = buildChartData(selectedLines);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1600, padding: '16px',
    }}>
      <div style={{
        background: COLOR.surface, borderRadius: RADIUS.xl,
        width: '100%', maxWidth: '640px', maxHeight: '86vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 18px', borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: '15px', color: COLOR.textDk }}>
            🧾 {order.DocumentNo}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(0,0,0,0.06)', border: 'none', color: COLOR.textMd,
              borderRadius: '50%', width: '30px', height: '30px', fontSize: '16px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', minHeight: 0 }}>
          <div style={{ fontSize: '11px', color: COLOR.textLt, marginBottom: '12px' }}>
            Vendor: <strong style={{ color: COLOR.textDk }}>{order.VendorName || '-'}</strong>
          </div>

          {loadingLines ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>⏳ Memuat lines...</div>
          ) : selectedLines.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>
              {fullyReceivedCount > 0
                ? `Semua ${fullyReceivedCount} line PO ini sudah diterima penuh. Tidak ada sisa untuk diterima.`
                : 'PO ini tidak memiliki line.'}
            </div>
          ) : (
            <>
              <div style={{ fontSize: '12px', fontWeight: 600, color: COLOR.textMd, marginBottom: '8px' }}>
                Progres Penerimaan per Produk
              </div>
              <div style={{ width: '100%', height: 220, marginBottom: '18px' }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(value, name, props) => {
                        const labels = {
                          delivered: 'Sudah Diterima',
                          reserved:  'Sedang di Receipt Lain',
                          remaining: 'Sisa (akan diterima)',
                        };
                        return [`${value} ${props.payload.uom}`, labels[name] || name];
                      }}
                    />
                    <Legend
                      formatter={(value) => ({
                        delivered: 'Sudah Diterima',
                        reserved:  'Sedang di Receipt Lain',
                        remaining: 'Sisa (akan diterima)',
                      }[value] || value)}
                      wrapperStyle={{ fontSize: '11px' }}
                    />
                    <Bar dataKey="delivered" stackId="a" fill="#9ca3af" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="remaining" stackId="a" fill={COLOR.primary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {fullyReceivedCount > 0 && (
                <div style={{ fontSize: '11px', color: COLOR.textLt, marginBottom: '10px' }}>
                  ℹ️ {fullyReceivedCount} line lain di PO ini sudah diterima penuh dan disembunyikan.
                </div>
              )}

              <div style={{ fontSize: '12px', fontWeight: 600, color: COLOR.textMd, marginBottom: '8px' }}>
                Sisa yang Akan Diterima ({selectedLines.length})
              </div>
              {selectedLines.map((l, i) => (
                <div key={l.C_OrderLine_ID ?? i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: '13px', padding: '6px 0',
                  borderBottom: i < selectedLines.length - 1 ? '1px solid #eee' : 'none',
                }}>
                  <div style={{ flex: 1, marginRight: '8px' }}>
                    <span style={{ color: '#333' }}>{l.ProductName}</span>
                    {l.QtyReserved > 0 && (
                      <div style={{ fontSize: '10.5px', color: '#b45309', marginTop: '2px' }}>
                        🔒 {fmtQty(l.QtyReservedEntered)} {l.UomName} sedang di Receipt lain (belum Complete)
                      </div>
                    )}
                  </div>
                  <span style={{ fontWeight: 700, color: COLOR.textDk, whiteSpace: 'nowrap' }}>
                    {fmtQty(l.QtyRemainingEntered)} {l.UomName}
                    <span style={{ fontWeight: 400, color: COLOR.textLt }}> / {fmtQty(l.QtyOrderedEntered)} order</span>
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer — hanya bila ada sisa untuk diterima */}
        {selectedLines.length > 0 && !loadingLines && (
          <div style={{ borderTop: `1px solid ${COLOR.border}`, padding: '14px 18px', flexShrink: 0 }}>
            <button
              onClick={handleConfirm}
              style={{
                background: COLOR.primary, color: '#fff', border: 'none',
                padding: '13px', width: '100%', borderRadius: RADIUS.md,
                fontWeight: 700, fontSize: '14px', cursor: 'pointer',
              }}
            >
              Tambah {selectedLines.length} Item ke Daftar Penerimaan
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default POReceiptDetailModal;
