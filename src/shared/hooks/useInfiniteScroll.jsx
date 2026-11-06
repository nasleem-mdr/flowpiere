import { useEffect, useRef, useCallback, useState } from 'react';

export function useInfiniteScroll({ fetchMore, hasMore, loading, rootMargin = '300px', rootRef = null }) {
  const sentinelRef = useRef(null);
  const observerRef = useRef(null);
  const [rootNode, setRootNode] = useState(null);

  // sinkronkan rootNode setelah commit, bukan saat render
  useEffect(() => {
    setRootNode(rootRef ? rootRef.current : null);
  }); // tanpa deps → cek tiap render, murah karena cuma setState kalau berubah (bisa dioptimasi dgn perbandingan)

  const handleIntersect = useCallback((entries) => {
    const [entry] = entries;
    if (entry.isIntersecting && hasMore && !loading) {
      fetchMore();
    }
  }, [fetchMore, hasMore, loading]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(handleIntersect, {
      root: rootNode ?? null,
      rootMargin,
      threshold: 0,
    });

    const node = sentinelRef.current;
    if (node) observerRef.current.observe(node);

    return () => observerRef.current?.disconnect();
  }, [handleIntersect, rootMargin, rootNode]);

  return sentinelRef;
}