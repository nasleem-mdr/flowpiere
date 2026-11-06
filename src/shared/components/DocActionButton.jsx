import React, { useState } from "react";
import DocActionModal from "./DocActionModal";
import { getAvailableActions } from "@/shared/docAction/docActionConfig";

/**
 * Tombol Close/Void generik.
 * items: [{ id, documentNo, status }] — satu dokumen (tombol per baris) atau banyak (aksi massal).
 */
export default function DocActionButton({ tableName, items, label = "⛔ Close / Void", onDone, style }) {
  const [open, setOpen] = useState(false);
  const eligible = items.filter((i) => getAvailableActions(tableName, i.status).length > 0);
  const disabled = eligible.length === 0;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={disabled ? "Tidak ada aksi Close/Void untuk status dokumen ini" : "Close / Void dokumen"}
        style={{
          ...style,
          backgroundColor: disabled ? "#ccc" : style?.backgroundColor,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {label}
      </button>
      {open && <DocActionModal tableName={tableName} items={items} onClose={() => setOpen(false)} onDone={onDone} />}
    </>
  );
}
