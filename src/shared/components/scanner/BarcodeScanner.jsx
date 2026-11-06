import React, { useState, useEffect, useRef, useCallback } from 'react';
import { COLOR, RADIUS } from '@/utils/styleTokens';

const BarcodeScanner = ({ isOpen, onDetected, onClose }) => {
  const videoRef    = useRef(null);
  const streamRef   = useRef(null);
  const rafRef      = useRef(null);
  const detectorRef = useRef(null);
  const [status, setStatus]       = useState('init');
  const [errorMsg, setErrorMsg]   = useState('');
  const [lastCode, setLastCode]   = useState('');
  const [supported, setSupported] = useState(true);

  const stopStream = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) { stopStream(); setStatus('init'); setLastCode(''); return; }

    if (!('BarcodeDetector' in window)) {
      setSupported(false);
      setStatus('error');
      setErrorMsg('Browser ini tidak mendukung BarcodeDetector API.\nGunakan Chrome 83+ atau Edge 83+ di Android.');
      return;
    }

    setSupported(true);
    setStatus('init');

    detectorRef.current = new window.BarcodeDetector({
      formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'data_matrix'],
    });

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStatus('scanning');
          scanLoop();
        }
      } catch (err) {
        setStatus('error');
        setErrorMsg(`Kamera tidak bisa diakses:\n${err.message}\n\nPastikan izin kamera sudah diberikan.`);
      }
    };

    const scanLoop = () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        rafRef.current = requestAnimationFrame(scanLoop);
        return;
      }
      detectorRef.current.detect(videoRef.current)
        .then(results => {
          if (results.length > 0) {
            const code = results[0].rawValue;
            if (code && code !== lastCode) {
              setLastCode(code);
              if (navigator.vibrate) navigator.vibrate([60]);
              onDetected(code);
            }
          }
          rafRef.current = requestAnimationFrame(scanLoop);
        })
        .catch(() => { rafRef.current = requestAnimationFrame(scanLoop); });
    };

    startCamera();
    return () => stopStream();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.92)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2001,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', background: 'rgba(0,0,0,0.5)',
      }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>📷 Scan QR / Barcode</span>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            borderRadius: '50%', width: '34px', height: '34px', fontSize: '18px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >✕</button>
      </div>

      {status !== 'error' && (
        <div style={{ position: 'relative', width: '100%', maxWidth: '500px' }}>
          <video ref={videoRef} playsInline muted style={{ width: '100%', display: 'block', borderRadius: RADIUS.md }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{
              width: '200px', height: '200px', border: '2px solid rgba(255,255,255,0.5)',
              borderRadius: RADIUS.md, boxShadow: '0 0 0 2000px rgba(0,0,0,0.45)', position: 'relative',
            }}>
              {[
                { top: '-2px', left: '-2px', borderTop: '4px solid #22c55e', borderLeft: '4px solid #22c55e' },
                { top: '-2px', right: '-2px', borderTop: '4px solid #22c55e', borderRight: '4px solid #22c55e' },
                { bottom: '-2px', left: '-2px', borderBottom: '4px solid #22c55e', borderLeft: '4px solid #22c55e' },
                { bottom: '-2px', right: '-2px', borderBottom: '4px solid #22c55e', borderRight: '4px solid #22c55e' },
              ].map((s, i) => (
                <div key={i} style={{ position: 'absolute', width: '20px', height: '20px', borderRadius: '2px', ...s }} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{
        marginTop: '20px', padding: '12px 24px',
        background: status === 'error' ? 'rgba(220,38,38,0.85)' : 'rgba(255,255,255,0.1)',
        borderRadius: RADIUS.lg, maxWidth: '400px', textAlign: 'center',
      }}>
        {status === 'init'     && <p style={{ color: '#ddd', margin: 0, fontSize: '14px' }}>Menginisialisasi kamera...</p>}
        {status === 'scanning' && <p style={{ color: '#a3e635', margin: 0, fontSize: '13px' }}>🔍 Arahkan kamera ke barcode produk</p>}
        {status === 'error' && (
          <>
            <p style={{ color: '#fff', margin: '0 0 8px', fontWeight: 700, fontSize: '14px' }}>⚠ Error</p>
            <p style={{ color: '#fca5a5', margin: 0, fontSize: '13px', whiteSpace: 'pre-line' }}>{errorMsg}</p>
            {!supported && (
              <p style={{ color: '#fde68a', margin: '10px 0 0', fontSize: '12px' }}>
                Anda bisa ketik kode produk manual di kolom pencarian.
              </p>
            )}
            <button
              onClick={onClose}
              style={{
                marginTop: '16px', background: COLOR.surface, color: COLOR.danger,
                border: 'none', borderRadius: RADIUS.sm, padding: '8px 20px', fontWeight: 700, cursor: 'pointer',
              }}
            >Tutup</button>
          </>
        )}
      </div>

      {lastCode && (
        <div style={{ marginTop: '10px', padding: '8px 20px', background: 'rgba(34,197,94,0.2)', borderRadius: RADIUS.md, border: '1px solid #22c55e' }}>
          <p style={{ color: '#86efac', margin: 0, fontSize: '12px', textAlign: 'center' }}>
            ✓ Terdeteksi: <strong style={{ color: '#fff' }}>{lastCode}</strong>
          </p>
        </div>
      )}
    </div>
  );
};

export default BarcodeScanner;
