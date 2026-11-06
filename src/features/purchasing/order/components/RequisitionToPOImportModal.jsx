import { useEffect, useState } from 'react';
import {
  ComposedChart, 
  Bar, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
} from 'recharts';
import { useRequisitionsForPO } from '@/features/requisition/hooks/useRequisitionsForPO';
import VendorPickerModal from './VendorPickerModal';
import { COLOR, RADIUS } from '@/utils/styleTokens';
import { formatCurrency } from '@/utils/currency';


/** ─────────────────────────────────────────────────────────────────────────────
* RequisitionToPOImportModal.jsx
* Alur 2 langkah: (1) daftar FPB Completed, (2) pilih satu → tiap baris
* dilengkapi suggestion vendor & harga, user bisa edit vendor/harga sebelum
* import ke cart PO (qty TIDAK diedit di modal ini).
*
* ── UOM ENTERED vs BASE ────────────────────────────────────────────────────
* Qty = qty entered (UOM dari FPB) → jadi QtyEntered di C_OrderLine.
* BaseQty = qty base dari FPB (M_RequisitionLine.Qty) → jadi QtyOrdered di
*           C_OrderLine LANGSUNG, tanpa dihitung ulang (lihat
*           usePurchaseOrderSubmit.jsx).
* UnitsPerBaseUom = RASIO (BaseQty ÷ Qty entered) — dipakai HANYA untuk
*           preview di cart ("≈ 6 pcs"), supaya preview tetap akurat kalau
*           user mengubah Qty lagi di cart PO SEBELUM submit (POCartItem.jsx).
*           Beda dari BaseQty yang nilainya tetap/snapshot.
* BaseUOMName = nama UOM dasar produk, untuk teks preview itu.
* ─────────────────────────────────────────────────────────────────────────────
*/

