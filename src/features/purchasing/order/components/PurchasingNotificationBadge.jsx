// src/features/purchasing/notification/components/PurchasingNotificationBadge.jsx
import { Link } from 'react-router-dom';
import usePurchasingNotification from '../hooks/usePurchasingNotification';

export default function PurchasingNotificationBadge({ to = '/purchasing' }) {
  const { enabled, count, requestPermission } = usePurchasingNotification();

  // Role tanpa akses ke window Purchasing: tidak tampil sama sekali
  if (!enabled) return null;

  return (
    <Link
      to={to}
      onClick={requestPermission} // izin notifikasi diminta saat user klik (butuh gesture)
      className="relative inline-flex items-center p-2"
      aria-label={`${count} FPB menunggu proses Purchasing`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
