import React, { useState, useRef, useLayoutEffect, useMemo } from "react";
import { useWorkflowProgress } from "@/shared/hooks/useWorkflowProgress";

const COLORS = {
    done:    { bg: "#808000", fg: "#000" },
    current: { bg: "#f57c00", fg: "#fff" },
    aborted: { bg: "#ff3333", fg: "#fff" },
    pending: { bg: "#d4d4d4", fg: "#666" },
};
const REJECT_COLOR = "#ff3333";
const STATUS_TEXT = { done: "Selesai", current: "Menunggu", aborted: "Ditolak / Dihentikan", pending: "Belum dijalankan" };

const fmtTime = (t) => (t ? new Date(t).toLocaleString("id-ID") : "-");

// ---------- deteksi penolakan ----------
// Dokumen dianggap ditolak bila DocStatus = NA, ada node berstatus aborted,
// atau instance workflow berstatus CA/CT. Node penolak = node aborted; kalau
// tidak ada, node User Choice (Y/N) terakhir yang sudah dijalankan; kalau
// tidak ada juga, node terakhir yang sudah dijalankan.
function applyRejection(steps, docStatus, wfState) {
    const rejected =
        docStatus === "NA" ||
        steps.some((x) => x.status === "aborted") ||
        ["CA", "CT"].includes(wfState);
    if (!rejected) return { steps, rejected: false, rejectIdx: -1 };

    let idx = steps.findIndex((x) => x.status === "aborted");
    if (idx < 0) {
        for (let i = steps.length - 1; i >= 0; i--) {
            if (steps[i].isChoice && steps[i].status !== "pending") { idx = i; break; }
        }
    }
    if (idx < 0) {
        for (let i = steps.length - 1; i >= 0; i--) {
            if (steps[i].status !== "pending") { idx = i; break; }
        }
    }
    const next = steps.map((x, i) => (i === idx ? { ...x, status: "aborted" } : x));
    return { steps: next, rejected: true, rejectIdx: idx };
}

// ---------- elemen grafik ----------
const Connector = ({ active }) => (
    <div style={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}>
        <div style={{ width: 36, borderTop: `3px ${active ? "solid" : "dotted"} #555` }} />
        <div style={{ borderLeft: "7px solid #555", borderTop: "5px solid transparent", borderBottom: "5px solid transparent" }} />
    </div>
);

const StartCircle = ({ status }) => (
    <div style={{ ...s.circle, background: COLORS[status].bg, color: COLORS[status].fg }}>Start</div>
);

const NodeBox = ({ step }) => {
    const c = COLORS[step.status];
    if (step.isChoice) {
        return (
            <div style={s.diamondWrap} title={step.name}>
                <div style={{ ...s.diamond, background: c.bg }} />
                <span style={{ ...s.diamondText, color: c.fg }}>Y/N</span>
                <span style={s.caption}>{step.name}</span>
            </div>
        );
    }
    return (
        <div style={{ ...s.box, background: c.bg, color: c.fg, outline: step.branch ? "2px dashed #555" : "none" }} title={step.name}>
            {step.name}
        </div>
    );
};

const EndDoc = ({ status, label }) => {
    const c = COLORS[status];
    return (
        <div style={{ ...s.doc, background: status === "pending" ? "#eee" : c.bg, color: status === "pending" ? "#777" : c.fg }}>
            {label}
            <span style={s.docFold} />
        </div>
    );
};

// ---------- pesan status ----------
function buildMessage(data, docStatus, steps, rejected, rejectIdx) {
    const { process } = data;
    if (!process) {
        return ["CO", "CL"].includes(docStatus)
            ? "Dokumen ini diproses langsung (tanpa approval workflow), sehingga tidak ada riwayat workflow."
            : rejected
                ? "Dokumen ditolak."
                : "Dokumen belum masuk ke workflow (belum diajukan).";
    }
    const wfState = process.WFState?.id ?? process.WFState;
    const current = [...steps].reverse().find((x) => x.status === "current");

    if (rejected) {
        const r = rejectIdx >= 0 ? steps[rejectIdx] : null;
        const by     = r?.actor ? ` oleh ${r.actor}` : "";
        const at     = r ? ` pada langkah "${r.name}"` : "";
        const reason = (r?.text || "").replace(/\s+/g, " ").trim();
        const why    = reason ? ` dengan alasan "${reason}"` : "";
        return (
            <>
                {`Dokumen ditolak${by}${at}${why}.`}
                <br />
                Alur kembali ke Start — dokumen perlu direvisi dan diajukan ulang.
            </>
        );
    }
    if (wfState === "CC") return "Workflow selesai — dokumen telah disetujui dan diproses.";
    if (current) {
        const who = current.responsible || current.actor;
        return current.isChoice
            ? `Document menunggu persetujuan dari ${who || "Approver"}`
            : `Dokumen sedang di langkah "${current.name}"${who ? ` (${who})` : ""}`;
    }
    return docStatus === "DR" ? "Dokumen belum diajukan." : "Status workflow tidak diketahui.";
}

