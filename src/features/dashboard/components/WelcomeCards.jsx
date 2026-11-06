import { Link } from 'react-router-dom';
import { ShoppingCartIcon, DeliveryIcon, RequisitionIcon, UserTake, VendorIcon, CashierIcon, BankIcon, ImportIcon } from '@/shared/components/icon';
import { MdOutlinePayments } from "react-icons/md";
import { SiGoogleanalytics } from "react-icons/si";
import { useAccess } from '@/context/AccessContext';
import useGenericStats from '@/shared/hooks/useGenericStats';
import useDashboardAccess from '@/shared/hooks/useDashboardAccess';
import { ShoppingBagIcon } from '@/shared/components/icon/ShoppingBagIcon';

import '@/css/WelcomeCards.css';
import { SafeBoxIcon } from '../../../shared/components/icon';

// windowKey HARUS sama dengan yang di menuConfig.jsx
// featured: true -> kartu besar berwarna (baris atas) yang menampilkan statistik bulan ini
// stats          -> konfigurasi useGenericStats untuk kartu tersebut
const CARDS = [
  // ── Baris atas: alur utama + statistik ──────────────────────────────────
  {
    windowKey: 'requisition', to: '/requisition', icon: <RequisitionIcon size={40} />,
    label: 'Requisition', featured: true, tone: 'indigo',
    stats: { model: 'm_requisition', dateField: 'DateDoc', totalField: 'TotalLines' },
  },
  {
    windowKey: 'purchasing', to: '/purchasing', icon: <ShoppingCartIcon size={38} />,
    label: 'Purchase Order', featured: true, tone: 'amber',
    stats: { model: 'c_order', dateField: 'DateOrdered', totalField: 'GrandTotal', baseFilter: 'IsSOTrx eq false' },
  },
  {
    // TODO: tambahkan filter doc type POS jika perlu, mis. "IsSOTrx eq true and C_DocTypeTarget_ID eq 123"
    windowKey: 'posOrder', to: '/pos-order', icon: <CashierIcon size={38} />,
    label: 'POS Sales', featured: true, tone: 'pink',
    stats: { model: 'c_order', dateField: 'DateOrdered', totalField: 'GrandTotal', baseFilter: 'IsSOTrx eq true' },
  },
  {
    // TODO: sesuaikan model/dateField dengan tabel Goods Receipt Anda
    windowKey: 'cashierClosing', to: '/cashier-closing', icon: <SafeBoxIcon size={42} />,
    label: 'Cashier Close', featured: true, tone: 'blue',
    stats: { model: 'c_bankstatement', dateField: 'StatementDate', totalField: 'EndingBalance', baseFilter: 'IsActive eq true' },
  },
  
  // ── Grid menu procurement ───────────────────────────────────────────────────
  { windowKey: 'requisition',    to: '/requisition',     icon: <RequisitionIcon size={30} />,   label: 'Purchase Requisition' },
  { windowKey: 'purchasing',     to: '/purchasing',      icon: <ShoppingCartIcon size={30} />,  label: 'Purchase Order' },
  { windowKey: 'goodsReceipt',   to: '/goods-receipt',   icon: <DeliveryIcon size={30} />,      label: 'Goods Receipt' },
  { windowKey: 'vendorInvoice',  to: '/vendor-invoice',  icon: <VendorIcon size={30} />,        label: 'Purchase Invoice' },
  { windowKey: 'paymentVendor',  to: '/payment-vendor',  icon: <MdOutlinePayments size={30} />, label: 'Payment to Vendor' },
  { windowKey: 'internalUse',    to: '/internal-use',    icon: <UserTake size={30} />,          label: 'Internal Use' },
  
  // ── Grid menu marketing ───────────────────────────────────────────────────
  { windowKey: 'salesOrder',     to: '/sales-order',     icon: <ShoppingBagIcon size={24}/>,    label: 'Sales Order'},
  { windowKey: 'shipmentCustomer',     to: '/shipment-customer',     icon: <DeliveryIcon size={30}/>,    label: 'Delivery Order'},
  { windowKey: 'salesInvoice',   to: '/sales-invoice',   icon: <ImportIcon size={30} />,        label: 'Sales Invoice' },
  { windowKey: 'receiptCustomer', to: '/receipt-customer',icon: <MdOutlinePayments size={30} />, label: 'Payment by Customer' },
  { windowKey: 'cashierClosing', to: '/cashier-closing', icon: <UserTake size={30} />,          label: 'Cashier Closing' },
  { windowKey: 'bankStatement',  to: '/bank-statement',  icon: <BankIcon size={30} />,          label: 'Bank Statement' },
];

// Angka Completed / In Progress bulan ini.
// Komponen terpisah supaya hook hanya jalan untuk menu yang boleh diakses.
function TileStats({ config, createdByList, loadingSubs }) {
  const { stats, loading } = useGenericStats({
    ...config,
    statusField:     'DocStatus',
    compareStatuses: ['CO', 'IP'],
    monthRange:      1,
    createdByList:   loadingSubs ? null : createdByList,
  });

  const busy = loading || loadingSubs;
  const co = busy ? '…' : (stats?.comparison?.CO?.count ?? 0);
  const ip = busy ? '…' : (stats?.comparison?.IP?.count ?? 0);

  return (
    <span className="wc-stats" title="Bulan ini">
      <span className="wc-stat"><b>{co}</b><small>Selesai</small></span>
      <span className="wc-stat"><b>{ip}</b><small>Proses</small></span>
    </span>
  );
}

function Tile({ card, allowed, loading, access }) {
  const { to, icon, label, featured, tone, stats } = card;

  const cls = [
    'wc-tile',
    featured ? `wc-tile--featured wc-tone-${tone}` : 'wc-tile--plain',
    !allowed && 'wc-tile--disabled',
  ].filter(Boolean).join(' ');

  const inner = (
    <>
      <span className="wc-icon">{icon}</span>
      {featured ? (
        <span className="wc-footer">
          <span className="wc-label">{label}</span>
          {allowed && stats && <TileStats config={stats} {...access} />}
        </span>
      ) : (
        <span className="wc-label">{label}</span>
      )}
    </>
  );

  if (allowed) {
    return <Link to={to} className={cls}>{inner}</Link>;
  }

  return (
    <div
      className={cls}
      aria-disabled="true"
      title={loading ? 'Memuat hak akses...' : 'Anda tidak memiliki akses ke menu ini'}
    >
      {inner}
    </div>
  );
}

export default function WelcomeCards({ session }) {
  const { canView, loading } = useAccess();
  const { createdByList, loadingSubs } = useDashboardAccess();
  const access = { createdByList, loadingSubs };

  const renderGroup = (cards) =>
    cards.map((card) => (
      <Tile
        key={card.windowKey}
        card={card}
        loading={loading}
        access={access}
        allowed={!loading && canView(card.windowKey)}
      />
    ));

  const featured = CARDS.filter((c) => c.featured);
  const others = CARDS.filter((c) => !c.featured);

  return (
    <section className="wc-root">
      <div className="wc-featured">{renderGroup(featured)}</div>
      <div className="wc-grid">{renderGroup(others)}</div>
    </section>
  );
}