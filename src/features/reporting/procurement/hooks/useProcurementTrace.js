import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchProcurementData } from "../api/procurementTraceApi";
import { buildTraceRows, summarize } from "../utils/buildTrace";

const iso = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const defaultPeriod = () => {
  const to = new Date(), from = new Date();
  from.setDate(from.getDate() - 30);
  return { dateFrom: iso(from), dateTo: iso(to) };
};

export default function useProcurementTrace() {
  const [period, setPeriod] = useState(defaultPeriod);
  const [ui, setUi] = useState({ search: "", vendor: "", overall: "", slaDays: 3, includeVoid: false });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setData(await fetchProcurementData(period, setProgress));
    } catch (e) {
      setError(e?.message || "Gagal mengambil data procurement");
    } finally {
      setLoading(false); setProgress("");
    }
  }, [period]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const setFilter = useCallback((patch) => setUi((s) => ({ ...s, ...patch })), []);

  const allRows = useMemo(
    () => (data ? buildTraceRows(data, { slaDays: Number(ui.slaDays) || 0, includeVoid: ui.includeVoid }) : []),
    [data, ui.slaDays, ui.includeVoid]
  );
  const vendors = useMemo(() => [...new Set(allRows.map((r) => r.vendor).filter(Boolean))].sort(), [allRows]);
  const base = useMemo(() => {
    const q = ui.search.trim().toLowerCase();
    return allRows.filter((r) => (!q || r.searchText.includes(q)) && (!ui.vendor || r.vendor === ui.vendor));
  }, [allRows, ui.search, ui.vendor]);
  const summary = useMemo(() => summarize(base), [base]);
  const rows = useMemo(() => (ui.overall ? base.filter((r) => r.overall === ui.overall) : base), [base, ui.overall]);

  return { period, setPeriod, ui, setFilter, load, loading, error, progress, rows, summary, vendors };
}
