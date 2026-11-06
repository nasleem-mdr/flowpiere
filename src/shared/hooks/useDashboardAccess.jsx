import { useMemo } from 'react';
import useSubordinates from './useSubordinates';

/**
 * useDashboardAccess
 * Menentukan filter CreatedBy berdasarkan hierarki:
 *   - Punya subordinate → lihat dokumen sendiri + semua bawahan
 *   - Tidak punya subordinate → lihat dokumen sendiri saja
 *
 * Returns:
 *   createdByList: number[]  → list ID untuk filter (termasuk diri sendiri)
 *   isSupervisor:  boolean
 *   subordinates:  number[]
 *   loadingSubs:   boolean
 */
export default function useDashboardAccess() {
  const currentUserId               = Number(localStorage.getItem('AD_User_ID'));
  const { subordinates, loadingSubs } = useSubordinates();

  const isSupervisor = subordinates.length > 0;

  // Selalu include diri sendiri + bawahan langsung
  const createdByList = useMemo(() => {
    return [currentUserId, ...subordinates].filter(Boolean);
  }, [currentUserId, subordinates]);

  return { createdByList, isSupervisor, subordinates, loadingSubs };
}