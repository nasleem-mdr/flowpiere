// Pencarian produk dengan debounce — hasil tampil sebagai dropdown pilihan.

import React, { useState, useEffect, useRef, useCallback } from 'react';

export default function ProductSearchInput({ onSearch, onSelect, disabled }) {
  const [keyword, setKeyword]   = useState('');
  const [results, setResults]   = useState([]);
  const [open, setOpen]         = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);
  const boxRef = useRef(null);

  const doSearch = useCallback(async (q) => {
    setSearching(true);
    const rows = await onSearch(q);
    setResults(rows);
    setOpen(true);
    setSearching(false);
  }, [onSearch]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (keyword.trim().length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(keyword), 350);
    return () => clearTimeout(debounceRef.current);
  }, [keyword, doSearch]);

  // Tutup dropdown saat klik di luar.
  useEffect(() => {
    const handler = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="pa-search" ref={boxRef}>
      <input
        className="pa-search__input"
        placeholder="Ketik nama / kode / barcode produk…"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        disabled={disabled}
      />
      {searching && <span className="pa-search__spinner">…</span>}

      {open && results.length > 0 && (
        <ul className="pa-search__dropdown">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="pa-search__item"
                onClick={() => {
                  onSelect(p);
                  setKeyword(`${p.value} — ${p.name}`);
                  setOpen(false);
                }}
              >
                <span className="pa-search__name">{p.name}</span>
                <span className="pa-search__meta">
                  {p.value}{p.upc ? ` · ${p.upc}` : ''}{p.uom ? ` · ${p.uom}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
