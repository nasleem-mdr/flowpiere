// components/AttachmentViewerModal.jsx
// Modal viewer attachment dokumen workflow. Gambar & PDF bisa di-zoom.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const STEP = 0.25;
const clamp = (v) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v));

function kindOf(file) {
  const type = (file?.contentType || '').toLowerCase();
  const ext = (file?.name || '').split('.').pop().toLowerCase();
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  return 'other';
}

export default function AttachmentViewerModal({ open, files, fetchFile, onClose }) {
  const [index, setIndex] = useState(0);
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const stageRef = useRef(null);
  const dragRef = useRef(null);

  const file = files[index] || null;
  const kind = kindOf(file);

  const resetView = useCallback(() => { setZoom(1); setOffset({ x: 0, y: 0 }); }, []);
  const zoomIn = useCallback(() => setZoom((z) => clamp(z + STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => clamp(z - STEP)), []);

  // Reset index tiap kali modal dibuka / daftar file berubah
  useEffect(() => { if (open) setIndex(0); }, [open, files]);

  // Muat file aktif -> object URL (dibersihkan saat ganti file / tutup)
  useEffect(() => {
    if (!open || !file) return undefined;
    let cancelled = false;
    let objectUrl = null;
    setLoading(true);
    setError(null);
    setUrl(null);
    resetView();
    fetchFile(file)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Gagal memuat file.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, file, fetchFile, resetView]);

  // Keyboard: Esc tutup, +/- zoom, 0 reset
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-') zoomOut();
      else if (e.key === '0') resetView();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, zoomIn, zoomOut, resetView]);

  // Scroll mouse = zoom (listener native supaya bisa preventDefault)
  useEffect(() => {
    const el = stageRef.current;
    if (!open || !el || kind !== 'image') return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom((z) => clamp(z + (e.deltaY < 0 ? STEP : -STEP)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open, kind, url]);

  // Drag untuk geser gambar
  const onPointerDown = (e) => {
    if (kind !== 'image' || zoom <= 1) return;
    dragRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    setOffset({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
  };
  const onPointerUp = () => { dragRef.current = null; };

  if (!open) return null;

  const pct = Math.round(zoom * 100);
  const canZoom = kind === 'image' || kind === 'pdf';

  return createPortal(
    <div className="wf-att__overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Lampiran dokumen">
      <div className="wf-att" onClick={(e) => e.stopPropagation()}>
        <div className="wf-att__bar">
          <strong className="wf-att__title">Lampiran ({files.length})</strong>

          {canZoom && (
            <div className="wf-att__zoom">
              <button type="button" className="wf-iconbtn" onClick={zoomOut} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">−</button>
              <button type="button" className="wf-att__pct" onClick={resetView} title="Reset zoom">{pct}%</button>
              <button type="button" className="wf-iconbtn" onClick={zoomIn} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
            </div>
          )}

          {url && (
            <a className="wf-btn wf-btn--ghost" href={url} download={file?.name}>⬇ Unduh</a>
          )}
          <button type="button" className="wf-iconbtn" onClick={onClose} aria-label="Tutup">✕</button>
        </div>

        {files.length > 1 && (
          <div className="wf-att__tabs">
            {files.map((f, i) => (
              <button
                key={f.name}
                type="button"
                className={`wf-att__tab ${i === index ? 'wf-att__tab--active' : ''}`}
                onClick={() => setIndex(i)}
                title={f.name}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}

        <div
          ref={stageRef}
          className={`wf-att__stage ${kind === 'image' && zoom > 1 ? 'wf-att__stage--grab' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {loading && <div className="wf-state">Memuat {file?.name}…</div>}
          {error && <div className="wf-state wf-state--error">{error}</div>}

          {url && kind === 'image' && (
            <img
              src={url}
              alt={file.name}
              draggable={false}
              className="wf-att__img"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
            />
          )}

          {url && kind === 'pdf' && (
            // key={zoom} memaksa reload iframe agar parameter #zoom diterapkan
            <iframe
              key={zoom}
              title={file.name}
              className="wf-att__pdf"
              src={`${url}#zoom=${pct}`}
            />
          )}

          {url && kind === 'other' && (
            <div className="wf-state">
              Pratinjau tidak tersedia untuk file ini.<br />
              <a href={url} download={file.name}>Unduh {file.name}</a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}