import { 
    HomeIcon, 
    ImportIcon, 
    BankIcon, 
    VendorIcon,
    RoleIcon, 
    RequisitionIcon, 
    ShoppingCartIcon, 
    DeliveryIcon, 
    UserTake, 
    UserIcon, 
    PartnerIcon, 
    BoxIcon, 
    CashierIcon,
    TransferIcon, 
} from '@/shared/components/icon';

import { ShoppingBagIcon } from '@/shared/components/icon/ShoppingBagIcon';

import { 
    MdOutlinePayments, 
    MdOutlineStore, 
} from "react-icons/md";

import { SiGoogleanalytics } from "react-icons/si";

import { 
    PiCashRegister, 
    PiGitPullRequestBold, 
    PiPresentationChart, 
} from "react-icons/pi";

import { 
    LiaFileInvoiceDollarSolid, 
    LiaPeopleCarrySolid, 
} from "react-icons/lia";

import { BiPurchaseTagAlt } from "react-icons/bi";

import { TbCreditCardHand } from "react-icons/tb";
import { SafeBoxIcon } from '../shared/components/icon';

export const menuSections = [ 
    {
        sectionKey: 'procurement',
        sectionLabel: 'Procurement',
        defaultCollapsed: true,
        items: [
            { key: 'dashboard',     windowKey: 'dashboard',    path: '/dashboard',      label: 'Dashboard',     icon: <HomeIcon /> },
            { key: 'requisition',   windowKey: 'requisition',  path: '/requisition',    label: 'Requisition',   icon: <RequisitionIcon /> },
            { key: 'purchasing',    windowKey: 'purchasing',   path: '/purchasing',     label: 'Purchasing',    icon: <ShoppingCartIcon /> },
            { key: 'goodsReceipt',  windowKey: 'goodsReceipt', path: '/goods-receipt', label: 'Goods Receipt', icon: <DeliveryIcon /> },
            { key: 'internalUse',   windowKey: 'internalUse',  path: '/internal-use',  label: 'Internal Use',  icon: <UserTake /> },
            { key: 'vendorInvoice',   windowKey: 'vendorInvoice',  path: '/vendor-invoice',  label: 'Purchase Invoice',  icon: <VendorIcon /> },
            { key: 'paymentVendor',   windowKey: 'paymentVendor',  path: '/payment-vendor',  label: 'Payment Vendor',  icon: <MdOutlinePayments size={24} /> },
        ]
    },
    {
        sectionKey: 'sales',
        sectionLabel: 'Sales',
        defaultCollapsed: true,
        items: [
            { key: 'posOrder',     windowKey: 'posOrder',    path: '/pos-order',        label: 'Pos Sales',     icon: <CashierIcon size={20}/> },
            { key: 'salesOrder',     windowKey: 'salesOrder',    path: '/sales-order',        label: 'DO (Invoice Bulanan)',     icon: <ShoppingBagIcon size={24}/> },
            { key: 'shipmentCustomer',     windowKey: 'shipmentCustomer',    path: '/shipment-customer',        label: 'Shipment(Customer)',     icon: <DeliveryIcon /> },
            { key: 'salesInvoice',       windowKey: 'salesInvoice', path: '/sales-invoice',         label: 'Sales Invoice',  icon: <ImportIcon size={20}/> },    
            //{ key: 'salesImport',         windowKey: 'salesImport',         path: '/sales-import',          label: 'Invoice Import',        icon: <ImportIcon /> },
            { key: 'receiptCustomer',   windowKey: 'receiptCustomer',  path: '/receipt-customer',  label: 'Receipt Customer',  icon: <MdOutlinePayments size={24} /> },
        ]
    },
    {
        sectionKey: 'payment',
        sectionLabel: 'Payment/Receipt',
        defaultCollapsed: true,
        items: [
            //{ key: 'paymentReceipt',   windowKey: 'paymentReceipt',  path: '/payment-receipt',  label: 'Payment and Receipt',  icon: <MdOutlinePayments size={24} /> },
            { key: 'bankStatement',   windowKey: 'bankStatement',  path: '/bank-statement',  label: 'Bank/Cash Statement',  icon: <BankIcon /> },
            { key: 'bankTransfer',    windowKey: 'bankTransfer',   path: '/bank-transfer',   label: 'Bank Transfer',  icon: <TransferIcon /> },
            { key: 'cashierClosing',  windowKey: 'cashierClosing', path: '/cashier-closing', label: 'Cashier Closing',  icon: <SafeBoxIcon /> },
            ]
    },
    {
        sectionKey: 'reportpro',
        sectionLabel: 'Procurement Report',
        defaultCollapsed: true,
            items: [
            { key: 'requisition-list', windowKey: 'requisitionList', borderTop: true, path: '/requisition-list',  label: 'Requisition List',    icon: <PiGitPullRequestBold /> },
            { key: 'purchasing-list',  windowKey: 'purchasingList',  path: '/purchasing-list',   label: 'Purchasing List',     icon: <BiPurchaseTagAlt /> },
            { key: 'purchaseOrderDetail',  windowKey: 'purchaseOrderDetail',  path: '/purchase-order-detail',   label: 'Purchasing Order Detail',     icon: <BiPurchaseTagAlt /> },
            { key: 'goodsreceipt-list', windowKey: 'goodsReceiptList', path: '/goodsreceipt-list', label: 'Goods Receipt List', icon: <LiaPeopleCarrySolid /> },
            { key: 'internaluse-list', windowKey: 'internalUseList',  path: '/internaluse-list',  label: 'Internal Use List',   icon: <TbCreditCardHand /> },
            { key: 'vendorInvoiceList', windowKey: 'vendorInvoiceList',  path: '/vendorinvoice-list',  label: 'Vendor Invoice List',   icon: <MdOutlineStore /> },      
        ]
    },
    {
        sectionKey: 'reportsales',
        sectionLabel: 'Sales Report',
        defaultCollapsed: true,
            items: [
            { key: 'posOrderList', windowKey: 'posOrderList',  path: '/posorder-list',  label: 'POS Order List',   icon: <PiCashRegister /> },
            { key: 'salesOrderDetailReport', windowKey: 'salesOrderDetailReport',  path: '/salesorder-detailreport',  label: 'POS Order Detail List',   icon: <PiCashRegister /> },
            { key: 'shipmentCustomerReport', windowKey: 'shipmentCustomerReport', path: '/shipment-customer-report', label: 'Shipment (Customer) Report', icon: <LiaPeopleCarrySolid /> },
            { key: 'salesInvoiceList', windowKey: 'salesInvoiceList',  path: '/salesinvoice-list',  label: 'Sales Invoice List',   icon: <LiaFileInvoiceDollarSolid /> },
            { key: 'outstandingInvoice', windowKey: 'outstandingInvoice', path: '/outstanding-invoice', label: 'Outstanding Invoice', icon: <LiaFileInvoiceDollarSolid /> },
            { key: 'inventoryReport', windowKey: 'inventoryReport', path: '/inventory-report', label: 'Inventory Report', icon: <LiaFileInvoiceDollarSolid /> },
        ]
    },
    {
        sectionKey: 'linkreport',
        sectionLabel: 'All Report',
        defaultCollapsed: true,
            items: [
            { key: 'dashboardMenu', windowKey: 'dashboardMenu',  path: '/dashboard-menu',  label: 'Report Dashboard',   icon: <SiGoogleanalytics size={24} /> },
        ]
    },
    {
        sectionKey: 'financialreport',
        sectionLabel: 'Financial Report',
        defaultCollapsed: true,
            items: [
            { key: 'financialReport', windowKey: 'financialReport',  path: '/financial-report',  label: 'Financial Report',   icon: <PiPresentationChart /> },
            { key: 'generalLedger', windowKey: 'generalLedger',  path: '/general-ledger',  label: 'General Ledger',   icon: <PiPresentationChart /> },
            { key: 'statementList', windowKey: 'statementList',  path: '/statement-list',  label: 'Bank Statement',   icon: <PiPresentationChart /> },
            { key: 'procurementTrace', windowKey: 'procurementTrace',  path: '/procurement-trace',  label: 'Procurement Trace',   icon: <PiPresentationChart /> },
            { key: 'productAnalysis', windowKey: 'productAnalysis',  path: '/product-analysis',  label: 'Product Analysis',   icon: <PiPresentationChart /> },
            { key: 'trendReport', windowKey: 'trendReport',  path: '/trend-report',  label: 'Trend Report',   icon: <PiPresentationChart /> },
        ]
    },
    {
        sectionKey: 'master',
        sectionLabel: 'Master',
        defaultCollapsed: true,
        items: [
            { key: 'businessPartner', windowKey: 'businessPartner', path: '/business-partner', label: 'Business Partner', icon: <PartnerIcon /> },
            { key: 'product',         windowKey: 'product',         path: '/product',          label: 'Products',        icon: <BoxIcon /> },
            { key: 'productImport',         windowKey: 'productImport',         path: '/product-import',          label: 'Products Import',        icon: <ImportIcon /> },
            { key: 'userManagement', windowKey: 'userManagement', path: '/user-management', label: 'Manajemen User', icon: <UserIcon /> },
            { key: 'roleManagement', windowKey: 'roleManagement', path: '/role-management', label: 'Manajemen Role', icon: <RoleIcon /> }, 
        ]
    }
];

export function getMenuSections(sectionKeys) {
    if (!sectionKeys) return menuSections; 
    return menuSections.filter(s => sectionKeys.includes(s.sectionKey));
}
