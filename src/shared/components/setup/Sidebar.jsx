import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { LogoIconW } from '@/shared/components/icon';
import { getMenuSections } from '@/config/menuConfig';
import { useAccess } from '@/context/AccessContext';
import '@/css/Sidebar.css';

const menuSections = getMenuSections(['procurement', 'sales', 'payment', 'linkreport', 'master']);

const MOBILE_BREAKPOINT = 768;

function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const query = `(max-width: ${breakpoint}px)`;
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);

  return isMobile;
}

const ChevronIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

export default function Sidebar({ isCollapsed, setIsCollapsed }) {
  const location = useLocation();
  const { canView, loading } = useAccess();
  const isMobile = useIsMobile();

  // Di mobile: isCollapsed = panel tertutup. Di desktop: isCollapsed = mode icon-rail.
  const isOpenMobile = isMobile && !isCollapsed;
  const compact = isCollapsed && !isMobile; // mode ikon hanya di desktop

  // Saat pindah ke mobile (atau load pertama di mobile), panel mulai tertutup
  useEffect(() => {
    if (isMobile) setIsCollapsed(true);
  }, [isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tutup panel mobile dengan tombol Escape
  useEffect(() => {
    if (!isOpenMobile) return;
    const onKey = (e) => e.key === 'Escape' && setIsCollapsed(true);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpenMobile, setIsCollapsed]);

  const [collapsedSections, setCollapsedSections] = useState(() =>
    Object.fromEntries(menuSections.map(s => [s.sectionKey, !!s.defaultCollapsed]))
  );

  const toggleSection = (sectionKey) => {
    setCollapsedSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  const wrapperClass = [
    'side-panel-left',
    isMobile ? 'is-mobile' : '',
    isOpenMobile ? 'mobile-open' : '',
  ].filter(Boolean).join(' ');

  const asideClass = [
    'sidebar',
    compact ? 'collapsed' : '',
    isMobile ? 'mobile' : '',
  ].filter(Boolean).join(' ');

  const fab = isMobile && isCollapsed && (
    <button
      className="mobile-menu-fab"
      onClick={() => setIsCollapsed(false)}
      aria-label="Buka menu"
    >
      ☰
    </button>
  );

  const backdrop = isOpenMobile && (
    <div className="sidebar-backdrop" onClick={() => setIsCollapsed(true)} />
  );

  if (loading) {
    return (
      <div className={wrapperClass}>
        {fab}
        {backdrop}
        <aside className={asideClass}>
          <div className="sidebar-header">
            <div className={`sidebar-brand ${compact ? 'collapsed' : ''}`}>
              <div className="brand-icon">iD</div>
              {!compact && <span>
                <em className="flow-text">Flow</em>
                <em className="piere-text">Piere</em>
              </span>}
            </div>
            <button
              className="hamburger-btn"
              onClick={() => setIsCollapsed(!isCollapsed)}
              aria-label="Toggle Sidebar"
            >
              ☰
            </button>
          </div>
          <nav className="sidebar-nav" style={{ padding: '12px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: '36px', background: '#f1f5f9', borderRadius: '6px', marginBottom: '8px' }} />
            ))}
          </nav>
        </aside>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      {fab}
      {backdrop}

      <aside className={asideClass}>
        <div className="sidebar-header">
          <div className={`sidebar-brand ${compact ? 'collapsed' : ''}`}>
            <div className="brand-icon"><LogoIconW size={40} /></div>
            {!compact && <span><em className='flow-text'>Flow</em><em className='piere-text'>Piere</em></span>}
          </div>

          <button
            className="hamburger-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label="Toggle Sidebar"
          >
            {isMobile ? '✕' : '☰'}
          </button>
        </div>

        <nav className="sidebar-nav">
          {menuSections.map((section, index) => {
            const visibleItems = section.items.filter(item => !item.windowKey || canView(item.windowKey));
            if (visibleItems.length === 0) return null;

            const isSectionCollapsed = !!collapsedSections[section.sectionKey];

            return (
              <div key={section.sectionKey} className="sidebar-section">
                {index > 0 && <hr className="sidebar-divider" />}

                {!compact && (
                  <button
                    className="sidebar-section-header"
                    onClick={() => toggleSection(section.sectionKey)}
                    aria-expanded={!isSectionCollapsed}
                  >
                    <span className="sidebar-section-title">{section.sectionLabel}</span>
                    <span className={`section-chevron ${isSectionCollapsed ? 'closed' : ''}`}>
                      <ChevronIcon />
                    </span>
                  </button>
                )}

                {(compact || !isSectionCollapsed) && visibleItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsCollapsed(true)}
                    className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                    data-tooltip={item.label}
                  >
                    <div className="nav-icon">{item.icon}</div>
                    {!compact && <span className="nav-label">{item.label}</span>}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}