import React from 'react';
import { COLOR, RADIUS } from '@/utils/styleTokens';

const Dialog = ({ isOpen, title, message, onClose, closeLabel = 'Tutup' }) => {
  if (!isOpen) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500,
      padding: '16px',
    }}>
      <div style={{
        background: COLOR.surface, borderRadius: RADIUS.lg, padding: '24px 20px',
        maxWidth: '380px', width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
      }}>
        <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '10px', color: COLOR.textDk }}>
          {title}
        </div>
        <div style={{ fontSize: '14px', color: '#444', marginBottom: '20px', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
          {message}
        </div>
        <button onClick={onClose} style={{
          background: COLOR.primary, color: '#fff', border: 'none',
          borderRadius: RADIUS.sm, padding: '10px 24px', fontWeight: 700,
          fontSize: '14px', cursor: 'pointer', width: '100%',
        }}>{closeLabel}</button>
      </div>
    </div>
  );
};

export default Dialog;
