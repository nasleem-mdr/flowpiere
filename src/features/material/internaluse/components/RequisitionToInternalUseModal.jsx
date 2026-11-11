import { useEffect, useState } from 'react';
import { useRequisitionsForInternalUse } from '../hooks/useRequisitionsForInternalUse';
import { COLOR, RADIUS } from '@/utils/styleTokens';

const RequisitionToInternalUseModal = ({ isOpen, onClose, onImport, defaultWarehouseId, resolveProductStock }) => { // ← Tangkap di sini
  const {
    requisitions, loadingList, fetchApprovedRequisitions,
    loadingLines, fetchRequisitionLines,
    getDefaultStartDate, getDefaultEndDate,
  } = useRequisitionsForInternalUse();

  const [search, setSearch]       = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');

  const [activeRequisition, setActiveRequisition] = useState(null);
  const [editableLines, setEditableLines]   = useState([]);

  useEffect(() => {
    if (isOpen) {
      setActiveRequisition(null);
      setEditableLines([]);
      const initialStart = getDefaultStartDate();
      const initialEnd = getDefaultEndDate();
      
      setStartDate(initialStart);
      setEndDate(initialEnd);
      setSearch('');
      
      fetchApprovedRequisitions({
        startDate: initialStart,
        endDate: initialEnd,
      });
    }
  }, [isOpen, fetchApprovedRequisitions, getDefaultStartDate, getDefaultEndDate]);

  if (!isOpen) return null;

  const handleApplyFilter = () => {
    fetchApprovedRequisitions({
      search,
      startDate,
      endDate,
    });
  };

// Saat memanggil fetchRequisitionLines di modal:
    const handleSelectRequisition = async (req) => {
        const reqId = req.M_Requisition_ID || req.id;
        if (!reqId) return;
        setActiveRequisition({ ...req, M_Requisition_ID: reqId });
        
        // Kirim resolveProductStock ke hook
        const lines = await fetchRequisitionLines(reqId, defaultWarehouseId, resolveProductStock);
        setEditableLines(lines);
    };
  
  const handleImport = () => {
    const cartItems = editableLines.map(l => ({
      M_Product_ID:   l.M_Product_ID,
      Name:           l.ProductName,
      UomName:        l.UomName,
      Qty:            l.QtyEntered,
      QtyOnHand:      l.QtyOnHand,       // ← Disertakan
      M_Warehouse_ID: defaultWarehouseId,
      M_Locator_ID:   l.M_Locator_ID,     // ← Disertakan
      LocatorName:    l.LocatorName,      // ← Disertakan
      C_Charge_ID:    l.C_Charge_ID,
      ChargeName:     l.ChargeName,
      uomOptions:     l.uomOptions,       // ← Disertakan
      selectedUom:    l.selectedUom,      // ← Disertakan
      sourceRequisitionLineId: l.M_RequisitionLine_ID || l.id,
      sourceRequisitionId:     activeRequisition.M_Requisition_ID,
    }));

    onImport(cartItems, activeRequisition);
    onClose();
  };
  
  const extractValue = (val, fallback = '-') => {
    if (!val) return fallback;
    if (typeof val === 'object') {
      return val.identifier || val.propertyLabel || val.id || fallback;
    }
    return val;
  };

  const statusLabel = (s) => {
    const rawStatus = extractValue(s);
    return { CO: 'Completed' }[rawStatus] || rawStatus;
  };

  return (
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
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 18px', borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: '15px', color: COLOR.textDk }}>
            {activeRequisition ? `📋 ${extractValue(activeRequisition.DocumentNo)}` : '📥 Import Requisition (FPB) ke Internal Use'}
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

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', minHeight: 0 }}>
          {!activeRequisition ? (
            <>
              {/* Filter Section */}
              <div style={{
                background: '#f8fafc', padding: '12px', borderRadius: RADIUS.md,
                border: `1px solid ${COLOR.border}`, marginBottom: '12px',
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
              }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: COLOR.textLt, display: 'block', marginBottom: '4px' }}>Tanggal Awal</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm, fontSize: '12px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: COLOR.textLt, display: 'block', marginBottom: '4px' }}>Tanggal Akhir</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm, fontSize: '12px' }}
                  />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Cari No. Dokumen FPB..."
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                      border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm,
                      fontSize: '12px', outline: 'none',
                    }}
                  />
                </div>
                <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={handleApplyFilter}
                    style={{
                      background: COLOR.primary, color: '#fff', border: 'none',
                      padding: '6px 14px', borderRadius: RADIUS.sm, fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    🔍 Terapkan Filter
                  </button>
                </div>
              </div>

              {/* List Requisition */}
              {loadingList ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>⏳ Memuat daftar FPB...</div>
              ) : requisitions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>
                  Tidak ada Requisition Completed pada rentang tanggal tersebut.
                </div>
              ) : (
                requisitions.map((req, index) => {
                  const reqId = req.M_Requisition_ID || req.id || index;
                  return (
                    <button
                      key={reqId}
                      onClick={() => handleSelectRequisition(req)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        width: '100%', textAlign: 'left', background: '#f7f9ff',
                        border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md,
                        padding: '12px 14px', marginBottom: '8px', cursor: 'pointer',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: COLOR.textDk }}>{extractValue(req.DocumentNo)}</div>
                        <div style={{ fontSize: '11px', color: COLOR.textLt }}>
                          {req.DateDoc ? new Date(req.DateDoc).toLocaleDateString('id-ID') : '-'}
                        </div>
                      </div>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, color: COLOR.success,
                        background: COLOR.successLt, borderRadius: '20px', padding: '3px 10px', flexShrink: 0,
                      }}>
                        {statusLabel(req.DocStatus)}
                      </span>
                    </button>
                  );
                })
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
                <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>⏳ Memuat lines Requisition...</div>
              ) : editableLines.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: COLOR.textLt }}>FPB ini tidak memiliki line.</div>
              ) : (
                editableLines.map((l, idx) => {
                  const lineKey = l.M_RequisitionLine_ID || l.id || idx;
                  return (
                    <div key={lineKey} style={{
                      border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.md,
                      padding: '10px 12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: COLOR.textDk }}>{extractValue(l.ProductName)}</div>
                        <div style={{ fontSize: '11px', color: COLOR.textLt }}>Qty Requisition: {l.Qty} {extractValue(l.UomName)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: COLOR.textLt }}>Qty Ambil:</span>
                        <input
                          type="number" min="1"
                          value={l.QtyEntered}
                          onChange={e => updateLine(idx, { QtyEntered: parseFloat(e.target.value) || 0 })}
                          style={{
                            width: '80px', padding: '6px 8px', border: `1px solid ${COLOR.border}`,
                            borderRadius: RADIUS.sm, fontSize: '12px', fontWeight: 600, textAlign: 'right'
                          }}
                        />
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>{extractValue(l.UomName)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>

        {/* Footer Import Action */}
        {activeRequisition && editableLines.length > 0 && (
          <div style={{ borderTop: `1px solid ${COLOR.border}`, padding: '14px 18px', flexShrink: 0 }}>
            <button
              onClick={handleImport}
              style={{
                background: COLOR.primary, color: '#fff', border: 'none', padding: '13px', width: '100%',
                borderRadius: RADIUS.md, fontWeight: 700, fontSize: '14px', cursor: 'pointer',
              }}
            >
              📥 Import {editableLines.length} Item ke Internal Use
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RequisitionToInternalUseModal;