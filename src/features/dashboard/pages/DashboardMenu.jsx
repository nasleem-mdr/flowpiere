import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccess } from '@/context/AccessContext';
import { getMenuSections } from '@/config/menuConfig';
import '@/css/DashboardMenu.css';

const dashboardSections = getMenuSections(['reportpro', 'reportsales', 'financialreport']);

// ── List/Daftar Dinamis ────────────────────────────────────────────────
function ListReport() {
  const { canView, loading } = useAccess();
  const location = useLocation();

  // Filter section & item berdasarkan hak akses (visibilitas)
  const visibleSections = dashboardSections
    .map(section => ({
      ...section,
      visibleItems: section.items.filter(item => !item.windowKey || canView(item.windowKey)),
    }))
    .filter(section => section.visibleItems.length > 0);

  if (loading || visibleSections.length === 0) return null;

  return (
    <div
      className="ds-menu-grid"
      style={{ '--section-count': Math.min(visibleSections.length, 3) }}
    >
      {visibleSections.map((section) => (
        <div key={section.sectionKey} className="ds-menu-column">
          <div className="ds-menu-header">
            <span className="ds-menu-section-title">{section.sectionLabel}</span>
          </div>
          {section.visibleItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`ds-menu-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <div className="ds-menu-item-left">
                <span className="ds-menu-icon">{item.icon}</span>
                <span className="ds-menu-item-text">{item.label}</span>
              </div>
              <span className="ds-menu-arrow">→</span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Dashboard Menu Utama ───────────────────────────────────────────────
export default function DashboardMenu({ session, onLogout }) {
  return (
    <div className="dashboard-root">
      <div className="dashboard-main">
        <div className="dashboard-welcome">
          
          {/* Container Header (Icon + Title) yang berada di tengah */}
          <div className="welcome-header-top">
            <div className="welcome-icon">
              <svg width="36" height="36" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <h1 className="welcome-title">Report <em>& Product</em></h1>
          </div>
          
          {/* Banner Status Laporan dengan lebar penuh */}
          <div className="report-active-banner">
            <div className="report-banner-info">
              <span>📊 Modul Navigasi Laporan Aktif</span>
            </div>
            <span className="report-banner-badge">Mode Report</span>
          </div>

          {/* Render Komponen List Laporan Dinamis */}
          <ListReport />

        </div>
      </div>
    </div>
  );
}