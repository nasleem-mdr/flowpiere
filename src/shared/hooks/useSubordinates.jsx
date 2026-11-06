import { useState, useEffect, useCallback } from 'react';
import { idempiereApi } from '@/api/idempiereApi';
// const API_BASE = '/api/v1';

/**
 * useSubordinates
 * Fetch daftar AD_User_ID yang Supervisor_ID-nya = currentUserId.
 * Kalau user bukan atasan siapapun → subordinates = [] (lihat dokumen sendiri saja)
 */
export default function useSubordinates() {
  const [subordinates, setSubordinates] = useState([]); // array of AD_User_ID
  const [loadingSubs,  setLoadingSubs]  = useState(true);

  // const customFetch = useCallback(async (url) => {
  //   const token = localStorage.getItem('token');
  //   const res   = await fetch(`${API_BASE}${url}`, {
  //     headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  //   });
  //   if (!res.ok) throw new Error(`[${res.status}] ${url}`);
  //   return res.json();
  // }, []);

  useEffect(() => {
    const load = async () => {
      setLoadingSubs(true);
      try {
        const currentUserId = localStorage.getItem('AD_User_ID');
        if (!currentUserId) return;

        const res     = await idempiereApi(`/models/ad_user?$filter=Supervisor_ID eq ${currentUserId} and IsActive eq true&$select=AD_User_ID,Name`);
        const records = Array.isArray(res.records) ? res.records : [];

        const ids = records.map(u => u.id ?? u.AD_User_ID?.id ?? u.AD_User_ID).filter(Boolean);
        setSubordinates(ids);
      } catch (err) {
        console.error('useSubordinates error:', err.message);
        setSubordinates([]);
      } finally {
        setLoadingSubs(false);
      }
    };
    load();
  }, [idempiereApi]);

  return { subordinates, loadingSubs };
}