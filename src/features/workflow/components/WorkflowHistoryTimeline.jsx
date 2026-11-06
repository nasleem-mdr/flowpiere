// components/WorkflowHistoryTimeline.jsx
import React, { useMemo } from 'react';
import { parseWorkflowHistory, formatDuration } from '../utils/parseWorkflowHistory';

const GLYPH = { start: '▶', done: '✓', approved: '✓', rejected: '✕', pending: '' };

function StatusPill({ last }) {
  if (!last) return null;
  if (last.kind === 'pending') {
    return <span className="wf-badge wf-badge--warn">Menunggu {last.node}</span>;
  }
  if (last.kind === 'rejected') {
    return <span className="wf-badge wf-badge--bad">Ditolak</span>;
  }
  return null;
}

export default function WorkflowHistoryTimeline({ raw }) {
  const { entries, plainText } = useMemo(() => parseWorkflowHistory(raw), [raw]);

  if (!plainText) return null;

  // Format tidak dikenali -> tampilkan teks polos (tanpa HTML mentah)
  if (entries.length === 0) {
    return <div className="wf-tl-card"><div className="wf-tl__raw">{plainText}</div></div>;
  }

  const last = entries[entries.length - 1];

  return (
    <div className="wf-tl-card">
      <div className="wf-tl-head">
        <h3 className="wf-tl-title">Riwayat workflow</h3>
        <StatusPill last={last} />
      </div>

      <ol className="wf-tl" aria-label="Riwayat workflow">
        {entries.map((e, i) => (
          <li key={`${e.node}-${i}`} className={`wf-tl__item wf-tl__item--${e.kind}`}>
            <span className={`wf-tl__dot wf-tl__dot--${e.kind}`} aria-hidden="true">
              {GLYPH[e.kind]}
            </span>

            <div className="wf-tl__row">
              <span className="wf-tl__node">
                {e.node}
                {e.kind === 'approved' && <span className="wf-badge wf-badge--ok">Approved</span>}
                {e.kind === 'rejected' && <span className="wf-badge wf-badge--bad">Ditolak</span>}
                {e.kind === 'pending' && <span className="wf-badge wf-badge--warn">Sedang berjalan</span>}
              </span>
              <span className="wf-tl__time">
                {e.showDate && e.dateLabel ? `${e.dateLabel}, ` : ''}{e.timeLabel}
                {e.delta >= 1000 && (
                  <span className="wf-tl__delta" title="Selang waktu dari langkah sebelumnya">
                    +{formatDuration(e.delta)}
                  </span>
                )}
              </span>
            </div>

            {e.note
              ? <div className="wf-tl__note">{e.note}</div>
              : e.kind === 'pending' && <div className="wf-tl__empty">Belum ada catatan</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}
