import React, { useState, useEffect } from 'react';
import { COLOR, RADIUS } from '@/utils/styleTokens';

// CHANGES vs original (both backward-compatible, zero behavior change for
// existing PO callers):
// 1. `po.VendorName` -> `po.VendorName || po.CustomerName` for header text.
// 2. handleConfirm now carries through BOTH `VendorName` and `CustomerName`
//    (whichever the source object had, the other stays undefined) so
//    POCartSidebar/POCartPanel group headers can fall back correctly too.
// 3. Empty-state text no longer says "PO" specifically.
//
// User centang baris + qty (dibatasi qtyOutstanding), 1x konfirmasi
// menambahkan SEMUA baris tercentang sekaligus ke cart Invoice.
//
// ── FIX UOM/QTY (baris ini yang berubah dari versi sebelumnya) ─────────────
// BUG SEBELUMNYA: `line.qtyOutstanding` datang dari server dalam BASE UOM
// (mis. 12 pcs), tapi `line.UomName` yang ditampilkan di sebelahnya adalah
// UOM KONVERSI (mis. "Kotak", isi 12 pcs/Kotak). Akibatnya:
//   - List menampilkan "Sisa 12 Kotak" — padahal seharusnya "Sisa 1 Kotak".
//   - Saat confirm, `QtyEntered` dikirim = 12 (base qty) padahal seharusnya
//     = 1 (qty dalam UOM Kotak yang ditampilkan), sementara `QtyOrdered`
//     (→ QtyInvoiced di invoice line) memang benar harus = 12 (base qty).
//
// FIX: semua qty yang dipakai untuk TAMPILAN & INPUT USER sekarang dalam
// UOM ENTERED (yang ditampilkan, mis. Kotak) — dikonversi dari
// `qtyOutstanding` (base) memakai `line.multiplyRate` (base-unit per 1 unit
// UOM entered; default 1 kalau line memang sudah dalam base UOM / field
// tidak ada). `selected` state SEKARANG menyimpan qty dalam UOM ENTERED,
// bukan base — supaya input & label yang user lihat konsisten satu sama
// lain. Base qty (untuk QtyInvoiced) baru dihitung balik saat handleConfirm.
//
// ⚠️ ASUMSI: field `line.multiplyRate` (base-unit per 1 unit UOM entered)
// disuplai oleh usePOInvoiceLines. Kalau nama field di hook Anda berbeda
// (mis. `UnitsPerBaseUom`, `ConversionRate`), ganti SATU tempat ini saja:
// lihat `getMultiplyRate()` di bawah.
const getMultiplyRate = (line) => {
  const rate = parseFloat(line.multiplyRate ?? line.UnitsPerBaseUom ?? 1);
  return rate > 0 ? rate : 1;
};

// qtyOutstanding (base) → qty dalam UOM entered (yang ditampilkan user)
const toEnteredQty = (line) => {
  const rate = getMultiplyRate(line);
  return line.qtyOutstanding / rate;
};