const RequisitionToPOImportModal = ({ isOpen, onClose, onImport }) => {
  const {
    requisitions, loadingList, fetchApprovedRequisitions,
    loadingLines, fetchRequisitionLines,
  } = useRequisitionsForPO();

  const [search, setSearch]                 = useState('');
  const [activeRequisition, setActiveRequisition] = useState(null);
  const [editableLines, setEditableLines]   = useState([]);
  const [manualVendorLineIdx, setManualVendorLineIdx] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setActiveRequisition(null);
      setEditableLines([]);
      fetchApprovedRequisitions({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSearch = (val) => {
    setSearch(val);
    fetchApprovedRequisitions({ search: val });
  };

  const handleSelectRequisition = async (req) => {
    setActiveRequisition(req);
    const lines = await fetchRequisitionLines(req.M_Requisition_ID);
    setEditableLines(lines);
  };

  const enteredQty = (l) => (l.QtyEntered ?? l.Qty);

  const updateLine = (idx, patch) => {
    setEditableLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };

  const handleVendorSelectChange = (idx, e) => {
    const val = e.target.value;
    if (val === '__manual__') {
      setManualVendorLineIdx(idx);
      return;
    }
    const line = editableLines[idx];
    const chosen = line.vendorOptions.find(v => String(v.C_BPartner_ID) === val);
    if (chosen) {
      updateLine(idx, { C_BPartner_ID: chosen.C_BPartner_ID, VendorName: chosen.VendorName, Price: chosen.Price });
    }
  };

  const handleManualVendorPicked = (vendor) => {
    updateLine(manualVendorLineIdx, {
      C_BPartner_ID: vendor.C_BPartner_ID,
      VendorName:    vendor.Name,
      C_BPartner_Location_ID: vendor.locationId,
    });
    setManualVendorLineIdx(null);
  };

  const handleImport = () => {
    const cartItems = editableLines.map(l => {
      const qEntered = enteredQty(l);
      return {
        M_Product_ID: l.M_Product_ID,
        Name:         l.ProductName,
        C_UOM_ID:     l.C_UOM_ID,       // UOM entered dari FPB — dibawa apa adanya ke PO
        UomName:      l.UomName,
        BaseUOM_ID:   l.BaseUOM_ID,
        BaseUOMName:  l.BaseUOMName,    // ← BARU: untuk teks preview di cart
        Qty:          qEntered,         // qty entered → jadi QtyEntered di C_OrderLine
        BaseQty:      l.Qty,            // qty base FPB → jadi QtyOrdered di C_OrderLine, apa adanya
        UnitsPerBaseUom: qEntered > 0 ? (l.Qty / qEntered) : 1, // ← BARU: rasio untuk preview live
        Price:        l.Price,
        C_BPartner_ID: l.C_BPartner_ID,
        VendorName:    l.VendorName,
        C_BPartner_Location_ID: l.C_BPartner_Location_ID ?? null,
        sourceRequisitionLineId: l.M_RequisitionLine_ID,
        sourceRequisitionId:     activeRequisition.M_Requisition_ID,
      };
    });
    onImport(cartItems, activeRequisition);
    onClose();
  };

  const chartData = editableLines.map(l => ({
    name: l.ProductName.length > 14 ? l.ProductName.slice(0, 14) + '…' : l.ProductName,
    fullName: l.ProductName,
    price: l.Price,
    lineAmount: enteredQty(l) * (l.Price || 0),
  }));

  const distinctVendors = new Set(editableLines.filter(l => l.C_BPartner_ID).map(l => l.C_BPartner_ID));
  const missingVendorCount = editableLines.filter(l => !l.C_BPartner_ID).length;
  const grandTotal = editableLines.reduce((s, l) => s + enteredQty(l) * (l.Price || 0), 0);
  const statusLabel = (s) => ({ CO: 'Completed' }[s] || s);

  return (
    <>
      <VendorPickerModal
        isOpen={manualVendorLineIdx !== null}
        onClose={() => setManualVendorLineIdx(null)}
        onSelect={handleManualVendorPicked}
      />

      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1600, padding: '16px',
      }}>
        <div style={{
          background: COLOR.surface, borderRadius: RADIUS.xl,
          width: '100%', maxWidth: '720px', maxHeight: '88vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 18px', borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0,
          }}>
            <span style={{ fontWeight: 700, fontSize: '15px', color: COLOR.textDk }}>
              {activeRequisition ? `📋 ${activeRequisition.DocumentNo}` : '📥 Import dari FPB (Requisition)'}
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
            {!activeRequisition ? (
              <>
                <input
                  type="text"
                  value={search}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Cari No. Dokumen FPB..."
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '9px 12px',
                    border: `1.5px solid ${COLOR.border}`, borderRadius: RADIUS.md,
                    fontSize: '14px', marginBottom: '12px', outline: 'none',
                  }}
                />
                {loadingList ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>⏳ Memuat daftar FPB...</div>
                ) : requisitions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>
                    Tidak ada FPB Completed dengan sisa qty yang belum di-PO-kan.
                  </div>
                ) : (
                  requisitions.map(req => (
                    <button
                      key={req.M_Requisition_ID}
                      onClick={() => handleSelectRequisition(req)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        width: '100%', textAlign: 'left', background: '#f7f9ff',
                        border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md,
                        padding: '12px 14px', marginBottom: '8px', cursor: 'pointer',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: COLOR.textDk }}>{req.DocumentNo}</div>
                        <div style={{ fontSize: '11px', color: COLOR.textLt }}>
                          {req.DateDoc ? new Date(req.DateDoc).toLocaleDateString('id-ID') : '-'} · {req.WarehouseName || '-'} · {req.TotalLines} line
                        </div>
                        {typeof req.OpenLineCount === 'number' && (
                          <div style={{ fontSize: '11px', color: COLOR.primary, fontWeight: 600, marginTop: '2px' }}>
                            {req.OpenLineCount} dari {req.TotalLines} line belum di-PO-kan
                          </div>
                        )}
                      </div>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, color: COLOR.success,
                        background: COLOR.successLt, borderRadius: '20px', padding: '3px 10px', flexShrink: 0,
                      }}>
                        {statusLabel(req.DocStatus)}
                      </span>
                    </button>
                  ))
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => { setActiveRequisition(null); setEditableLines([]); }}
                  style={{
                    background: 'none', border: 'none', color: COLOR.primary,
                    fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '12px', fontWeight: 600,
                  }}
                >← Pilih FPB lain</button>

                {loadingLines ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>⏳ Memuat lines & vendor...</div>
                ) : editableLines.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>FPB ini tidak memiliki line.</div>
                ) : (
                  <>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: COLOR.textMd, marginBottom: '8px' }}>
                      Harga Satuan &amp; Line Amount per Produk
                    </div>
                    <div style={{ width: '100%', height: 220, marginBottom: '18px' }}>
                      <ResponsiveContainer>
                        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                          <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                          <Tooltip
                            formatter={(value, name) => [formatCurrency(value), name === 'lineAmount' ? 'Line Amount' : 'Harga Satuan']}
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                          />
                          <Legend
                            formatter={(value) => value === 'lineAmount' ? 'Line Amount' : 'Harga Satuan'}
                            wrapperStyle={{ fontSize: '11px' }}
                          />
                          <Bar yAxisId="left" dataKey="lineAmount" fill={COLOR.primary} radius={[4, 4, 0, 0]} />
                          <Line yAxisId="right" dataKey="price" stroke={COLOR.vendor} strokeWidth={2} dot={{ r: 3 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>

                    <div style={{ fontSize: '12px', fontWeight: 600, color: COLOR.textMd, marginBottom: '8px' }}>
                      Detail Baris — Vendor &amp; Harga (bisa diedit)
                    </div>

                    {editableLines.map((l, idx) => (
                      <div key={l.M_RequisitionLine_ID ?? idx} style={{
                        border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md,
                        padding: '10px 12px', marginBottom: '8px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: COLOR.textDk }}>{l.ProductName}</span>
                          <span style={{ fontSize: '12px', color: COLOR.textLt }}>{enteredQty(l)} {l.UomName}</span>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {l.vendorOptions.length > 0 ? (
                            <select
                              value={l.C_BPartner_ID ?? ''}
                              onChange={e => handleVendorSelectChange(idx, e)}
                              style={{
                                flex: 1, minWidth: '140px', padding: '6px 8px',
                                border: `1.5px solid ${l.C_BPartner_ID ? COLOR.border : COLOR.danger}`,
                                borderRadius: RADIUS.sm, fontSize: '12px', color: COLOR.textDk,
                              }}
                            >
                              {!l.C_BPartner_ID && <option value="">— Pilih vendor —</option>}
                              {l.vendorOptions.map(v => {
                                const tag = v.C_BPartner_ID === l.LineBPartnerId
                                  ? ' (dari FPB)'
                                  : v.isCurrent ? ' (utama)' : '';
                                return (
                                  <option key={v.C_BPartner_ID} value={v.C_BPartner_ID}>
                                    {v.VendorName}{tag} — {formatCurrency(v.Price)}
                                  </option>
                                );
                              })}
                              <option value="__manual__">+ Vendor lain...</option>
                            </select>
                          ) : (
                            <button
                              onClick={() => setManualVendorLineIdx(idx)}
                              style={{
                                flex: 1, minWidth: '140px', padding: '6px 8px',
                                background: l.C_BPartner_ID ? COLOR.vendorBg : COLOR.dangerLt,
                                color: l.C_BPartner_ID ? COLOR.vendor : COLOR.danger,
                                border: 'none', borderRadius: RADIUS.sm, fontSize: '12px',
                                fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                              }}
                            >
                              🚚 {l.C_BPartner_ID ? l.VendorName : 'Belum ada data vendor — pilih manual'}
                            </button>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <span style={{ fontSize: '11px', color: COLOR.textLt }}>Rp</span>
                            <input
                              type="number" min="0"
                              value={l.Price}
                              onChange={e => updateLine(idx, { Price: parseFloat(e.target.value) || 0 })}
                              style={{
                                width: '100px', padding: '6px 8px', border: `1px solid ${COLOR.border}`,
                                borderRadius: RADIUS.sm, fontSize: '12px', fontWeight: 600,
                              }}
                            />
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', marginTop: '6px', fontSize: '12px', fontWeight: 700, color: COLOR.textDk }}>
                          = {formatCurrency(enteredQty(l) * (l.Price || 0))}
                        </div>
                      </div>
                    ))}

                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 12px', background: '#f0f4ff', borderRadius: RADIUS.md, marginTop: '10px',
                    }}>
                      <span style={{ fontSize: '12px', color: COLOR.textMd }}>
                        {distinctVendors.size > 0 && (
                          <>Akan membuat <strong style={{ color: COLOR.textDk }}>{distinctVendors.size}</strong> Purchase Order terpisah</>
                        )}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: COLOR.textDk }}>{formatCurrency(grandTotal)}</span>
                    </div>

                    {missingVendorCount > 0 && (
                      <div style={{
                        fontSize: '11px', color: COLOR.danger, background: COLOR.dangerLt,
                        borderRadius: RADIUS.sm, padding: '8px 10px', marginTop: '8px',
                      }}>
                        ⚠ {missingVendorCount} produk belum ada vendor. Lengkapi dulu sebelum import.
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {activeRequisition && editableLines.length > 0 && (
            <div style={{ borderTop: `1px solid ${COLOR.border}`, padding: '14px 18px', flexShrink: 0 }}>
              <button
                onClick={handleImport}
                disabled={missingVendorCount > 0}
                style={{
                  background: missingVendorCount > 0 ? '#9ca3af' : COLOR.primary,
                  color: '#fff', border: 'none', padding: '13px', width: '100%',
                  borderRadius: RADIUS.md, fontWeight: 700, fontSize: '14px',
                  cursor: missingVendorCount > 0 ? 'not-allowed' : 'pointer',
                }}
              >
                📥 Import {editableLines.length} Item ke Daftar Purchase Order
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default RequisitionToPOImportModal;
