// src/shared/hooks/useIsMobile.js
// true saat lebar layar < 768px. Dipakai halaman daftar untuk berpindah dari tabel ke kartu.
import { useState, useEffect } from 'react';

export const MOBILE_QUERY = '(max-width: 767px)';

export function useIsMobile(query = MOBILE_QUERY) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return isMobile;
}

export default useIsMobile;