// ---------- modal ----------
export const WorkflowProgressModal = ({ open, onClose, tableName, tableId, recordId, docStatus, targetStatus = "CO", fallbackWorkflowId, title = "Workflow Activity Progress" }) => {
    const { loading, error, data, reload } = useWorkflowProgress({
        tableName, tableId, recordId, fallbackWorkflowId, enabled: open,
    });

    const wfState = data?.process?.WFState?.id ?? data?.process?.WFState;

    // Status node setelah memperhitungkan penolakan
    const view = useMemo(
        () => (data ? applyRejection(data.steps, docStatus, wfState) : { steps: [], rejected: false, rejectIdx: -1 }),
        [data, docStatus, wfState]
    );
    const showLoop = !!data && view.rejected && view.rejectIdx >= 0;

    // Ukur posisi Start & node penolak supaya panah kembali bisa digambar
    const flowRef   = useRef(null);
    const startRef  = useRef(null);
    const rejectRef = useRef(null);
    const [loop, setLoop] = useState(null);

    useLayoutEffect(() => {
        if (!open || loading || !showLoop) { setLoop(null); return undefined; }
        const measure = () => {
            const f = flowRef.current, st = startRef.current, rj = rejectRef.current;
            if (!f || !st || !rj) return;
            setLoop({
                x1: st.offsetLeft + st.offsetWidth / 2,
                y1: st.offsetTop + st.offsetHeight + 3,
                x2: rj.offsetLeft + rj.offsetWidth / 2,
                y2: rj.offsetTop + rj.offsetHeight,
                w:  f.scrollWidth,
                h:  f.scrollHeight,
            });
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [open, loading, showLoop, data]);

    if (!open) return null;

    const startStatus = data?.process ? "done" : "pending";
    const endStatus   = view.rejected ? "aborted" : wfState === "CC" ? "done" : "pending";
    const endLabel    = endStatus === "aborted"
        ? (docStatus && docStatus !== "IP" ? docStatus : "NA")
        : targetStatus;

    return (
        <div style={s.overlay} onClick={onClose}>
            <div style={s.modal} onClick={(e) => e.stopPropagation()}>
                <div style={s.header}>
                    <span>{title}</span>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button style={s.iconBtn} onClick={reload} title="Refresh">↻</button>
                        <button style={s.closeBtn} onClick={onClose}>✕</button>
                    </div>
                </div>

                <div style={s.body}>
                    {loading && <p>Memuat progress workflow...</p>}
                    {error && <p style={{ color: "#8b0000" }}>Gagal memuat: {error}</p>}
                    {!loading && !error && !data && <p>Tidak ada data workflow.</p>}

                    {data && !loading && (
                        <>
                            {data.workflowName && <div style={s.wfName}>Workflow: {data.workflowName}</div>}

                            {/* Grafik */}
                            <div style={{ overflowX: "auto" }}>
                                <div
                                    ref={flowRef}
                                    style={{ ...s.flowRow, paddingBottom: showLoop ? 64 : 28 }}
                                >
                                    <div ref={startRef} style={{ flex: "0 0 auto" }}>
                                        <StartCircle status={startStatus} />
                                    </div>

                                    {view.steps.map((st, i) => (
                                        <React.Fragment key={st.id}>
                                            <Connector active={st.status !== "pending"} />
                                            <div
                                                ref={showLoop && i === view.rejectIdx ? rejectRef : null}
                                                style={{ flex: "0 0 auto" }}
                                            >
                                                <NodeBox step={st} />
                                            </div>
                                        </React.Fragment>
                                    ))}

                                    <Connector active={endStatus !== "pending"} />
                                    <EndDoc status={endStatus} label={endLabel} />

                                    {/* Panah putus-putus merah: dari node penolak kembali ke Start */}
                                    {loop && (
                                        <svg
                                            width={loop.w}
                                            height={loop.h}
                                            style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
                                        >
                                            <defs>
                                                <marker id="wf-loop-arrow" viewBox="0 0 10 10" refX="5" refY="5"
                                                    markerWidth="5" markerHeight="5" orient="auto">
                                                    <path d="M 0 0 L 10 5 L 0 10 z" fill={REJECT_COLOR} />
                                                </marker>
                                            </defs>
                                            <path
                                                d={`M ${loop.x2} ${loop.y2} V ${Math.max(loop.y1, loop.y2) + 34} H ${loop.x1} V ${loop.y1 + 8}`}
                                                fill="none"
                                                stroke={REJECT_COLOR}
                                                strokeWidth="3"
                                                strokeDasharray="8 6"
                                                markerEnd="url(#wf-loop-arrow)"
                                            />
                                        </svg>
                                    )}
                                </div>
                            </div>

                            <p style={s.message}>{buildMessage(data, docStatus, view.steps, view.rejected, view.rejectIdx)}</p>

                            {/* Perbandingan definisi workflow vs aktivitas */}
                            {view.steps.length > 0 && (
                                <div style={{ overflowX: "auto" }}>
                                    <table style={s.table}>
                                        <thead>
                                            <tr>
                                                <th style={s.th}>#</th>
                                                <th style={s.th}>Langkah (Workflow)</th>
                                                <th style={s.th}>Status Activity</th>
                                                <th style={s.th}>Responsible / Oleh</th>
                                                <th style={s.th}>Waktu</th>
                                                <th style={s.th}>Catatan</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {view.steps.map((st, i) => (
                                                <tr key={st.id}>
                                                    <td style={s.td}>{i + 1}</td>
                                                    <td style={s.td}>{st.name}{st.branch ? " (cabang)" : ""}</td>
                                                    <td style={s.td}>
                                                        <span style={{ ...s.pill, background: COLORS[st.status].bg, color: COLORS[st.status].fg }}>
                                                            {STATUS_TEXT[st.status]}
                                                        </span>
                                                    </td>
                                                    <td style={s.td}>{st.actor || st.responsible || "-"}</td>
                                                    <td style={s.td}>{fmtTime(st.time)}</td>
                                                    <td style={{ ...s.td, maxWidth: 260, wordBreak: "break-word" }}>
                                                        {(st.text || "").replace(/\s+/g, " ").trim() || "-"}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ---------- tombol siap pakai di List mana pun ----------
export const WorkflowProgressButton = ({ buttonStyle, label = "🔀 Progress", disabled, ...modalProps }) => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                disabled={disabled}
                style={{ ...s.btn, ...buttonStyle }}
                title="Lihat progress approval workflow"
            >
                {label}
            </button>
            <WorkflowProgressModal open={open} onClose={() => setOpen(false)} {...modalProps} />
        </>
    );
};

const s = {
    btn: { background: "#6a1b9a", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 6, fontWeight: "bold", fontSize: 12, cursor: "pointer" },
    overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 12 },
    modal: { background: "#f3f3f3", width: "min(900px, 100%)", maxHeight: "90vh", overflow: "auto", borderRadius: 4, boxShadow: "0 8px 30px rgba(0,0,0,.35)" },
    header: { background: "#cfcfcf", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 18 },
    closeBtn: { width: 36, height: 36, borderRadius: "50%", border: "none", background: "#444", color: "#fff", cursor: "pointer", fontSize: 16 },
    iconBtn: { width: 36, height: 36, borderRadius: "50%", border: "none", background: "#777", color: "#fff", cursor: "pointer", fontSize: 18 },
    body: { padding: "24px 28px" },
    wfName: { fontSize: 12, color: "#333", marginBottom: 12 },
    // position: relative + width: max-content supaya SVG panah ikut ter-scroll bersama grafik
    flowRow: { position: "relative", display: "flex", alignItems: "center", width: "max-content", minWidth: "100%", padding: "30px 0 28px" },
    circle: { width: 78, height: 78, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flex: "0 0 auto" },
    box: { minWidth: 120, padding: "14px 16px", borderRadius: 10, textAlign: "center", fontSize: 17, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 },
    diamondWrap: { position: "relative", width: 70, height: 70, display: "flex", alignItems: "center", justifyContent: "center" },
    diamond: { position: "absolute", width: 50, height: 50, transform: "rotate(45deg)", borderRadius: 3 },
    diamondText: { position: "relative", fontSize: 16 },
    // caption di atas belah ketupat supaya tidak bertabrakan dengan panah kembali di bawahnya
    caption: { position: "absolute", bottom: "100%", marginBottom: 4, fontSize: 11, color: "#333", whiteSpace: "nowrap" },
    doc: { position: "relative", width: 52, height: 64, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flex: "0 0 auto", borderRadius: 2 },
    docFold: { position: "absolute", top: 0, right: 0, borderTop: "14px solid #777", borderLeft: "14px solid #f3f3f3" },
    message: { fontSize: 17, margin: "8px 0 20px", color: "#000" },
    table: { width: "100%", borderCollapse: "collapse", fontSize: 12, background: "#e6e6e6" },
    th: { textAlign: "left", padding: "8px 10px", background: "#999", color: "#fff" },
    td: { padding: "8px 10px", borderBottom: "1px solid #bbb" },
    pill: { padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: "bold" },
};