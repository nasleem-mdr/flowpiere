import React, { useState, useRef, useEffect } from 'react';
import { 
  UserIcon, 
  RoleIcon, 
  LogoIconW, 
  LogoutIcon, 
} from '@/shared/components';

import { useUserAvatar } from '@/shared/hooks/useUserAvatar';
import ChangeRoleModal from './ChangeRoleModal';
import { useNavigate, Link } from "react-router-dom";
import NotificationBell from './NotificationBell';
import '@/css/Header.css';
 
export default function Header({ session, onLogout, onSessionUpdate }) {
  const { username, clientName, clientId, roleName, roleId } = session;
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChangeRole, setShowChangeRole] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const avatarUrl = useUserAvatar();
 
  // Deteksi apakah device mendukung hover asli (desktop/mouse) atau tidak
  // (mobile/touch). (hover: hover) + (pointer: fine) hanya true untuk mouse.
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    setIsTouchDevice(!mq.matches);
    const handler = (e) => setIsTouchDevice(!e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
 
  // Tutup dropdown saat klik di luar area menu — hanya relevan untuk mode click (mobile).
  useEffect(() => {
    if (!menuOpen || !isTouchDevice) return;
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [menuOpen, isTouchDevice]);
 
  // Handler untuk trigger Role: click di mobile/touch, hover di desktop.
  const triggerProps = isTouchDevice
    ? { onClick: () => setMenuOpen((p) => !p) }
    : {
        onMouseEnter: () => setMenuOpen(true),
        onMouseLeave: () => setMenuOpen(false),
      };
 
  return (
    <header className="header">
      {/* Brand & Navigation — Mepet Ke Kiri */}
      <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div className="header-info-item">
          <button 
            onClick={() => navigate('/dashboard')} 
            style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
          >
            <LogoIconW size={20}/>
          </button>
          <span className="header-info-value header-hide-mobile">Procure<em>Grid</em></span>
        </div>
      </div>
 
      {/* Session Info — Sisi Kanan */}
      <div className="header-session">
       {/*<div className="header-divider" />*/}

        {/* 2. Notifikasi Approval Pending */}
        <NotificationBell roleId={roleId} workflowPath="/workflow-approval" purchasingPath="/purchasing" />
        
        <div className="header-divider header-hide-mobile" />
        {/* 1. Role + Dropdown Ganti Role */}
        <div
          className="header-role-wrap"
          ref={menuRef}
          {...(!isTouchDevice ? triggerProps : {})}
        >
       <div
         className="header-info-item"
         style={{ cursor: 'pointer' }}
         {...(isTouchDevice ? triggerProps : {})}
       >
         <div className="header-avatar" title={username}>
           {avatarUrl ? (
             <img src={avatarUrl} alt={username} />
           ) : (
             <UserIcon />
           )}
         </div>
         <span className="header-info-value header-hide-mobile">{username}</span>
       </div>

          {menuOpen && (
            <div className="header-dropdown">
              {/* 3. User Info (Geser ke paling kanan) */}
            <div className="header-info-item">
              <RoleIcon />
              <span className="header-info-value">{roleName}</span>
            </div>
              <button onClick={() => { setShowChangeRole(true); setMenuOpen(false); }}>
                <RoleIcon />Change Role
              </button>
              <button onClick={onLogout}>
                <LogoutIcon />Logout
              </button>
            </div>
          )}
        </div>   
      </div>

      {/* Modal Ganti Role */}
      {showChangeRole && (
        <ChangeRoleModal
          token={localStorage.getItem('loginToken')}
          onClose={() => setShowChangeRole(false)}
          onSuccess={(newSession) => {
            onSessionUpdate(newSession);
            setShowChangeRole(false);
          }}
        />
      )}
    </header>
  );
}
