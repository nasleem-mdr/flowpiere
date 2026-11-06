/** ─────────────────────────────────────────────────────────────────────────────
* SalesOrderImportModal.jsx
* Padanan PurchaseOrderImportModal.jsx untuk sisi PENJUALAN — sumber data
* C_Order/C_OrderLine dengan IsSOTrx=true (Sales Order). Dipicu dari tombol 📥
* di sebelah "Scan QR" pada ShipmentContainer.
*
* Alur 2 langkah:
*   1. Daftar SO Completed (DocStatus CO, IsSOTrx=true)
*   2. Pilih satu → chart stacked "Sudah Dikirim" vs "Di Shipment Lain" vs
*      "Sisa" per produk (QtyOrdered - QtyDelivered) → tombol Import mengisi
*      cart dengan Qty = sisa yang belum dikirim, DAN mengirim data customer
*      SO (C_BPartner_ID + C_BPartner_Location_ID) ke parent supaya header
*      form otomatis terisi customer yang benar.
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

import { useApprovedSalesOrders } from '@/features/material/shipment/hooks/useApprovedSalesOrders';
import { COLOR, RADIUS } from '@/utils/styleTokens';

const SERIES_LABELS = {
  delivered: 'Sudah Dikirim',
  reserved:  'Sedang di Shipment Lain',
  remaining: 'Sisa (akan diimport)',
};

const SalesOrderImportModal = ({ isOpen, warehouseId, onClose, onImport }) => {
  const {
    orders, loadingList, fetchApprovedOrders,
    selectedLines, loadingLines, fetchOrderLines,
    buildChartData, linesToCartItems,
  } = useApprovedSalesOrders();

  const [search, setSearch]           = useState('');
  const [activeOrder, setActiveOrder] = useState(null);
  const [fullyShippedCount, setFullyShippedCount] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setActiveOrder(null);
      fetchApprovedOrders({ warehouseId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, warehouseId]);

  if (!isOpen) return null;

  const handleSearch = (val) => {
    setSearch(val);
    fetchApprovedOrders({ warehouseId, search: val });
  };

  const handleSelectOrder = async (order) => {
    setActiveOrder(order);
    const { allLines, shippableLines } = await fetchOrderLines(order.C_Order_ID);
    setFullyShippedCount(allLines.length - shippableLines.length);
  };

  const handleImport = () => {
    const cartItems = linesToCartItems(selectedLines, activeOrder.C_Order_ID);
    onImport(cartItems, activeOrder);
    onClose();
  };

  const chartData   = buildChartData(selectedLines);
  const statusLabel = (s) => ({ CO: 'Completed' }[s] || s);

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
            {activeOrder ? `🧾 ${activeOrder.DocumentNo}` : '📥 Import dari Sales Order'}
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
          {!activeOrder ? (
            <>
              {/* ── Step 1: daftar SO ───────────────────────────────────── */}
              <input
                type="text"
                value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Cari No. Dokumen SO..."
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '9px 12px',
                  border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.md,
                  fontSize: '14px', marginBottom: '12px', outline: 'none',
                }}
              />

              {loadingList ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>⏳ Memuat daftar SO...</div>
              ) : orders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>
                  Tidak ada Sales Order Completed yang ditemukan.
                </div>
              ) : (
                orders.map(o => (
                  <button
                    key={o.C_Order_ID}
                    onClick={() => handleSelectOrder(o)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      width: '100%', textAlign: 'left', background: '#f7f9ff',
                      border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md,
                      padding: '12px 14px', marginBottom: '8px', cursor: 'pointer',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: COLOR.textDk }}>{o.DocumentNo}</div>
                      <div style={{ fontSize: '11px', color: COLOR.textLt }}>
                        {o.DateOrdered ? new Date(o.DateOrdered).toLocaleDateString('id-ID') : '-'} · {o.CustomerName || '-'}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '11px', fontWeight: 700, color: COLOR.success,
                      background: COLOR.successLt, borderRadius: '20px', padding: '3px 10px',
                    }}>
                      {statusLabel(o.DocStatus)}
                    </span>
                  </button>
                ))
              )}
            </>
          ) : (
            <>
              {/* ── Step 2: preview chart progres + import ──────────────── */}
              <button
                onClick={() => setActiveOrder(null)}
                style={{
                  background: 'none', border: 'none', color: COLOR.primary,
                  fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '4px',
                  fontWeight: 600,
                }}
              >← Pilih SO lain</button>

              <div style={{ fontSize: '11px', color: COLOR.textLt, marginBottom: '12px' }}>
                Customer: <strong style={{ color: COLOR.textDk }}>{activeOrder.CustomerName || '-'}</strong>
              </div>

              {loadingLines ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>⏳ Memuat lines...</div>
              ) : selectedLines.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>
                  {fullyShippedCount > 0
                    ? `Semua ${fullyShippedCount} line SO ini sudah dikirim penuh (atau sedang diproses di Shipment lain). Tidak ada sisa untuk diimport.`
                    : 'SO ini tidak memiliki line.'}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: COLOR.textMd, marginBottom: '8px' }}>
                    Progres Pengiriman per Produk
                  </div>
                  <div style={{ width: '100%', height: 220, marginBottom: '18px' }}>
                    <ResponsiveContainer>
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip
                          formatter={(value, name, props) => [
                            `${value} ${props.payload.uom}`,
                            SERIES_LABELS[name] || name,
                          ]}
                        />
                        <Legend
                          formatter={(value) => SERIES_LABELS[value] || value}
                          wrapperStyle={{ fontSize: '11px' }}
                        />
                        <Bar dataKey="delivered" stackId="a" fill="#9ca3af" />
                        <Bar dataKey="reserved"  stackId="a" fill="#f59e0b" />
                        <Bar dataKey="remaining" stackId="a" fill={COLOR.primary} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {fullyShippedCount > 0 && (
                    <div style={{ fontSize: '11px', color: COLOR.textLt, marginBottom: '10px' }}>
                      ℹ️ {fullyShippedCount} line lain di SO ini sudah dikirim penuh dan disembunyikan.
                    </div>
                  )}

                  <div style={{ fontSize: '12px', fontWeight: 600, color: COLOR.textMd, marginBottom: '8px' }}>
                    Sisa yang Akan Diimport ({selectedLines.length})
                  </div>
                  {selectedLines.map((l, i) => (
                    <div key={l.C_OrderLine_ID ?? i} style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: '13px', padding: '6px 0',
                      borderBottom: i < selectedLines.length - 1 ? `1px solid #eee` : 'none',
                    }}>
                      <div style={{ flex: 1, marginRight: '8px' }}>
                        <span style={{ color: '#333' }}>{l.ProductName}</span>
                        {l.QtyReserved > 0 && (
                          <div style={{ fontSize: '10.5px', color: '#b45309', marginTop: '2px' }}>
                            🔒 {(l.ConversionRate > 0 ? l.QtyReserved / l.ConversionRate : l.QtyReserved).toFixed(2)} {l.UomName} sedang di Shipment lain (belum Complete)
                          </div>
                        )}
                      </div>
                      <span style={{ fontWeight: 700, color: COLOR.textDk, whiteSpace: 'nowrap' }}>
                        {l.QtyRemaining} {l.UomName}
                        <span style={{ fontWeight: 400, color: COLOR.textLt }}> / {l.QtyOrdered} order</span>
                      </span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer — hanya di Step 2 kalau ada sisa untuk diimport */}
        {activeOrder && selectedLines.length > 0 && (
          <div style={{ borderTop: `1px solid ${COLOR.border}`, padding: '14px 18px', flexShrink: 0 }}>
            <button
              onClick={handleImport}
              style={{
                background: COLOR.primary, color: '#fff', border: 'none',
                padding: '13px', width: '100%', borderRadius: RADIUS.md,
                fontWeight: 700, fontSize: '14px', cursor: 'pointer',
              }}
            >
              📥 Import {selectedLines.length} Item dari {activeOrder.DocumentNo}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesOrderImportModal;
