import React from 'react';
import { BarChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import useGenericStats from '@/shared/hooks/useGenericStats';
import useDashboardAccess from '@/shared/hooks/useDashboardAccess';
import usePurchasingStats from '@/shared/hooks/usePurchasingStats';
import useRequisitionConversion from '@/features/requisition/hooks/useRequisitionConversion';
import '@/css/Dashboard.css';
import { useAccess } from '@/context/AccessContext';
import LineChart from './LineChart';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingCartIcon, RequisitionIcon, ReciprocalIcon } from '@/shared/components';
import { getMenuSections } from '@/config/menuConfig';

const COLOR_DR = '#f57c00';
const COLOR_CO = '#00d1b2';   // teal — sama dengan welcome-card-icon
const COLOR_IP = '#6366f1';   // indigo — sama dengan welcome-title gradient

const STATUS_LABEL = { CO: 'Completed', IP: 'In Progress', DR: 'Draft' };

// Hanya section 'report' dan 'master' yang ditampilkan di dashboard
const dashboardSections = getMenuSections(['report', 'master']);

// ── Requisition: summary card saja ──────────────────────────────────────────
function RequisitionCard({ createdByList, loadingSubs }) {
  const { stats, loading } = useGenericStats({
    model:           'm_requisition',
    dateField:       'DateDoc',
    totalField:      'TotalLines',
    statusField:     'DocStatus',
    compareStatuses: ['CO', 'IP'],
    monthRange:      1,
    createdByList:   loadingSubs ? null : createdByList,
  });

  const co = stats?.comparison?.CO?.count ?? '-';
  const ip = stats?.comparison?.IP?.count ?? '-';

  return (
    <div className="ds-card">
      <div className="ds-card-title">
        <RequisitionIcon size={20}/>Requisition <span className="ds-card-period">(bulan ini)</span>
      </div>
      {loading || loadingSubs ? (
        <div className="ds-loading">Memuat...</div>
      ) : (
        <div className="ds-status-row">
          <div className="ds-status-box">
            <div className="ds-status-count" style={{ color: '#2e7d32' }}>{co}</div>
            <div className="ds-status-label">Completed</div>
          </div>
          <div className="ds-divider" />
          <div className="ds-status-box">
            <div className="ds-status-count" style={{ color: '#1565c0' }}>{ip}</div>
            <div className="ds-status-label">In Progress</div>
          </div>
        </div>
      )}
    </div>
  );
}
function OrderTrendCard() {
  const { stats, loading } = usePurchasingStats(); 
  // stats.monthChart = [{ date: '2026-07-01', value: ... }, ...]

  return (
    <div className="ds-card">
      <div className="ds-card-title">Trend Purchasing</div>
      {loading ? (
        <div>Memuat...</div>
      ) : (
        <LineChart data={stats?.monthChart} color="#00d1b2" height={100} />
      )}
    </div>
  );
}
function PurchasingCard() {
  const { stats, loading } = usePurchasingStats({ days: 30 }); // opsional, 30 sudah default

  return (
    <div className="ds-card">
      <div className="ds-card-title">
        🛒 Purchase Order <span className="ds-card-period">(30 hari terakhir)</span>
      </div>
      {loading ? (
        <div className="ds-loading">Memuat...</div>
      ) : (
        <>
          <div className="ds-status-row">
            <div className="ds-status-box">
              <div className="ds-status-count">{stats?.count ?? 0}</div>
              <div className="ds-status-label">Total PO</div>
            </div>
          </div>
          <div className="ds-chart-label-mt">Tren Harian</div>
          <LineChart data={stats?.chartData || []} color="#f57c00" height={90} />
        </>
      )}
    </div>
  );
}
function RequisitionConversionCard() {
  const { stats, loading } = useRequisitionConversion({ monthRange: 1 });

  return (
    <div className="ds-card">
      <div className="ds-card-title">
        <ReciprocalIcon /> Requisition → PO <span className="ds-card-period">(bulan ini)</span>
      </div>
      {loading ? (
        <div className="ds-loading">Memuat...</div>
      ) : (
        <>
          <div className="ds-status-row">
            <div className="ds-status-box">
              <div className="ds-status-count" style={{ color: COLOR_CO }}>{stats?.converted ?? '-'}</div>
              <div className="ds-status-label">Sudah jadi PO</div>
            </div>
            <div className="ds-divider" />
            <div className="ds-status-box">
              <div className="ds-status-count" style={{ color: COLOR_DR }}>{stats?.notConverted ?? '-'}</div>
              <div className="ds-status-label">Belum diproses</div>
            </div>
          </div>
          <div className="ds-chart-label-mt">
            Conversion Rate: <strong>{stats?.conversionRate ?? 0}%</strong>
          </div>
        </>
      )}
    </div>
  );
}
// ── Chart card generik untuk SO & Invoice ───────────────────────────────────
function ChartCard({ title, model, dateField, totalField, baseFilter, createdByList, loadingSubs }) {
  const { stats, loading } = useGenericStats({
    model,
    dateField,
    totalField,
    baseFilter,
    statusField:     'DocStatus',
    compareStatuses: ['CO', 'IP'],
    monthRange:      1,
    createdByList:   loadingSubs ? null : createdByList,
  });

  // Gabungkan data CO & IP per tanggal untuk chart
  const chartData = React.useMemo(() => {
    if (!stats?.comparison) return [];
    const allDates = new Set([
      ...(stats.comparison.CO?.chartData || []).map(d => d.date),
      ...(stats.comparison.IP?.chartData || []).map(d => d.date),
    ]);
    return [...allDates].sort().map(date => ({
      date: date.slice(5), // MM-DD
      CO:   stats.comparison.CO?.chartData.find(d => d.date === date)?.value || 0,
      IP:   stats.comparison.IP?.chartData.find(d => d.date === date)?.value || 0,
    }));
  }, [stats]);

  const co = stats?.comparison?.CO;
  const ip = stats?.comparison?.IP;

  return (
    <div className="ds-card">
      <div className="ds-card-title">
        {title} <span className="ds-card-period">(bulan ini)</span>
      </div>
      {loading || loadingSubs ? (
        <div className="ds-loading">Memuat...</div>
      ) : (
        <>
          <div className="ds-status-row">
            <div className="ds-status-box">
              <div className="ds-status-count" style={{ color: '#2e7d32' }}>{co?.count ?? 0}</div>
              <div className="ds-status-label">Completed ({formatNum(co?.total)})</div>
            </div>
            <div className="ds-divider" />
            <div className="ds-status-box">
              <div className="ds-status-count" style={{ color: '#1565c0' }}>{ip?.count ?? 0}</div>
              <div className="ds-status-label">In Progress ({formatNum(ip?.total)})</div>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="ds-empty">Tidak ada data</div>
          ) : (
            <>
              <div className="ds-chart-label">Tren Harian</div>
              <ResponsiveContainer width="100%">
                {/* ... LineChart sama */}
                <PurchasingCard />
              </ResponsiveContainer>

              <div className="ds-chart-label-mt">Perbandingan per Hari</div>
              <ResponsiveContainer width="100%">
                {/* ... BarChart sama */}
              </ResponsiveContainer>
            </>
          )}
        </>
      )}
    </div>
  );
}
// ── List/daftar ────────────────────────────────────────────────────────
function ListReport() {
  const { canView, loading } = useAccess();
  const location = useLocation();

  // Filter dulu section yang punya minimal 1 item visible, baru render grid-nya —
  // supaya jumlah kolom CSS grid (via --section-count) sesuai jumlah section
  // yang BENAR-BENAR tampil, bukan jumlah section mentah di dashboardSections.
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
          <span className="ds-menu-section-title">{section.sectionLabel}</span>
          {section.visibleItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`ds-menu-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <div className="ds-menu-icon">{item.icon}</div>
              <span className="ds-menu-label">{item.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Scope info banner ────────────────────────────────────────────────────────
function ScopeBanner({ isSupervisor, subordinates, loadingSubs }) {
  if (loadingSubs) return null;
  return (
    <div className="ds-banner">
      {isSupervisor
        ? `👥 Anda melihat data milik Anda + ${subordinates.length} bawahan langsung`
        : '👤 Anda melihat data milik Anda sendiri'}
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────
export default function DashboardStats() {
  const { createdByList, isSupervisor, subordinates, loadingSubs } = useDashboardAccess();

  const sharedProps = { createdByList, loadingSubs };

   return (
    <div style={{ width: '100%' }}>
      
      <div className="ds-container">
        
        <ScopeBanner isSupervisor={isSupervisor} subordinates={subordinates} loadingSubs={loadingSubs} />
        <RequisitionCard {...sharedProps} />
        <ChartCard 
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShoppingCartIcon size={20} /> Purchase Order
            </div>
          } 
          model="c_order" 
          dateField="DateOrdered" 
          totalField="GrandTotal" 
          baseFilter="IsSOTrx eq false" 
          {...sharedProps} 
        />
        <RequisitionConversionCard />
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatNum(val, short = false) {
  if (val === null || val === undefined) return '-';
  if (short && val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (short && val >= 1_000)     return `${(val / 1_000).toFixed(0)}K`;
  return Number(val).toLocaleString('id-ID');
}