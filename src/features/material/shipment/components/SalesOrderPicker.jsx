/** ─────────────────────────────────────────────────────────────────────────────
* SalesOrderPicker.jsx
* Pengganti ProductGrid pada ShipmentContainer. Grid utama berisi daftar
* Sales Order (Completed) — bukan lagi produk/jasa bebas — sehingga setiap
* item yang masuk ke cart SELALU membawa C_OrderLine_ID.
*
* Alur:
*   1. Daftar SO Completed yang masih punya sisa kirim (cari by No. Dokumen).
*      Begitu cart berisi item, daftar otomatis difilter ke customer yang sama
*      (1 dokumen M_InOut = 1 customer).
*   2. Klik SO → baris produk/jasa dengan sisa kirim. Qty bisa diubah (maks
*      = sisa), lalu "＋" per baris atau "Tambah semua sisa".
*   3. Baris yang sudah ada di cart ditandai ✓ dan tidak bisa ditambah dua kali.
*
* Props:
*   warehouseId   — filter SO per gudang sesi
*   customerId    — kalau terisi, daftar SO dibatasi ke customer ini
*   customerName  — hanya untuk label info
*   cartLineIds   — Set<C_OrderLine_ID> yang sudah ada di cart
*   refreshKey    — naikkan angkanya (mis. setelah submit) untuk memuat ulang
*                   daftar SO & menutup SO yang sedang terbuka
*   onAddLines    — (cartItems, order) => void
* ─────────────────────────────────────────────────────────────────────────────
*/
import React, { useEffect, useState } from 'react';
import { useApprovedSalesOrders } from '@/features/material/shipment/hooks/useApprovedSalesOrders';
import { COLOR, RADIUS } from '@/utils/styleTokens';

