import { useState, useEffect, useCallback } from "react";
import { idempiereApi } from "@/api/idempiereApi";

const idOf    = (v) => (v && typeof v === "object" ? v.id : v);
const labelOf = (v) => (v && typeof v === "object" ? v.identifier : v);
const isTrue  = (v) => v === true || v === "Y" || v === "true";
const toNum   = (v) => (v === null || v === undefined || v === "" ? null : Number(idOf(v)));
const cleanNote = (raw) => {
    if (!raw) return null;
    const cleaned = String(raw)
        .replace(/\bIsApproved\s*=\s*[YN]\b\s*-?\s*/gi, "")  // "IsApproved=Y - "
        .replace(/\s+/g, " ")                                // rapikan spasi / baris baru
        .replace(/^[\s-]+|[\s-]+$/g, "")                     // buang strip sisa di ujung
        .trim();
    return cleaned || null;
};
const tableIdCache = new Map();
const chunk = (arr, n) => {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
};
const orClause = (field, ids) => ids.map((i) => `${field} eq ${i}`).join(" or ");

async function resolveTableId(tableName, tableId) {
    if (tableId) return tableId;
    const key = tableName.toLowerCase();
    if (tableIdCache.has(key)) return tableIdCache.get(key);
    const res = await idempiereApi(
        `/models/ad_table?$filter=TableName eq '${tableName}'&$select=AD_Table_ID`
    );
    const tid = res.records?.[0]?.id ?? res.records?.[0]?.AD_Table_ID;
    if (!tid) throw new Error(`AD_Table '${tableName}' tidak ditemukan`);
    tableIdCache.set(key, tid);
    return tid;
}

// Susun urutan node utama: ikuti transisi dengan SeqNo terkecil dari start node.
// Node cabang (mis. jalur "ditolak") yang benar-benar dieksekusi disisipkan
// tepat setelah node induknya.
function buildPath(nodes, nexts, startId, executedIds) {
    const nodeMap = new Map(nodes.map((n) => [Number(n.id ?? n.AD_WF_Node_ID), n]));
    const nextMap = new Map();
    nexts.forEach((nx) => {
        const from = toNum(nx.AD_WF_Node_ID);
        const to   = toNum(nx.AD_WF_Next_ID);
        if (!nextMap.has(from)) nextMap.set(from, []);
        nextMap.get(from).push({ to, seq: Number(nx.SeqNo || 0) });
    });
    nextMap.forEach((list) => list.sort((a, b) => a.seq - b.seq));

    const path = [];
    const visited = new Set();
    let cur = startId;
    while (cur && !visited.has(cur) && nodeMap.has(cur)) {
        visited.add(cur);
        path.push({ node: nodeMap.get(cur), branch: false });
        cur = nextMap.get(cur)?.[0]?.to;
    }

    executedIds.forEach((id) => {
        if (visited.has(id) || !nodeMap.has(id)) return;
        const parentIdx = path.findIndex(
            (p) => nextMap.get(Number(p.node.id ?? p.node.AD_WF_Node_ID))?.some((x) => x.to === id)
        );
        const item = { node: nodeMap.get(id), branch: true };
        if (parentIdx >= 0) path.splice(parentIdx + 1, 0, item);
        else path.push(item);
        visited.add(id);
    });
    return path;
}

