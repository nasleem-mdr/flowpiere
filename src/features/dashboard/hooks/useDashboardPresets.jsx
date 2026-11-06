// src/features/dashboard/hooks/useDashboardPreset.js
import { useEffect, useState } from 'react';
import { idempiereApi } from '@/api/idempiereApi'; // helper GET Anda
import { getLoginInfo } from '@/shared/hooks/useLoginInfo';

const parse = (v) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function useDashboardPreset() {
  const { roleId } = getLoginInfo();
  const [state, setState] = useState({ preset: null, loading: true });

  useEffect(() => {
    let alive = true;
    setState({ preset: [], loading: true });          // reset saat role berganti
    (async () => {
      let preset = [];
      try {
        const res = await idempiereApi(`/models/ad_role/${roleId}`);
        if (res?.DashboardWidgets === undefined) {
          console.info('[dashboard] kolom DashboardWidgets tidak ada / kosong di instance ini');
        }
        preset = parse(res?.DashboardWidgets);
      } catch (e) {
        console.warn('[dashboard] gagal baca role:', e);
      }
      if (alive) setState({ preset, loading: false });
    })();
    return () => { alive = false; };
  }, [roleId]);

  return state;
}