import React from 'react';
import { COLOR } from '@/utils/styleTokens';

const CartFab = ({ count, label = 'Keranjang', onClick, icon = '📝' }) => (
  <button
    onClick={onClick}
    style={{
      position: 'fixed', bottom: '20px', right: '20px',
      background: COLOR.primary, color: '#fff', border: 'none',
      borderRadius: '50px', padding: '14px 20px',
      fontWeight: 700, fontSize: '14px', cursor: 'pointer',
      boxShadow: '0 4px 20px rgba(37,99,235,0.45)',
      display: 'flex', alignItems: 'center', gap: '8px',
      zIndex: 200, WebkitTapHighlightColor: 'transparent',
    }}
  >
    {icon}
    <span style={{
      background: '#ef4444', color: '#fff', borderRadius: '50%',
      width: '22px', height: '22px', fontSize: '12px', fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {count}
    </span>
    {label}
  </button>
);

export default CartFab;
