import LineChart from './LineChart';
import { cardStyle } from './StatCard';

/**
 * MonthlyChartCard — grafik transaksi sepanjang bulan berjalan
 * Props:
 *   data: [{ date: 'YYYY-MM-DD', value: number }]
 */
export default function MonthlyChartCard({ data }) {
  const now          = new Date();
  const year         = now.getFullYear();
  const month        = now.getMonth();
  const todayDate    = now.getDate();

  // Buat map dari data yang ada
  const dataMap = {};
  (data || []).forEach(d => { dataMap[d.date] = d.value; });

  // Fill setiap hari dari tanggal 1 s/d hari ini (hari kosong = 0)
  const filledData = [];
  for (let day = 1; day <= todayDate; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    filledData.push({ date: dateStr, value: dataMap[dateStr] || 0 });
  }

  const hasData    = filledData.some(d => d.value > 0);
  const totalMonth = filledData.reduce((s, d) => s + d.value, 0);

  // Label X-axis: tanggal 1, kelipatan 5, dan hari ini
  const xLabels = filledData.filter(d => {
    const day = new Date(d.date).getDate();
    return day === 1 || day % 5 === 0 || day === todayDate;
  });

  return (
    <div style={{ ...cardStyle, gridColumn: '1 / -1' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Penjualan Bulan Ini
          </div>
          {hasData && (
            <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
              Total: <strong>Rp {totalMonth.toLocaleString('id-ID')}</strong>
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#aaa' }}>
          {now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* Chart */}
      {filledData.length >= 2 ? (
        <>
          <LineChart data={filledData} color="#3b82f6" height={110} />

          {/* X-axis labels */}
          <div style={{ position: 'relative', height: 18, marginTop: 2 }}>
            {xLabels.map((d) => {
              const day     = new Date(d.date).getDate();
              const pct     = ((day - 1) / (todayDate - 1 || 1)) * 100;
              const isToday = day === todayDate;
              return (
                <span key={d.date} style={{
                  position:   'absolute',
                  left:       `${pct}%`,
                  transform:  'translateX(-50%)',
                  fontSize:   10,
                  color:      isToday ? '#3b82f6' : '#bbb',
                  fontWeight: isToday ? 700 : 400,
                  whiteSpace: 'nowrap',
                }}>
                  {isToday ? 'Hari ini' : day}
                </span>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', color: '#bbb', fontSize: 12, padding: '20px 0' }}>
          Belum ada data bulan ini
        </div>
      )}
    </div>
  );
}
