import WelcomeCards from '@/features/dashboard/components/WelcomeCards';

import useDashboardStats from '@/features/dashboard/hooks/useDashboardStats';

import '@/css/Dashboard.css';

/**
 * Dashboard — halaman utama setelah login
 * Props:
 *   session : { username, clientId, clientName, roleId, roleName, orgId, orgName, language, token }
 *   onLogout: () => void
 */
export default function Dashboard({ session, onLogout }) {
  const { stats, loading } = useDashboardStats();
 
  return (
    <div className="dashboard-root">
      <main className="dashboard-main">
        <div className="dashboard-welcome">

          {/* Kartu info sesi + shortcut navigasi */}
          <WelcomeCards session={session} />

          {/* Statistik */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#aaa', fontSize: 13 }}>
              Memuat data dashboard...
            </div>
          ) : !stats ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#f87171', fontSize: 13 }}>
              Gagal memuat data. Periksa koneksi API.
            </div>
          ) : (
            <div style={gridStyle}>
              
              {/* 
              <StatCard
                label="Total Penjualan"
                today={stats.todaySales}
                yesterday={stats.yesterdaySales}
                format="currency"
                color="#3b82f6"
                chart={stats.monthChart}
              />
              <StatCard
                label="Total Item Terjual"
                today={stats.todayQty}
                yesterday={stats.yesterdayQty}
                format="number"
                color="#10b981"
              />
              <MonthlyChartCard data={stats.monthChart} />
              */}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const gridStyle = {
  display:             'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap:                 '16px',
  alignItems:          'start',
  width:               '100%',
  textAlign:           'left',
};