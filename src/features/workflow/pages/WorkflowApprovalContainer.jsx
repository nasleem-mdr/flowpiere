// pages/WorkflowApprovalContainer.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useWorkflowActivities, useWorkflowDecision, useWorkflowDocumentDetail } from '../hooks';
import { WorkflowActivityCard, WorkflowDetailSheet, DecisionModal, ForwardModal } from '../components';
import '@/css/WorkflowApproval.css';
import '@/css/WorkflowApproval.timeline.css';
export default function WorkflowApprovalContainer() {
  const { activities, loading, error, lastUpdated, fetchActivities, removeActivity } =
    useWorkflowActivities({ autoRefreshMs: 60000 });
  const { decide, submitting, error: decisionError, clearError } = useWorkflowDecision();
  const { detail, loading: detailLoading, error: detailError, loadDetail, clearDetail } =
    useWorkflowDocumentDetail();

  const [selectedId, setSelectedId] = useState(null);
  const [keyword, setKeyword]     = useState('');
  const [decision, setDecision]   = useState(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [toast, setToast]         = useState(null);

  const selected = useMemo(
    () => activities.find((a) => a.id === selectedId) || null,
    [activities, selectedId]
  );

  useEffect(() => {
    if (selected) loadDetail(selected);
    else clearDetail();
  }, [selected, loadDetail, clearDetail]);

  useEffect(() => {
    if (!selectedId && activities.length > 0) setSelectedId(activities[0].id);
  }, [activities, selectedId]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return activities;
    return activities.filter((a) =>
      [a.summary, a['node-name'], a['table-name']].some((v) => (v || '').toLowerCase().includes(q))
    );
  }, [activities, keyword]);

  const notify = (msg, tone = 'success') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 4000);
  };

  const handleAction = useCallback((action) => {
    clearError();
    if (action === 'forward') setForwardOpen(true);
    else setDecision({ action });
  }, [clearError]);

  const handleDecisionSubmit = useCallback(async (message) => {
    const result = await decide(selected, decision.action, { message });
    if (result.ok) {
      notify(decision.action === 'reject' ? 'Dokumen ditolak.' : 'Keputusan tersimpan.');
      removeActivity(selected.id);
      setDecision(null);
    }
  }, [decide, selected, decision, removeActivity]);

  const handleForwardSubmit = useCallback(async (userTo, message) => {
    const result = await decide(selected, 'forward', { userTo, message });
    if (result.ok) {
      notify('Approval berhasil di-forward.');
      removeActivity(selected.id);
      setForwardOpen(false);
    }
  }, [decide, selected, removeActivity]);

  return (
    <div className="wf-page">
      
      <header className="header-content">
        <span
          style={{
            color: '#000',
            fontWeight: 700,
            fontSize: '15px',
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {/* Ganti icon ini sesuai icon workflow yang kamu pakai */}
          <span>Form Workflow Approval</span>
          <span style={{ fontSize: '12px', fontWeight: 400, opacity: 0.85 }}>
            ({activities.length})
          </span>
        </span>

        <button
          type="button"
          onClick={() => fetchActivities()}
          disabled={loading}
          style={{
            background: 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(7, 207, 74, 0.85)',
            borderRadius: '20px',
            padding: '3px 10px',
            fontSize: '11px',
            color: '#e0eaff',
            cursor: loading ? 'default' : 'pointer',
            outline: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            color: '#000',
          }}
        >
          ⟳ Refresh
        </button>
      </header>

      {error && <div className="wf-banner wf-banner--error">{error}</div>}
      {decisionError && <div className="wf-banner wf-banner--error">{decisionError}</div>}

      <div className="wf-layout">
        <aside className="wf-list">
          <input
            className="wf-search"
            placeholder="Cari dokumen / node…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {loading && <div className="wf-state">Memuat…</div>}
          {!loading && filtered.length === 0 && (
            <div className="wf-state">
              {activities.length === 0
                ? 'Tidak ada dokumen yang menunggu persetujuan.'
                : 'Tidak cocok dengan pencarian.'}
            </div>
          )}
          {filtered.map((a) => (
            <WorkflowActivityCard
              key={a.id}
              activity={a}
              selected={a.id === selectedId}
              onSelect={(act) => setSelectedId(act.id)}
            />
          ))}
        </aside>

        <section className={`wf-pane ${selected ? 'wf-pane--open' : ''}`}>
          <WorkflowDetailSheet
            activity={selected}
            detail={detail}
            loading={detailLoading}
            error={detailError}
            submitting={submitting}
            onClose={() => setSelectedId(null)}
            onAction={handleAction}
          />
        </section>
      </div>

      <DecisionModal
        open={!!decision}
        action={decision?.action}
        activity={selected}
        submitting={submitting}
        onClose={() => setDecision(null)}
        onSubmit={handleDecisionSubmit}
      />
      <ForwardModal
        open={forwardOpen}
        activity={selected}
        submitting={submitting}
        onClose={() => setForwardOpen(false)}
        onSubmit={handleForwardSubmit}
      />

      {toast && <div className={`wf-toast wf-toast--${toast.tone}`}>{toast.msg}</div>}
    </div>
  );
}
