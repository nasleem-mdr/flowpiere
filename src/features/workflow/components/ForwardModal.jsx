// components/ForwardModal.jsx
// Modal forward activity ke user lain (PUT /workflow/forward/{id}).
// Cari user internal lewat /models/ad_user, wajib pilih satu tujuan.
import React, { useState, useEffect, useCallback } from 'react';
import { idempiereApi, fkId, fkLabel } from '@/api/idempiereApi';

export default function ForwardModal({ open, activity, submitting, onClose, onSubmit }) {
  const [keyword, setKeyword]     = useState('');
  const [users, setUsers]         = useState([]);
  const [selected, setSelected]   = useState(null);
  const [searching, setSearching] = useState(false);
  const [message, setMessage]     = useState('');
  const [searchError, setSearchError] = useState(null);

  useEffect(() => {
    if (open) {
      setKeyword('');
      setUsers([]);
      setSelected(null);
      setMessage('');
      setSearchError(null);
    }
  }, [open]);

  const searchUsers = useCallback(async (q) => {
    setSearching(true);
    setSearchError(null);
    try {
      const safeQ = (q || '').replace(/'/g, "''");
      const filter = safeQ
        ? `(contains(toupper(Name),'${safeQ.toUpperCase()}') or contains(toupper(Value),'${safeQ.toUpperCase()}'))`
        : `IsActive eq true`;
      const base = `IsActive eq true${safeQ ? ` and ${filter}` : ''}`;
      const res = await idempiereApi(
        `/models/ad_user?$filter=${base}&$select=AD_User_ID,Name,Value,EMail&$orderby=Name&$top=20`
      );
      setUsers(Array.isArray(res?.records) ? res.records : []);
    } catch (err) {
      setSearchError(err.message || 'Gagal mencari user.');
      setUsers([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Load daftar awal saat modal dibuka.
  useEffect(() => {
    if (open) searchUsers('');
  }, [open, searchUsers]);

  if (!open || !activity) return null;

  return (
    <div className="wf-modal__backdrop" onClick={submitting ? undefined : onClose}>
      <div className="wf-modal wf-modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="wf-modal__accent wf-modal__accent--neutral" />

        <h3 className="wf-modal__title">Forward Persetujuan</h3>
        <p className="wf-modal__subtitle">
          {activity.summary || activity['node-name']}
        </p>

        <label className="wf-modal__label" htmlFor="wf-forward-search">Cari User Tujuan</label>
        <div className="wf-forward__searchrow">
          <input
            id="wf-forward-search"
            className="wf-modal__input"
            placeholder="Ketik nama atau username…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchUsers(keyword)}
            disabled={submitting}
          />
          <button
            type="button"
            className="wf-btn wf-btn--soft"
            onClick={() => searchUsers(keyword)}
            disabled={submitting || searching}
          >
            {searching ? '…' : 'Cari'}
          </button>
        </div>

        {searchError && <p className="wf-error-text">{searchError}</p>}

        <div className="wf-forward__list">
          {users.map((u) => {
            const id = fkId(u.AD_User_ID) ?? u.id;
            const active = selected?.id === id;
            return (
              <button
                key={id}
                type="button"
                className={`wf-forward__item ${active ? 'wf-forward__item--active' : ''}`}
                onClick={() => setSelected({ id, name: fkLabel(u.AD_User_ID) || u.Name })}
                disabled={submitting}
              >
                <span className="wf-forward__name">{fkLabel(u.AD_User_ID) || u.Name || `#${id}`}</span>
                <span className="wf-forward__sub">{u.Value || u.EMail || ''}</span>
              </button>
            );
          })}
          {!searching && users.length === 0 && !searchError && (
            <p className="wf-muted wf-forward__empty">Tidak ada user ditemukan.</p>
          )}
        </div>

        <label className="wf-modal__label" htmlFor="wf-forward-msg">
          Pesan <span className="wf-muted">(opsional)</span>
        </label>
        <textarea
          id="wf-forward-msg"
          className="wf-modal__textarea"
          rows={2}
          placeholder="Pesan untuk penerima…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={submitting}
        />

        <div className="wf-modal__actions">
          <button type="button" className="wf-btn wf-btn--ghost" onClick={onClose} disabled={submitting}>
            Batal
          </button>
          <button
            type="button"
            className="wf-btn wf-btn--primary"
            onClick={() => selected && onSubmit(selected.id, message)}
            disabled={submitting || !selected}
          >
            {submitting ? 'Memproses…' : `Forward ke ${selected?.name?.split(' ')[0] || '…'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
