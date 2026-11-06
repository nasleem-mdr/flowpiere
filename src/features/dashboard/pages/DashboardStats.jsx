import { Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { useDashboardAccess } from '@/features/dashboard/hooks/useDashboardAccess';

export default function DashboardStats() {
  const { widgets, loading } = useDashboardAccess();

  if (loading) return <div className="h-40 animate-pulse rounded bg-gray-100" />;
  if (widgets.length === 0) return <Navigate to="/dashboard" replace />;

  return (
    <div >
      {widgets.map(({ key, component: Widget }) => (
        <Suspense key={key} fallback={<div className="h-40 animate-pulse rounded bg-gray-100" />}>
          <Widget />
        </Suspense>
      ))}
    </div>
  );
}