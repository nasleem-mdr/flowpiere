import React from "react";
import { fmtNum, fmtCompact } from "../utils/format";

/**
 * Multi-series line chart SVG murni (tanpa dependency). Reusable:
 *   <TrendLineChart title labels={[...]} series={[{key,label,color,data:[...]}]} />
 */
const TrendLineChart = ({ title, labels, series, height = 280 }) => {
    const W = 900, H = height, PAD = { top: 16, right: 12, bottom: 46, left: 62 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const allValues = series.flatMap((s) => s.data);
    const maxV = Math.max(0, ...allValues);
    const minV = Math.min(0, ...allValues);
    const range = maxV - minV || 1;
    const y = (v) => PAD.top + ((maxV - v) / range) * plotH;

    const n = labels.length || 1;
    const x = (i) => (n === 1 ? PAD.left + plotW / 2 : PAD.left + (i / (n - 1)) * plotW);
    const ticks = [0, 1, 2, 3].map((i) => minV + (range * i) / 3);

    return (
        <div style={{ marginBottom: "24px" }}>
            <div style={{ fontWeight: "700", fontSize: "14px", marginBottom: "6px", color: "#37474f" }}>{title}</div>
            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "8px" }}>
                {series.map((s) => (
                    <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#555" }}>
                        <span style={{ width: 16, height: 3, background: s.color, borderRadius: 2, display: "inline-block" }} />
                        {s.label}
                    </span>
                ))}
            </div>
            <div style={{ overflowX: "auto" }}>
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 620, background: "#fff", border: "1px solid #e0e0e0", borderRadius: "8px" }}>
                    {ticks.map((t, i) => (
                        <g key={i}>
                            <line x1={PAD.left} y1={y(t)} x2={W - PAD.right} y2={y(t)}
                                stroke={t === 0 ? "#90a4ae" : "#eceff1"} strokeWidth={t === 0 ? 1.5 : 1} />
                            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#78909c">
                                {fmtCompact(t)}
                            </text>
                        </g>
                    ))}
                    {series.map((s) => {
                        const pts = s.data.map((v, i) => `${x(i)},${y(v ?? 0)}`).join(" ");
                        return (
                            <g key={s.key}>
                                <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
                                {s.data.map((v, i) => (
                                    <circle key={i} cx={x(i)} cy={y(v ?? 0)} r={3.5} fill="#fff" stroke={s.color} strokeWidth={2}>
                                        <title>{`${labels[i]} • ${s.label}: ${fmtNum(v ?? 0)}`}</title>
                                    </circle>
                                ))}
                            </g>
                        );
                    })}
                    {labels.map((lab, i) => (
                        <text key={lab} x={x(i)} y={H - PAD.bottom + 16} textAnchor={n > 8 ? "end" : "middle"}
                            fontSize="10.5" fill="#546e7a"
                            transform={n > 8 ? `rotate(-38 ${x(i)} ${H - PAD.bottom + 16})` : undefined}>
                            {lab}
                        </text>
                    ))}
                </svg>
            </div>
        </div>
    );
};

export default TrendLineChart;
