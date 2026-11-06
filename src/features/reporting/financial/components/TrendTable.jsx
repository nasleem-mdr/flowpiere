import React from "react";
import { BS_SERIES, PL_GROUPS } from "../utils/constants";
import { fmtNum, fmtSigned } from "../utils/format";
import { styles } from "./styles";

const TrendTable = ({ trend, labaBersihPerMonth }) => (
    <>
        <h3 style={{ marginTop: "8px" }}>Tabel Trend</h3>
        <div style={{ overflowX: "auto" }}>
            <table className="modern-table" style={{ minWidth: 700 }}>
                <thead>
                    <tr>
                        <th>Komponen</th>
                        {trend.bs.map((m) => (
                            <th key={m.key} style={{ textAlign: "right" }}>{m.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    <tr style={styles.sectionRow}>
                        <td colSpan={trend.bs.length + 1}>🏛️ NERACA (kumulatif s.d. akhir bulan, ternormalisasi)</td>
                    </tr>
                    {BS_SERIES.map((s) => (
                        <tr key={s.key}>
                            <td style={{ borderLeft: `3px solid ${s.color}`, paddingLeft: "10px" }}>{s.label}</td>
                            {trend.bs.map((m) => (
                                <td key={m.key} style={{ textAlign: "right" }}>{fmtNum(m[s.key])}</td>
                            ))}
                        </tr>
                    ))}
                    <tr style={styles.sectionRow}>
                        <td colSpan={trend.bs.length + 1}>📈 LABA-RUGI (per bulan, ternormalisasi)</td>
                    </tr>
                    {PL_GROUPS.map((g) => (
                        <tr key={g.key}>
                            <td style={{ borderLeft: `3px solid ${g.color}`, paddingLeft: "10px" }}>{g.label}</td>
                            {trend.pl.map((m) => (
                                <td key={m.key} style={{ textAlign: "right" }}>{fmtNum(m.totals[g.key])}</td>
                            ))}
                        </tr>
                    ))}
                    <tr style={styles.labaRow}>
                        <td style={{ fontWeight: "700" }}>Laba Bersih</td>
                        {labaBersihPerMonth.map((v, i) => (
                            <td key={i} style={{ textAlign: "right", fontWeight: "700", color: v >= 0 ? "#2e7d32" : "#c62828" }}>
                                {fmtSigned(v)}
                            </td>
                        ))}
                    </tr>
                </tbody>
            </table>
        </div>
        <p style={{ marginTop: "8px", fontSize: "12px", color: "#888" }}>
            Neraca = Σ saldo kumulatif s.d. akhir bulan, dinormalisasi per posisi normal
            (Aktiva = Debet − Kredit; Hutang & Modal = Kredit − Debet) sehingga selalu
            positif. Laba-rugi = per bulan (reset tiap bulan), dikelompokkan dari digit
            pertama kode akun: 4=Pendapatan Usaha, 5=HPP, 6=Beban Adm, 7=Pendapatan Non
            Ops, 8=Beban Non Ops. Laba Bersih = (4+7) − (5+6+8); negatif = rugi (dalam
            kurung merah). Hover pada titik grafik untuk melihat nilai persisnya.
        </p>
    </>
);

export default TrendTable;
