import React from 'react';

/**
 * UOMSelect — combobox pemilih Unit of Measure
 *
 * Props:
 *   uomOptions   Array<{ id, name, multiplyRate }> — list UOM yang tersedia (default + konversi)
 *   selectedId   number                            — id UOM yang sedang dipilih
 *   onChange     (uomOption) => void               — dipanggil saat user ganti UOM
 *   disabled     bool
 */
const UOMSelect = ({ uomOptions = [], selectedId, onChange, disabled }) => {
  if (!uomOptions || uomOptions.length <= 1) return null; // tidak perlu tampil jika hanya 1 UOM

  return (
    <select
      className="ci-uom-select"
      value={selectedId ?? ''}
      disabled={disabled}
      onChange={e => {
        const chosen = uomOptions.find(u => u.id === Number(e.target.value));
        if (chosen) onChange(chosen);
      }}
    >
      {uomOptions.map(u => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
};

export default UOMSelect;