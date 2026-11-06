// components/WorkflowActivityCard.jsx
// Kartu satu item approval di daftar kiri. Klik untuk membuka detail.
import React from 'react';

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function TypeBadge({ activity }) {
  if (activity['node-approval']) {
    return <span className="wf-badge wf-badge--approval">Butuh Persetujuan</span>;
  }
  if (activity['node-confirmation']) {
    return <span className="wf-badge wf-badge--confirm">Konfirmasi</span>;
  }
  return <span className="wf-badge wf-badge--choice">Pilihan User</span>;
}

export default function WorkflowActivityCard({ activity, selected, onSelect }) {
  const priority = Number(activity.priority || 0);

  return (
    <button
      type="button"
      className={`wf-card ${selected ? 'wf-card--selected' : ''}`}
      onClick={() => onSelect(activity)}
    >
      <div className="wf-card__top">
        <span className="wf-card__node">{activity['node-name'] || 'Workflow Node'}</span>
        {priority >= 50 && (
          <span className="wf-card__priority" title={`Prioritas ${priority}`}>!</span>
        )}
      </div>

      {activity.summary && (
        <p className="wf-card__summary">{activity.summary}</p>
      )}

      <div className="wf-card__meta">
        {activity['table-name'] && (
          <span className="wf-chip">{activity['table-name']}</span>
        )}
        <TypeBadge activity={activity} />
      </div>

      <div className="wf-card__foot">
        <span className="wf-card__when">{formatWhen(activity.created)}</span>
        <span className="wf-card__cta">Review →</span>
      </div>
    </button>
  );
}
