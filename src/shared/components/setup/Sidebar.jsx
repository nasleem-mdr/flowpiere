import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { LogoIconP } from '@/shared/components/icon';
import { getMenuSections } from '@/config/menuConfig';
import { useAccess } from '@/context/AccessContext';
import '@/css/Sidebar.css';

const menuSections = getMenuSections(['procurement', 'sales', 'payment','linkreport','master']); // semua section — sumber tunggal dari menuConfig

const ChevronIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

export default function Sidebar({ isCollapsed, setIsCollapsed }) {
  const location = useLocation();
  const { canView, loading } = useAccess();

  const [collapsedSections, setCollapsedSections] = useState(() =>
    Object.fromEntries(menuSections.map(s => [s.sectionKey, !!s.defaultCollapsed]))
  );

  const toggleSection = (sectionKey) => {
    setCollapsedSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  if (loading) {
    return (
      <div className="side-panel-left">
        <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-header">
            <div className={`sidebar-brand ${isCollapsed ? 'collapsed' : ''}`}>
              <div className="brand-icon">iD</div>
              {!isCollapsed && <span>Procure<em>Grid</em></span>}
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
    <div className="side-panel-left">
      <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className={`sidebar-brand ${isCollapsed ? 'collapsed' : ''}`}>
            <div className="brand-icon"><LogoIconP size={40}/></div>
            {!isCollapsed && <span>Procure <em>Grid</em></span>}
          </div>

          <button
            className="hamburger-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label="Toggle Sidebar"
          >
            ☰
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

                {!isCollapsed && (
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

                {(isCollapsed || !isSectionCollapsed) && visibleItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsCollapsed(true)}
                    className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                    data-tooltip={item.label}
                  >
                    <div className="nav-icon">{item.icon}</div>
                    {!isCollapsed && <span className="nav-label">{item.label}</span>}
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