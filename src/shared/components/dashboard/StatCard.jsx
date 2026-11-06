import LineChart from './LineChart';

// ─── Helpers ────────────────────────────────────────────────────────────────
export function shortNum(v, isCurrency = false) {
  const n = parseFloat(v) || 0;
  let result;
  if (n >= 1_000_000_000) result = (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  else if (n >= 1_000_000) result = (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  else if (n >= 1_000)     result = (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  else                      result = n.toLocaleString('id-ID');
  return isCurrency ? `Rp ${result}` : result;
}

const ArrowUp = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
  </svg>
);

const ArrowDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
  </svg>
);

// ─── Shared card style ───────────────────────────────────────────────────────
export const cardStyle = {
  background:   '#fff',
  borderRadius: 12,
  padding:      '16px 20px',
  boxShadow:    '0 1px 4px rgba(0,0,0,0.07)',
  border:       '1px solid #f0f0f0',
};

/**
 * StatCard — ringkasan statistik hari ini vs kemarin
 * Props:
 *   label    : string
 *   today    : number
 *   yesterday: number
 *   format   : 'currency' | 'number'
 *   color    : hex string
 *   chart    : [{ date, value }] (opsional)
 */
export default function StatCard({ label, today, yesterday, format = 'currency', color, chart }) {
  const todayNum     = parseFloat(today)     || 0;
  const yesterdayNum = parseFloat(yesterday) || 0;
  const delta        = yesterdayNum === 0 ? null : ((todayNum - yesterdayNum) / yesterdayNum) * 100;
  const isUp         = delta === null ? null : delta >= 0;
  const isCurrency   = format === 'currency';

  return (
    <div style={{ ...cardStyle, borderTop: `3px solid ${color}` }}>

      {/* Label */}
      <div style={{ fontSize: 11, color: '#888', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
        {label}
      </div>

      {/* Delta */}
      <div style={{ marginBottom: 12 }}>
        {delta === null ? (
          <span style={{ fontSize: 12, color: '#aaa' }}>Belum ada data kemarin</span>
        ) : (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 20, fontWeight: 800,
            color: isUp ? '#16a34a' : '#dc2626',
          }}>
            {isUp ? <ArrowUp /> : <ArrowDown />}
            {isUp ? '+' : ''}{delta.toFixed(1)}%
          </div>
        )}
      </div>

      {/* Hari ini */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#aaa', minWidth: 52 }}>Hari ini</span>
        <span style={{ fontSize: 20, fontWeight: 800, color: '#1a202c' }}>
          {shortNum(todayNum, isCurrency)}
        </span>
      </div>

      {/* Kemarin */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
        <span style={{ fontSize: 11, color: '#aaa', minWidth: 52, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Kemarin</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#888' }}>
          {shortNum(yesterdayNum, isCurrency)}
        </span>
      </div>

      {/* Mini chart */}
      {chart && chart.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <LineChart data={chart} color={color} height={52} />
        </div>
      )}
    </div>
  );
}
