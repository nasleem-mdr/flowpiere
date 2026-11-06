// Contoh file: src/styles/formStyles.js
export const formStyles = {
    container: {
      flex: 1, minHeight: 0, 
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
      display: 'flex', flexDirection: 'column', position: 'relative',
      overflow: 'hidden',
    },
    headerTitle: {
      color: '#374151',
      fontWeight: 700,
      fontSize: '15px',
      flex: 1,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
    },
    strip: {
      background: '#f4f6fb',
      padding: '8px 16px',
      fontSize: '12px',
      display: 'flex',
      gap: '10px',
      alignItems: 'center',
      flexWrap: 'wrap',
      flexShrink: 0,
      position: 'relative',
    },
    btnReset: (COLOR) => ({
      background: 'none', border: 'none', color: COLOR.danger,
      fontSize: '11px', cursor: 'pointer', fontWeight: 600, padding: 0,
    }),
    inputWrapper: { position: 'relative', flex: 1, minWidth: '200px', maxWidth: '360px' },
    dropdown: (COLOR, RADIUS) => ({
      position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
      background: COLOR.surface, border: `1px solid ${COLOR.border}`,
      borderRadius: RADIUS.md, boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
      maxHeight: '220px', overflowY: 'auto', zIndex: 200,
    }),
    badgeWrapper: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      background: 'rgba(255,255,255,0.18)',
      border: '1px solid rgba(255,255,255,0.3)',
      borderRadius: '3px',
      padding: '2px 8px 2px 10px',
    },
    badgeLabel: {
      fontSize: '10px',
      fontWeight: 600,
      color: '#374151',
      textTransform: 'uppercase',
      letterSpacing: '0.4px',
      whiteSpace: 'nowrap',
    },
    mainBody: { flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 },
    leftColumn: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
    searchBarContainer: (COLOR) => ({
      padding: '12px 14px', background: COLOR.surface, borderBottom: `1px solid ${COLOR.border}`,
      display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0,
    }),
    searchIcon: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '15px', pointerEvents: 'none' },
    btnClearSearch: {
      position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
      background: 'none', border: 'none', cursor: 'pointer',
      fontSize: '16px', padding: '2px',
    },
    iconButton: (bg, RADIUS) => ({
      background: bg, border: 'none', color: '#fff',
      borderRadius: RADIUS?.md ?? '4px', // Mencegah error jika RADIUS tidak ada
      padding: '10px 14px', cursor: 'pointer',
      lineHeight: 1, flexShrink: 0, WebkitTapHighlightColor: 'transparent',
    }),
    dropdownItem: { padding: '8px 12px', fontSize: '12px', cursor: 'pointer' },
    readOnlyBanner: {
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#fef3c7', color: '#92400e', fontSize: '12px',
      padding: '8px 14px', textAlign: 'center', zIndex: 150,
    }
  };