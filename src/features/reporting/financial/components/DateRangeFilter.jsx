import React from "react";
import { styles } from "./styles";

const DateRangeFilter = ({ startDate, endDate, onStartChange, onEndChange, onRefresh, loading, progress }) => {
    const pct =
        progress?.total ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : null;
    return (
        <div style={styles.filterRow}>
            <div style={styles.dateField}>
                <label style={styles.fieldLabel}>Date From</label>
                <input type="date" value={startDate} max={endDate}
                    onChange={(e) => onStartChange(e.target.value)} style={styles.dateInput} />
            </div>
            <div style={styles.dateField}>
                <label style={styles.fieldLabel}>Date To</label>
                <input type="date" value={endDate} min={startDate}
                    onChange={(e) => onEndChange(e.target.value)} style={styles.dateInput} />
            </div>
            <div style={styles.dateField}>
                <label style={styles.fieldLabel}>&nbsp;</label>
                <button onClick={onRefresh} disabled={loading} style={styles.refreshBtn}>
                    {loading
                        ? `⏳ Memuat${pct != null ? ` ${pct}%` : progress?.loaded ? ` (${progress.loaded})` : "..."}`
                        : "🔄 Refresh"}
                </button>
            </div>
        </div>
    );
};

export default DateRangeFilter;
