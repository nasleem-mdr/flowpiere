import { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// useIsDesktop.js
// Deteksi viewport desktop (>= 768px) vs mobile, pakai matchMedia (reaktif
// terhadap resize/orientation change, beda dengan window.innerWidth statis).
// Breakpoint 768px = umum dipakai untuk batas tablet/desktop.
//
// Penggunaan:
//   const isDesktop = useIsDesktop();
//   {isDesktop ? <CartSidebar /> : <CartPanel />}
// ─────────────────────────────────────────────────────────────────────────────
const BREAKPOINT_DESKTOP = '(min-width: 768px)';

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(BREAKPOINT_DESKTOP).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(BREAKPOINT_DESKTOP);
    const handler = (e) => setIsDesktop(e.matches);

    // addEventListener tersedia di browser modern; fallback addListener untuk Safari lama
    if (mql.addEventListener) mql.addEventListener('change', handler);
    else mql.addListener(handler);

    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', handler);
      else mql.removeListener(handler);
    };
  }, []);

  return isDesktop;
}