const SalesOrderPicker = ({
  warehouseId, customerId, customerName,
  cartLineIds, refreshKey = 0, onAddLines,
}) => {
  const {
    orders, loadingList, fetchApprovedOrders,
    selectedLines, loadingLines, fetchOrderLines,
    linesToCartItems,
  } = useApprovedSalesOrders();

  const [search, setSearch]           = useState('');
  const [activeOrder, setActiveOrder] = useState(null);
  const [qtyMap, setQtyMap]           = useState({}); // { [C_OrderLine_ID]: string|number }
  const [fullyShippedCount, setFullyShippedCount] = useState(0);

  // Daftar SO: muat ulang saat gudang / customer terkunci / refreshKey berubah.
  // Pencarian di-debounce 300ms.
  useEffect(() => {
    if (!warehouseId) return undefined;
    const t = setTimeout(
      () => fetchApprovedOrders({ warehouseId, customerId, search }),
      search ? 300 : 0
    );
    return () => clearTimeout(t);
  }, [warehouseId, customerId, search, refreshKey, fetchApprovedOrders]);

  // Setelah submit (refreshKey naik) → tutup SO yang terbuka, sisa kirimnya sudah berubah.
  useEffect(() => {
    setActiveOrder(null);
    setQtyMap({});
  }, [refreshKey]);

  const openOrder = async (order) => {
    setActiveOrder(order);
    setQtyMap({});
    const { allLines, shippableLines } = await fetchOrderLines(order.C_Order_ID);
    setFullyShippedCount(allLines.length - shippableLines.length);
    setQtyMap(Object.fromEntries(shippableLines.map(l => [l.C_OrderLine_ID, l.QtyRemaining])));
  };

  const addLines = (lines) => {
    const ready = lines
      .filter(l => !cartLineIds.has(l.C_OrderLine_ID))
      .map(l => ({
        ...l,
        MaxQty:       l.QtyRemaining,
        QtyRemaining: Math.min(parseFloat(qtyMap[l.C_OrderLine_ID]) || 0, l.QtyRemaining),
      }))
      .filter(l => l.QtyRemaining > 0);
    if (ready.length === 0) return;

    // linesToCartItems memakai QtyRemaining sebagai Qty → qty yang diketik user.
    // maxQty dibawa ke cart supaya useShipmentSubmit bisa menolak over-delivery.
    const items = linesToCartItems(ready, activeOrder.C_Order_ID)
      .map((it, i) => ({ ...it, maxQty: ready[i].MaxQty }));
    onAddLines(items, activeOrder);
  };

  const addable = selectedLines.filter(l => !cartLineIds.has(l.C_OrderLine_ID));

  // ── Detail satu SO ───────────────────────────────────────────────────────
  if (activeOrder) {
    return (
      <div>
        <button onClick={() => setActiveOrder(null)} style={styles.btnBack}>
          ← Daftar Sales Order
        </button>

        <div style={styles.orderTitle}>{activeOrder.DocumentNo}</div>
        <div style={styles.orderMeta}>
          {activeOrder.CustomerName || '-'}
          {activeOrder.DateOrdered ? ` · ${new Date(activeOrder.DateOrdered).toLocaleDateString('id-ID')}` : ''}
        </div>

        {loadingLines ? (
          <div style={styles.empty}>⏳ Memuat baris order...</div>
        ) : selectedLines.length === 0 ? (
          <div style={styles.empty}>
            {fullyShippedCount > 0
              ? `Semua ${fullyShippedCount} baris SO ini sudah dikirim penuh atau sedang diproses di Shipment lain.`
              : 'SO ini tidak memiliki baris produk/jasa.'}
          </div>
        ) : (
          <>
            {selectedLines.map(l => {
              const inCart = cartLineIds.has(l.C_OrderLine_ID);
              const reservedEntered = l.ConversionRate > 0 ? l.QtyReserved / l.ConversionRate : l.QtyReserved;
              return (
                <div key={l.C_OrderLine_ID} style={{ ...styles.lineRow, opacity: inCart ? 0.55 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.lineName}>{l.ProductName}</div>
                    <div style={styles.lineSub}>
                      Sisa {l.QtyRemaining} {l.UomName} dari {l.QtyOrdered} order
                      {l.QtyReserved > 0 && (
                        <span style={{ color: '#b45309' }}>
                          {' '}· 🔒 {reservedEntered.toFixed(2)} sedang di Shipment lain
                        </span>
                      )}
                    </div>
                  </div>

                  <input
                    type="number"
                    min="0"
                    max={l.QtyRemaining}
                    step="any"
                    value={qtyMap[l.C_OrderLine_ID] ?? ''}
                    disabled={inCart}
                    onChange={e => setQtyMap(q => ({ ...q, [l.C_OrderLine_ID]: e.target.value }))}
                    style={styles.qtyInput}
                  />
                  <span style={styles.uom}>{l.UomName}</span>

                  <button
                    onClick={() => addLines([l])}
                    disabled={inCart}
                    title={inCart ? 'Sudah ada di daftar pengiriman' : 'Tambah ke daftar pengiriman'}
                    style={{
                      ...styles.btnAdd,
                      background: inCart ? COLOR.success : COLOR.primary,
                      cursor: inCart ? 'default' : 'pointer',
                    }}
                  >
                    {inCart ? '✓' : '＋'}
                  </button>
                </div>
              );
            })}

            {fullyShippedCount > 0 && (
              <div style={{ ...styles.lineSub, margin: '10px 0' }}>
                ℹ️ {fullyShippedCount} baris lain sudah dikirim penuh dan disembunyikan.
              </div>
            )}

            {addable.length > 0 && (
              <button onClick={() => addLines(addable)} style={styles.btnAddAll}>
                Tambah semua sisa ({addable.length} baris)
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Daftar SO ────────────────────────────────────────────────────────────
  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Cari No. Dokumen Sales Order..."
        style={styles.search}
      />

      {customerId && (
        <div style={styles.lockInfo}>
          🔒 Menampilkan SO milik <strong>{customerName}</strong>. Kosongkan daftar pengiriman untuk memilih customer lain.
        </div>
      )}

      {loadingList ? (
        <div style={styles.empty}>⏳ Memuat daftar Sales Order...</div>
      ) : orders.length === 0 ? (
        <div style={styles.empty}>
          Tidak ada Sales Order Completed yang masih punya sisa kirim
          {customerId ? ' untuk customer ini' : ''}.
        </div>
      ) : (
        orders.map(o => (
          <button key={o.C_Order_ID} onClick={() => openOrder(o)} style={styles.orderCard}>
            <div style={{ minWidth: 0 }}>
              <div style={styles.orderTitle}>{o.DocumentNo}</div>
              <div style={styles.orderMeta}>
                {o.CustomerName || '-'}
                {o.DateOrdered ? ` · ${new Date(o.DateOrdered).toLocaleDateString('id-ID')}` : ''}
              </div>
            </div>
            <span style={styles.chevron}>›</span>
          </button>
        ))
      )}
    </div>
  );
};

const styles = {
  search: {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px',
    border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.md,
    fontSize: '14px', color: COLOR.textDk, background: COLOR.bg,
    outline: 'none', marginBottom: '12px',
  },
  lockInfo: {
    fontSize: '12px', color: COLOR.textMd, background: '#f4f6fb',
    borderRadius: RADIUS.sm, padding: '8px 10px', marginBottom: '12px',
  },
  empty: { textAlign: 'center', padding: '32px 0', color: COLOR.textLt, fontSize: '13px' },
  orderCard: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
    width: '100%', textAlign: 'left', background: '#f7f9ff',
    border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md,
    padding: '12px 14px', marginBottom: '8px', cursor: 'pointer',
  },
  orderTitle: { fontWeight: 700, fontSize: '14px', color: COLOR.textDk },
  orderMeta:  { fontSize: '12px', color: COLOR.textLt, marginBottom: '2px' },
  chevron:    { fontSize: '20px', color: COLOR.textLt, flexShrink: 0 },
  btnBack: {
    background: 'none', border: 'none', color: COLOR.primary, padding: 0,
    fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginBottom: '10px',
  },
  lineRow: {
    display: 'flex', alignItems: 'center', gap: '8px',
    background: COLOR.surface, border: `1px solid ${COLOR.border}`,
    borderRadius: RADIUS.md, padding: '10px 12px', marginBottom: '8px',
  },
  lineName: { fontWeight: 600, fontSize: '13px', color: COLOR.textDk },
  lineSub:  { fontSize: '11px', color: COLOR.textLt, marginTop: '2px' },
  qtyInput: {
    width: '70px', padding: '6px 8px', flexShrink: 0,
    border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm,
    fontSize: '13px', fontWeight: 600,
  },
  uom: { fontSize: '11px', color: COLOR.textLt, flexShrink: 0, minWidth: '28px' },
  btnAdd: {
    color: '#fff', border: 'none', borderRadius: RADIUS.sm,
    width: '34px', height: '34px', fontSize: '16px', fontWeight: 700, flexShrink: 0,
  },
  btnAddAll: {
    background: COLOR.primary, color: '#fff', border: 'none',
    padding: '12px', width: '100%', borderRadius: RADIUS.md,
    fontWeight: 700, fontSize: '14px', cursor: 'pointer', marginTop: '6px',
  },
};

export default SalesOrderPicker;
