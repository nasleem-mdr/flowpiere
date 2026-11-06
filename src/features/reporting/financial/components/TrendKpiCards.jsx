import React from "react";
import { BS_SERIES } from "../utils/constants";
import { fmtNum, fmtSigned } from "../utils/format";
import { styles } from "./styles";

const TrendKpiCards = ({ lastBS, lastLaba }) => {
    if (!lastBS) return null;
    const labaColor = lastLaba >= 0 ? "#2e7d32" : "#c62828";
    return (
        <div style={styles.kpiRow}>
            {BS_SERIES.map((s) => (
                <div key={s.key} style={{ ...styles.kpiCard, borderTopColor: s.color }}>
                    <div style={styles.kpiLabel}>{s.label}</div>
                    <div style={styles.kpiValue}>{fmtNum(lastBS[s.key])}</div>
                    <div style={styles.kpiSub}>{lastBS.label}</div>
                </div>
            ))}
            <div style={{ ...styles.kpiCard, borderTopColor: labaColor }}>
                <div style={styles.kpiLabel}>Laba Bersih Bulan Ini</div>
                <div style={{ ...styles.kpiValue, color: labaColor }}>{fmtSigned(lastLaba)}</div>
                <div style={styles.kpiSub}>{lastBS.label}</div>
            </div>
        </div>
    );
};

export default TrendKpiCards;
