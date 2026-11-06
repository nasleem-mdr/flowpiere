import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAccess } from '@/context/AccessContext';

// ─────────────────────────────────────────────────────────────────────────────
// ProtectedRoute.jsx
// Bungkus elemen route dengan pengecekan AD_Window_Access. Kalau role aktif
// tidak punya akses ke window terkait, redirect ke /dashboard (atau halaman
// "403" kalau Anda buat). Selama accessMap masih loading, tampilkan loading
// state singkat alih-alih langsung redirect (mencegah flash redirect saat
// refresh halaman).
//
// ─────────────────────────────────────────────────────────────────────────────
const ProtectedRoute = ({ windowKey, children, fallbackPath = '/dashboard-stats' }) => {
  const { canView, loading } = useAccess();

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
        Memeriksa hak akses...
      </div>
    );
  }

  if (!canView(windowKey)) {
    return <Navigate to={fallbackPath} replace />;
  }

  return children;
};

export default ProtectedRoute;
