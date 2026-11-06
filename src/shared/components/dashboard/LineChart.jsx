import { useState, useRef } from 'react';

/**
 * LineChart — SVG interactive chart with tooltip
 * Props:
 *   data  : [{ date: 'YYYY-MM-DD', value: number }]
 *   color : hex string (default '#3b82f6')
 *   height: number px (default 80)
 */
export default function LineChart({ data, color = '#3b82f6', height = 80 }) {
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);

  if (!data || data.length < 2) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 12 }}>
      Tidak ada data
    </div>
  );

  const W    = 200;
  const H    = height;
  const padX = 8;
  const padY = 8;

  const values = data.map(d => d.value);
  const min    = Math.min(...values);
  const max    = Math.max(...values);
  const range  = max - min || 1;

  const pts = data.map((d, i) => ({
    x:     padX + (i / (data.length - 1)) * (W - padX * 2),
    y:     padY + (1 - (d.value - min) / range) * (H - padY * 2),
    date:  d.date,
    value: d.value,
  }));

  const areaPath =
    `M${pts[0].x},${pts[0].y} ` +
    pts.slice(1).map(p => `L${p.x},${p.y}`).join(' ') +
    ` L${pts[pts.length - 1].x},${H - padY} L${padX},${H - padY} Z`;

  const linePath =
    `M${pts[0].x},${pts[0].y} ` +
    pts.slice(1).map(p => `L${p.x},${p.y}`).join(' ');

  const gradId = `grad-${color.replace('#', '')}`;

  const handleMouseMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect   = svg.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * W;
    let closest = pts[0], minDist = Infinity;
    pts.forEach(p => {
      const dist = Math.abs(p.x - mouseX);
      if (dist < minDist) { minDist = dist; closest = p; }
    });
    setTooltip({ x: closest.x, y: closest.y, date: closest.date, value: closest.value });
  };

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {pts.filter(p => p.value === 0).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2" fill="#ddd" />
        ))}

        {tooltip && (
          <>
            <line
              x1={tooltip.x} y1={padY}
              x2={tooltip.x} y2={H - padY}
              stroke={color} strokeWidth="1" strokeDasharray="3,3" opacity="0.5"
            />
            <circle cx={tooltip.x} cy={tooltip.y} r="4" fill="#fff" stroke={color} strokeWidth="2" />
          </>
        )}

        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3.5" fill={color} />
      </svg>

      {tooltip && (
        <div style={{
          position:      'absolute',
          top:           0,
          left:          `${(tooltip.x / W) * 100}%`,
          transform:     tooltip.x > W * 0.7 ? 'translateX(-110%)' : 'translateX(8px)',
          background:    '#1e293b',
          color:         '#fff',
          borderRadius:  6,
          padding:       '5px 10px',
          fontSize:      11,
          pointerEvents: 'none',
          whiteSpace:    'nowrap',
          boxShadow:     '0 2px 8px rgba(0,0,0,0.2)',
          zIndex:        10,
        }}>
          <div style={{ color: '#94a3b8', marginBottom: 2 }}>
            {new Date(tooltip.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
          </div>
          <div style={{ fontWeight: 700, fontSize: 12 }}>
            Rp {tooltip.value.toLocaleString('id-ID')}
          </div>
        </div>
      )}
    </div>
  );
}
