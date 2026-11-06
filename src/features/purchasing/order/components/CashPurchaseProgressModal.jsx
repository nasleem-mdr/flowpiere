import React, { useEffect, useRef, useState } from 'react';
import { COLOR, RADIUS } from '@/utils/styleTokens';

const STEP_LABELS = {
    po:         'Purchase Order',
    receipt:    'Material Receipt',
    invoice:    'Vendor Invoice',
    payment:    'Payment',
    allocation: 'Allocation',
};
const STEP_KEYS = Object.keys(STEP_LABELS);

const KEYFRAMES = `
@keyframes cpm-spin  { to { transform: rotate(360deg); } }
@keyframes cpm-pop   { 0% { transform: scale(0.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes cpm-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(37,99,235,.28); } 50% { box-shadow: 0 0 0 6px rgba(37,99,235,0); } }
`;

const DOT = {
    width: 24, height: 24, borderRadius: '50%', boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#fff',
};

const StepDot = ({ status, skipped }) => {
    if (skipped)
        return <div style={{ ...DOT, border: '2px solid #d1d5db', background: '#f3f4f6' }} />;
    if (status === 'success')
        return <div style={{ ...DOT, background: '#22c55e', animation: 'cpm-pop .25s ease-out' }}>✓</div>;
    if (status === 'error')
        return <div style={{ ...DOT, background: '#dc2626', animation: 'cpm-pop .25s ease-out' }}>✕</div>;
    if (status === 'waiting')
        return <div style={{ ...DOT, background: '#ea580c' }}>…</div>;
    if (status === 'pending')
        // sedang berjalan: kuning berputar
        return (
            <div style={{
                ...DOT, border: '3px solid #fde68a', borderTopColor: '#f59e0b',
                background: '#fffbeb', animation: 'cpm-spin .8s linear infinite',
            }} />
        );
    // belum mulai: kuning
    return <div style={{ ...DOT, border: '2px solid #fbbf24', background: '#fef3c7' }} />;
};

const CashPurchaseProgressModal = ({ isOpen, steps = {}, onClose, isDone }) => {
    const [elapsed, setElapsed] = useState(0);
    const startRef = useRef(null);

    // Timer berjalan selama proses belum selesai; saat selesai nilainya dibekukan
    // (tidak di-reset ke 0).
    useEffect(() => {
        if (!isOpen) { startRef.current = null; setElapsed(0); return undefined; }
        if (startRef.current == null) startRef.current = Date.now();
        const tick = () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
        tick();
        if (isDone) return undefined;
        const t = setInterval(tick, 500);
        return () => clearInterval(t);
    }, [isOpen, isDone]);

    if (!isOpen) return null;

    const statusOf = (k) => steps[k]?.status || 'idle';
    const hasError   = STEP_KEYS.some(k => statusOf(k) === 'error');
    const hasWaiting = STEP_KEYS.some(k => statusOf(k) === 'waiting');
    const successCnt = STEP_KEYS.filter(k => statusOf(k) === 'success').length;
    const pendingCnt = STEP_KEYS.filter(k => statusOf(k) === 'pending').length;
    const allSuccess = successCnt === STEP_KEYS.length;
    const percent    = Math.min(100, ((successCnt + pendingCnt * 0.5) / STEP_KEYS.length) * 100);

    const anyStarted = STEP_KEYS.some(k => statusOf(k) !== 'idle');
    const barColor = hasError ? '#dc2626'
        : hasWaiting ? '#ea580c'
        : allSuccess ? '#22c55e'
        : (isDone && !anyStarted) ? '#9ca3af'
        : '#f59e0b';
    const headline = !isDone ? 'Sedang memproses...'
        : hasError   ? 'Proses terhenti'
        : hasWaiting ? 'Menunggu approval'
        : allSuccess ? 'Pembelian tunai selesai'
        : !anyStarted ? 'Tidak ada proses yang berjalan'
        : 'Proses berhenti sebelum selesai';

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <style>{KEYFRAMES}</style>
            <div style={{ background: COLOR.surface, borderRadius: RADIUS.lg, padding: '22px 24px', width: '380px', maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto' }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: '16px', color: COLOR.textDk }}>Proses Pembelian Tunai</h3>
                    <span style={{ fontSize: '11px', color: COLOR.textLt, fontVariantNumeric: 'tabular-nums' }}>{elapsed} dtk</span>
                </div>
                <div style={{ margin: '4px 0 12px', fontSize: '12px', fontWeight: 600, color: barColor }}>{headline}</div>

                {/* Progress bar */}
                <div style={{ height: 6, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden', marginBottom: 16 }}>
                    <div style={{
                        height: '100%', width: `${percent}%`, background: barColor,
                        borderRadius: 999, transition: 'width .4s ease, background .3s ease',
                    }} />
                </div>

                {/* Stepper */}
                <div>
                    {STEP_KEYS.map((key, idx) => {
                        const step     = steps[key] || { status: 'idle' };
                        const status   = step.status;
                        const isLast   = idx === STEP_KEYS.length - 1;
                        const skipped  = hasError && status === 'idle';
                        const isActive = status === 'pending';

                        return (
                            <div key={key} style={{ display: 'flex', gap: 12 }}>
                                {/* Kolom dot + garis penghubung */}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <StepDot status={status} skipped={skipped} />
                                    {!isLast && (
                                        <div style={{
                                            width: 2, flex: 1, minHeight: 22,
                                            background: status === 'success' ? '#22c55e' : '#e5e7eb',
                                            transition: 'background .3s ease',
                                        }} />
                                    )}
                                </div>

                                {/* Teks */}
                                <div style={{
                                    flex: 1, paddingBottom: isLast ? 0 : 12,
                                    opacity: skipped ? 0.45 : 1,
                                }}>
                                    <div style={{
                                        fontSize: '13px', lineHeight: '24px',
                                        fontWeight: isActive ? 700 : 500,
                                        color: COLOR.textDk,
                                    }}>
                                        {label(key)}
                                        {skipped && <span style={{ fontWeight: 400, color: COLOR.textLt }}> · tidak dijalankan</span>}
                                    </div>

                                    {status === 'pending' && step.detail && (
                                        <div style={{ fontSize: '11px', color: '#b45309', marginTop: -2 }}>{step.detail}</div>
                                    )}
                                    {status === 'success' && step.documentNo && (
                                        <div style={{ fontSize: '11px', color: '#16a34a', marginTop: -2 }}>No. {step.documentNo}</div>
                                    )}
                                    {status === 'waiting' && (
                                        <div style={{ fontSize: '11px', color: '#c2410c', marginTop: -2 }}>
                                            Menunggu approval{step.documentNo ? ` · ${step.documentNo}` : ''}
                                        </div>
                                    )}
                                    {status === 'error' && step.message && (
                                        <div style={{
                                            fontSize: '11px', color: '#b91c1c', marginTop: 2,
                                            background: '#fef2f2', borderRadius: 6, padding: '6px 8px',
                                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                        }}>{step.message}</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {isDone && (
                    <button
                        onClick={onClose}
                        style={{
                            marginTop: '18px', width: '100%', padding: '10px',
                            background: COLOR.primary, color: '#fff', border: 'none',
                            borderRadius: RADIUS.md, fontWeight: 700, cursor: 'pointer',
                        }}
                    >Tutup</button>
                )}
            </div>
        </div>
    );
};

const label = (key) => STEP_LABELS[key];

export default CashPurchaseProgressModal;