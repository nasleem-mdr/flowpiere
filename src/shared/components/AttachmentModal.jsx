/** ─────────────────────────────────────────────────────────────────────────────
* AttachmentModal.jsx
* src/shared/components/
*
* Modal lampiran generik — pasangan useAttachments(). Dipakai untuk dokumen
* apa pun (Requisition, C_Order, M_InOut, C_Invoice, ...).
*
* Props:
*   isOpen, onClose
*   att     — return value useAttachments(tableName, recordId, options)
*   canEdit — false → hanya melihat (role read-only)
*   title   — judul modal (default "📎 Lampiran")
*   hint    — teks bantuan kustom (opsional; default menyesuaikan mode)
*
* Tampilan menyesuaikan mode hook:
*   • staged            → "Akan diunggah" (+ "Tersimpan di dokumen" kalau record ada)
*   • uploadImmediately → hanya "Tersimpan di dokumen"; file langsung diunggah
* ─────────────────────────────────────────────────────────────────────────────
*/
import React, { useEffect, useState } from 'react';
import { COLOR, RADIUS } from '@/utils/styleTokens';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

// Upload REST memberi prefix timestamp 13 digit pada nama file — sembunyikan di UI.
const displayName = (name) => name.replace(/^\d{13}-/, '');

const ACCEPT_LABEL = { 'image/*': 'gambar', 'application/pdf': 'PDF' };
const describeAccept = (accept) =>
  accept.split(',').map((t) => t.trim()).filter(Boolean)
    .map((t) => ACCEPT_LABEL[t] || t).join(' / ');

const Thumb = ({ name, url, isImg, onRemove, disabled }) => (
  <div style={styles.thumb}>
    {isImg && url ? (
      <a href={url} target="_blank" rel="noreferrer" title={displayName(name)}>
        <img src={url} alt={displayName(name)} style={styles.thumbImg} />
      </a>
    ) : (
      <a
        href={url || undefined}
        target="_blank"
        rel="noreferrer"
        download={url ? displayName(name) : undefined}
        style={styles.fileChip}
        title={displayName(name)}
      >
        <span style={{ fontSize: '22px' }}>📄</span>
        <span style={styles.fileChipName}>{displayName(name)}</span>
      </a>
    )}
    {onRemove && (
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        title="Batalkan file ini"
        style={styles.thumbRemove}
      >✕</button>
    )}
  </div>
);