async function fetchProgress({ tableName, tableId, recordId, fallbackWorkflowId }) {
    const tid = await resolveTableId(tableName, tableId);

    // 1) Instance workflow milik dokumen (ambil yang terbaru)
    const pRes = await idempiereApi(
        `/models/ad_wf_process` +
        `?$filter=AD_Table_ID eq ${tid} and Record_ID eq ${recordId}` +
        `&$select=AD_WF_Process_ID,AD_Workflow_ID,WFState,Processed,TextMsg,Created,Updated` +
        `&$orderby=AD_WF_Process_ID desc&$top=1`
    );
    const process = pRes.records?.[0] || null;
    const workflowId = process ? toNum(process.AD_Workflow_ID) : fallbackWorkflowId || null;

    if (!workflowId) return { process: null, steps: [], workflowName: null };

    // 2) Definisi workflow: header + node + transisi
    const [wfRes, nodeRes] = await Promise.all([
        idempiereApi(`/models/ad_workflow?$filter=AD_Workflow_ID eq ${workflowId}&$select=AD_Workflow_ID,Name,AD_WF_Node_ID`),
        idempiereApi(`/models/ad_wf_node?$filter=AD_Workflow_ID eq ${workflowId}&$select=AD_WF_Node_ID,Name,Action,AD_WF_Responsible_ID`),
    ]);
    const wf    = wfRes.records?.[0];
    const nodes = Array.isArray(nodeRes.records) ? nodeRes.records : [];
    const nodeIds = nodes.map((n) => Number(n.id ?? n.AD_WF_Node_ID));

    const nextChunks = await Promise.all(
        chunk(nodeIds, 40).map((ids) =>
            idempiereApi(
                `/models/ad_wf_nodenext?$filter=${orClause("AD_WF_Node_ID", ids)}` +
                `&$select=AD_WF_Node_ID,AD_WF_Next_ID,SeqNo`
            ).then((r) => r.records || [])
        )
    );
    const nexts = nextChunks.flat();

    // 3) Activity (posisi saat ini) + event audit (riwayat) — audit boleh gagal
    let activities = [];
    let audits = [];
    if (process) {
        const pid = process.id ?? process.AD_WF_Process_ID;
        const [aRes, auRes] = await Promise.all([
            idempiereApi(
                `/models/ad_wf_activity?$filter=AD_WF_Process_ID eq ${pid}` +
                `&$select=AD_WF_Activity_ID,AD_WF_Node_ID,WFState,Processed,AD_User_ID,AD_WF_Responsible_ID,Created,Updated,TextMsg` +
                `&$orderby=AD_WF_Activity_ID`
            ),
            idempiereApi(
                `/models/ad_wf_eventaudit?$filter=AD_WF_Process_ID eq ${pid}` +
                `&$select=AD_WF_EventAudit_ID,AD_WF_Node_ID,WFState,AD_User_ID,Created` +
                `&$orderby=AD_WF_EventAudit_ID`
            ).catch(() => ({ records: [] })),
        ]);
        activities = aRes.records || [];
        audits     = auRes.records || [];
    }

    // 4) Status per node: audit (berurutan) lalu activity menimpa
    const info = new Map(); // nodeId -> {state, user, responsible, time}
    audits.forEach((a) => {
        const id = toNum(a.AD_WF_Node_ID);
        info.set(id, { ...(info.get(id) || {}), state: idOf(a.WFState), user: labelOf(a.AD_User_ID) || info.get(id)?.user, time: a.Created });
    });
    activities.forEach((a) => {
        const id = toNum(a.AD_WF_Node_ID);
        const state = idOf(a.WFState);
        info.set(id, {
            ...(info.get(id) || {}),
            state,
            open: !isTrue(a.Processed) && !["CC", "CA", "CT"].includes(state),
            user: labelOf(a.AD_User_ID) || info.get(id)?.user,
            responsible: labelOf(a.AD_WF_Responsible_ID),
            text: a.TextMsg,
            time: a.Updated || a.Created,
        });
    });

    const path = buildPath(nodes, nexts, toNum(wf?.AD_WF_Node_ID), [...info.keys()]);

    const steps = path
        .filter(({ node }) => !/^\(?start\)?$/i.test(node.Name || "")) // Start digambar sebagai lingkaran sendiri
        .map(({ node, branch }) => {
            const id = Number(node.id ?? node.AD_WF_Node_ID);
            const i  = info.get(id);
            let status = "pending";
            if (i) {
                if (i.state === "CC") status = "done";
                else if (["CA", "CT"].includes(i.state)) status = "aborted";
                else status = "current"; // OS / OR / ON
            }
            return {
                id,
                name: node.Name,
                isChoice: idOf(node.Action) === "C",
                branch,
                status,
                state: i?.state || null,
                actor: i?.user || null,
                responsible: i?.responsible || labelOf(node.AD_WF_Responsible_ID) || null,
                time: i?.time || null,
                text: cleanNote(i?.text),
            };
        });

    return { process, steps, workflowName: wf?.Name || null };
}

export function useWorkflowProgress({ tableName, tableId, recordId, fallbackWorkflowId, enabled }) {
    const [state, setState] = useState({ loading: false, error: null, data: null });

    const load = useCallback(async () => {
        if (!recordId) return;
        setState((s) => ({ ...s, loading: true, error: null }));
        try {
            const data = await fetchProgress({ tableName, tableId, recordId, fallbackWorkflowId });
            setState({ loading: false, error: null, data });
        } catch (err) {
            console.error("Gagal fetch workflow progress:", err.message);
            setState({ loading: false, error: err.message, data: null });
        }
    }, [tableName, tableId, recordId, fallbackWorkflowId]);

    useEffect(() => {
        if (enabled) load();
    }, [enabled, load]);

    return { ...state, reload: load };
}
