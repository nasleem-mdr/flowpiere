// src/features/dashboard/hooks/useDashboardAccess.jsx
import { useMemo } from 'react';
import { useAccess } from '@/context/AccessContext';
import { dashboardWidgetMap } from '@/config/dashboardWidgetMap';
import { useDashboardPreset } from './useDashboardPresets';

export function useDashboardAccess() {
  const { preset, loading: presetLoading } = useDashboardPreset();
  const { canView, accessMap, loading: accessLoading } = useAccess();
  const busy = accessLoading || presetLoading;

  const widgets = useMemo(() => {
    if (busy || !accessMap) return [];
    return preset
      .map((key) => {
        const w = dashboardWidgetMap[key];
        if (!w) console.warn('[dashboard] widget tidak dikenal:', key);
        return w && { key, ...w };
      })
      .filter(Boolean)
      .filter((w) => canView(w.windowKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, accessMap, busy]);

  return { widgets, loading: busy };
}