const AttachmentModal = ({ isOpen, onClose, att, canEdit = true, title = '📎 Lampiran', hint }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset konfirmasi hapus setiap modal ditutup.
  useEffect(() => { if (!isOpen) setConfirmDelete(false); }, [isOpen]);

  if (!isOpen || !att) return null;

  const {
    staged, existing, hasRecord, uploadImmediately, limits,
    loadingExisting, deleting, uploading, error,
    addFiles, removeStaged, deleteExisting,
  } = att;

  // Mode langsung-unggah butuh dokumen yang sudah tersimpan.
  const needsSavedDoc = uploadImmediately && !hasRecord;
  const canPick = canEdit && !needsSavedDoc;

  const handlePick = (e) => {
    addFiles(e.target.files);
    e.target.value = ''; // supaya file yang sama bisa dipilih ulang
  };

  const handleDeleteExisting = async () => {
    await deleteExisting();
    setConfirmDelete(false);
  };

  const defaultHint = uploadImmediately
    ? `File langsung diunggah ke dokumen ini. Format ${describeAccept(limits.accept)}, maks ${limits.maxMb}MB per file.`
    : `File dikirim ke server bersamaan dengan dokumen saat disimpan. Format ${describeAccept(limits.accept)}, maks ${limits.maxMb}MB per file, maks ${limits.maxFiles} file baru per dokumen.`;

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={{ fontWeight: 700, fontSize: '15px', color: COLOR.textDk }}>{title}</span>
          <button onClick={onClose} style={styles.btnClose}>✕</button>
        </div>

        <div style={styles.body}>
          <div style={styles.hint}>{hint || defaultHint}</div>

          {needsSavedDoc && (
            <div style={styles.empty}>Simpan dokumen terlebih dahulu untuk bisa melampirkan file.</div>
          )}

          {canPick && (
            <label style={{ ...styles.btnPick, opacity: uploading ? 0.6 : 1 }}>
              {uploading ? 'Mengunggah...' : '＋ Pilih File'}
              <input
                type="file"
                multiple
                accept={limits.accept}
                onChange={handlePick}
                disabled={uploading}
                style={{ display: 'none' }}
              />
            </label>
          )}

          {error && <div style={styles.error}>{error}</div>}

          {/* 1. File baru (staged) — tidak relevan di mode langsung-unggah */}
          {!uploadImmediately && (
            <>
              <div style={styles.sectionTitle}>Akan diunggah ({staged.length})</div>
              {staged.length === 0 ? (
                <div style={styles.empty}>Belum ada file baru yang dipilih.</div>
              ) : (
                <div style={styles.grid}>
                  {staged.map((s) => (
                    <Thumb
                      key={s.key}
                      name={s.file.name}
                      url={s.url}
                      isImg={!!s.url}
                      onRemove={canEdit ? () => removeStaged(s.key) : undefined}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* 2. Sudah tersimpan di server */}
          {hasRecord && (
            <>
              <div style={styles.sectionTitle}>Tersimpan di dokumen ({existing.length})</div>
              {loadingExisting ? (
                <div style={styles.empty}>Memuat lampiran...</div>
              ) : existing.length === 0 ? (
                <div style={styles.empty}>Belum ada lampiran tersimpan.</div>
              ) : (
                <>
                  <div style={styles.grid}>
                    {existing.map((f) => (
                      <Thumb
                        key={f.name}
                        name={f.name}
                        url={f.url}
                        isImg={f.contentType ? f.contentType.startsWith('image/') : IMAGE_EXT.test(f.name)}
                      />
                    ))}
                  </div>

                  {canEdit && (
                    !confirmDelete ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        disabled={deleting}
                        style={styles.btnDanger}
                      >🗑️ Hapus Semua Lampiran Tersimpan</button>
                    ) : (
                      <div style={styles.confirmBox}>
                        <span style={{ fontSize: '12px', color: COLOR.textDk }}>
                          Semua lampiran dokumen ini akan dihapus (tidak bisa satu per satu). Lanjutkan?
                        </span>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <button type="button" onClick={handleDeleteExisting} disabled={deleting} style={styles.btnDanger}>
                            {deleting ? 'Menghapus...' : 'Ya, Hapus'}
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting} style={styles.btnGhost}>
                            Batal
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div style={styles.footer}>
          <button onClick={onClose} style={styles.btnDone}>Selesai</button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1600, padding: '16px',
  },
  card: {
    background: COLOR.surface, borderRadius: RADIUS.xl,
    width: '100%', maxWidth: '560px', maxHeight: '86vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 18px', borderBottom: `1px solid ${COLOR.border}`, flexShrink: 0,
  },
  btnClose: {
    background: 'rgba(0,0,0,0.06)', border: 'none', color: COLOR.textMd,
    borderRadius: '50%', width: '30px', height: '30px', fontSize: '16px',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1, overflowY: 'auto', padding: '14px 18px', minHeight: 0 },
  hint: { fontSize: '11px', color: COLOR.textLt, marginBottom: '12px', lineHeight: 1.5 },
  btnPick: {
    display: 'inline-block', background: COLOR.primary, color: '#fff',
    padding: '9px 14px', borderRadius: RADIUS.md, fontSize: '13px',
    fontWeight: 700, cursor: 'pointer', marginBottom: '8px',
  },
  error: {
    whiteSpace: 'pre-line', fontSize: '12px', color: COLOR.danger,
    background: '#fef2f2', borderRadius: RADIUS.sm, padding: '8px 10px', marginBottom: '8px',
  },
  sectionTitle: { fontSize: '12px', fontWeight: 700, color: COLOR.textMd, margin: '14px 0 8px' },
  empty: { fontSize: '12px', color: COLOR.textLt, padding: '6px 0' },
  grid: { display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' },
  thumb: { position: 'relative', width: '96px', height: '96px' },
  thumbImg: {
    width: '96px', height: '96px', objectFit: 'cover', display: 'block',
    borderRadius: '6px', border: `1px solid ${COLOR.border}`,
  },
  fileChip: {
    width: '96px', height: '96px', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '4px', padding: '6px', textDecoration: 'none', color: COLOR.textDk,
    background: '#f7f9ff', border: `1px solid ${COLOR.border}`, borderRadius: '6px',
  },
  fileChipName: {
    fontSize: '10px', maxWidth: '84px', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  thumbRemove: {
    position: 'absolute', top: '-6px', right: '-6px', width: '22px', height: '22px',
    borderRadius: '50%', border: 'none', background: COLOR.danger, color: '#fff',
    fontSize: '11px', cursor: 'pointer', lineHeight: 1,
  },
  btnDanger: {
    background: 'none', border: `1px solid ${COLOR.danger}`, color: COLOR.danger,
    borderRadius: RADIUS.sm, padding: '7px 12px', fontSize: '12px',
    fontWeight: 600, cursor: 'pointer',
  },
  btnGhost: {
    background: 'none', border: `1px solid ${COLOR.border}`, color: COLOR.textMd,
    borderRadius: RADIUS.sm, padding: '7px 12px', fontSize: '12px',
    fontWeight: 600, cursor: 'pointer',
  },
  confirmBox: {
    background: '#fef2f2', borderRadius: RADIUS.sm, padding: '10px 12px', marginTop: '4px',
  },
  footer: { borderTop: `1px solid ${COLOR.border}`, padding: '12px 18px', flexShrink: 0 },
  btnDone: {
    background: COLOR.primary, color: '#fff', border: 'none', width: '100%',
    padding: '12px', borderRadius: RADIUS.md, fontWeight: 700, fontSize: '14px', cursor: 'pointer',
  },
};

export default AttachmentModal;
