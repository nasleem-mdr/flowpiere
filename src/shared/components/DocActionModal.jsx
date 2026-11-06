import React, { useEffect, useMemo, useRef, useState } from "react";
import { DOC_ACTION_CONFIG, STATUS_LABEL } from "@/shared/docAction/docActionConfig";
import { pool, previewItem, runItem } from "@/shared/docAction/docActionService";

const STATE_VIEW = {
  checking: ["⏳", "Memeriksa…", "#555"],
  ready: ["✅", "Siap dijalankan", "#2e7d32"],
  blocked: ["⛔", "Diblokir", "#c62828"],
  invalid: ["⚠️", "Dilewati", "#f57c00"],
  running: ["⏳", "Menjalankan…", "#1565c0"],
  success: ["✅", "Berhasil", "#2e7d32"],
  error: ["❌", "Gagal", "#c62828"],
};

export default function DocActionModal({ tableName, items, onClose, onDone }) {
  const cfg = DOC_ACTION_CONFIG[tableName];
  const available = useMemo(
    () => cfg.actions.filter((a) => items.some((i) => a.statuses.includes(i.status))),
    [cfg, items]
  );
  const [action, setAction] = useState(available[0]?.code);
  const [results, setResults] = useState({});
  const [phase, setPhase] = useState("checking"); // checking | ready | running | done
  const changed = useRef(false);

  // Periksa semua dokumen setiap kali aksi dipilih
  useEffect(() => {
    if (!action) return undefined;
    let off = false;
    setPhase("checking");
    setResults({});
    (async () => {
      await pool(items, 3, async (it) => {
        const r = await previewItem(tableName, it, action).catch((e) => ({ state: "error", message: e.message }));
        if (!off) setResults((p) => ({ ...p, [it.id]: r }));
      });
      if (!off) setPhase("ready");
    })();
    return () => { off = true; };
  }, [action, items, tableName]);

  const act = cfg.actions.find((a) => a.code === action);
  const targets = items.filter((i) => results[i.id]?.state === "ready");

  const run = async () => {
    setPhase("running");
    await pool(targets, 1, async (it) => { // berurutan agar posting/urutan dokumen aman
      setResults((p) => ({ ...p, [it.id]: { state: "running" } }));
      const r = await runItem(tableName, it, action);
      if (r.state === "success") changed.current = true;
      setResults((p) => ({ ...p, [it.id]: r }));
    });
    setPhase("done");
  };

  const close = () => { onClose(); if (changed.current) onDone?.(); };

  return (
    <div style={S.overlay} onClick={phase === "running" ? undefined : close}>
      <div style={S.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>{cfg.label}: Close / Void</h3>

        <div style={S.actions}>
          {available.map((a) => (
            <button key={a.code} type="button" disabled={phase === "running" || phase === "done"}
              onClick={() => setAction(a.code)}
              style={{ ...S.choice, ...(a.code === action ? (a.tone === "danger" ? S.choiceDanger : S.choiceOn) : null) }}>
              {a.label}
            </button>
          ))}
        </div>

        <div style={S.list}>
          {items.map((it) => {
            const r = results[it.id] || { state: "checking" };
            const [icon, label, color] = STATE_VIEW[r.state] || STATE_VIEW.checking;
            return (
              <div key={it.id} style={S.row}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>{it.documentNo}</strong>
                  <span style={{ color, fontWeight: 600 }}>{icon} {label}</span>
                </div>
                <div style={S.mute}>Status: {STATUS_LABEL[r.status || it.status] || it.status}</div>
                {r.message && <div style={{ ...S.msg, color }}>{r.message}</div>}
                {r.blockers?.length > 0 && (
                  <ul style={S.blockers}>
                    {r.blockers.map((b) => (
                      <li key={`${b.type}${b.id}`}>{b.typeLabel} <strong>{b.no}</strong> ({STATUS_LABEL[b.status] || b.status})</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        <div style={S.footer}>
          <button type="button" style={S.btn} onClick={close} disabled={phase === "running"}>
            {phase === "done" ? "Selesai" : "Batal"}
          </button>
          {phase !== "done" && (
            <button type="button" onClick={run} disabled={phase !== "ready" || targets.length === 0}
              style={{ ...S.btn, ...S.btnPrimary, ...(act?.tone === "danger" ? { background: "#c62828" } : null), opacity: phase !== "ready" || !targets.length ? 0.5 : 1 }}>
              {phase === "running" ? "Memproses…" : `${act?.label} ${targets.length} dokumen`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 8, padding: 18, width: "min(640px,100%)", maxHeight: "88vh", display: "flex", flexDirection: "column", gap: 12 },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  choice: { padding: "6px 14px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 },
  choiceOn: { background: "#37474f", color: "#fff", borderColor: "#37474f" },
  choiceDanger: { background: "#c62828", color: "#fff", borderColor: "#c62828" },
  list: { overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 },
  row: { border: "1px solid #e0e0e0", borderRadius: 6, padding: "8px 10px", fontSize: 13 },
  mute: { color: "#777", fontSize: 12 },
  msg: { fontSize: 12, marginTop: 4 },
  blockers: { margin: "4px 0 0", paddingLeft: 18, fontSize: 12 },
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 },
  btn: { padding: "8px 16px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontWeight: 600 },
  btnPrimary: { background: "#37474f", color: "#fff", borderColor: "transparent" },
};