const POLineDetailSheet = ({ isOpen, po, onClose, onConfirm }) => {
  const [selected, setSelected] = useState({}); // { [C_OrderLine_ID]: qty DALAM UOM ENTERED (mis. Kotak) }

  useEffect(() => {
    if (isOpen && po) {
      const initial = {};
      po.lines.forEach(l => {
        if (l.qtyOutstanding > 0) initial[l.C_OrderLine_ID] = toEnteredQty(l);
      });
      setSelected(initial);
    }
  }, [isOpen, po]);

  if (!isOpen || !po) return null;

  const partnerName = po.VendorName || po.CustomerName;

  const toggleLine = (line) => {
    setSelected(prev => {
      const next = { ...prev };
      if (next[line.C_OrderLine_ID] != null) delete next[line.C_OrderLine_ID];
      else next[line.C_OrderLine_ID] = toEnteredQty(line);
      return next;
    });
  };

  const changeQty = (line, value) => {
    const maxEntered = toEnteredQty(line);
    const qty = Math.min(Math.max(parseFloat(value) || 0, 0), maxEntered);
    setSelected(prev => ({ ...prev, [line.C_OrderLine_ID]: qty }));
  };

  const handleConfirm = () => {
    const chosen = po.lines
      .filter(l => selected[l.C_OrderLine_ID] > 0)
      .map(l => {
        const rate         = getMultiplyRate(l);
        const qtyEntered   = selected[l.C_OrderLine_ID];       // dalam UOM entered (mis. Kotak) — mis. 1
        // qtyOrdered (base, → QtyInvoiced) diturunkan dari qtyEntered × rate,
        // BUKAN dibaca ulang dari qtyOutstanding — supaya kalau user
        // mengetik qty parsial (mis. 0.5 Kotak), base qty ikut proporsional,
        // dan tetap tidak pernah melebihi sisa outstanding karena `rate`
        // yang dipakai sama persis dengan yang membatasi `changeQty`.
        const qtyOrderedBase = qtyEntered * rate;

        return {
          C_OrderLine_ID: l.C_OrderLine_ID,
          C_Order_ID: po.C_Order_ID,
          M_Product_ID: l.M_Product_ID,
          Name: l.ProductName,
          C_UOM_ID: l.C_UOM_ID,
          UomName: l.UomName,
          Qty: qtyEntered,
          QtyEntered: qtyEntered,      // → payload QtyEntered (dalam UOM Kotak, mis. 1)
          QtyOrdered: qtyOrderedBase,  // → payload QtyInvoiced (base qty, mis. 12)
          Price: l.PriceEntered,
          C_BPartner_ID: po.C_BPartner_ID,
          VendorName: po.VendorName,
          CustomerName: po.CustomerName,
          C_BPartner_Location_ID: po.C_BPartner_Location_ID,
          OrderDocumentNo: po.DocumentNo,
        };
      });
    if (chosen.length === 0) return;
    onConfirm(chosen);
    onClose();
  };

  return (
    <div 
      style={{ 
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, 
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px' 
        }} 
        onClick={onClose}
      >
      <div 
        onClick={e => e.stopPropagation()} 
        style={{ background: COLOR.surface, width: '100%', maxWidth: '480px', 
        borderRadius: RADIUS.lg, 
        maxHeight: '85vh', 
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.25)', 
        }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${COLOR.border}` }}>
          <div style={{ fontWeight: 700, fontSize: '14px' }}>{po.DocumentNo} — {partnerName}</div>
          <div style={{ fontSize: '11px', color: COLOR.textLt }}>Pilih baris & qty yang mau ditagih</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
          {po.lines.filter(l => l.qtyOutstanding > 0).map(line => {
            const maxEntered = toEnteredQty(line); // ← sisa dalam UOM entered (mis. 1 Kotak), bukan base
            return (
              <div key={line.C_OrderLine_ID} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: `1px solid ${COLOR.border}` }}>
                <input type="checkbox" checked={selected[line.C_OrderLine_ID] != null} onChange={() => toggleLine(line)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{line.ProductName}</div>
                  <div style={{ fontSize: '11px', color: COLOR.textLt }}>
                    Sisa {maxEntered} {line.UomName} · @ {line.PriceEntered.toLocaleString('id-ID')}
                  </div>
                </div>
                <input
                  type="number" min={0} max={maxEntered}
                  value={selected[line.C_OrderLine_ID] ?? ''}
                  onChange={e => changeQty(line, e.target.value)}
                  disabled={selected[line.C_OrderLine_ID] == null}
                  style={{ width: '64px', padding: '6px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm }}
                />
              </div>
            );
          })}
          {po.lines.every(l => l.qtyOutstanding <= 0) && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: COLOR.textLt }}>Semua baris dokumen ini sudah ditagih penuh.</div>
          )}
        </div>

        <div style={{ padding: '12px 16px', borderTop: `1px solid ${COLOR.border}`, display: 'flex', gap: '8px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md, background: 'none' }}>Batal</button>
          <button onClick={handleConfirm} style={{ flex: 2, padding: '10px', border: 'none', borderRadius: RADIUS.md, background: COLOR.primary, color: '#fff', fontWeight: 700 }}>
            Tambah ke Tagihan
          </button>
        </div>
      </div>
    </div>
  );
};

export default POLineDetailSheet;