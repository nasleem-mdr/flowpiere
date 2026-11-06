import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom"; 

//purchasing
import { 
  PurchasingContainer, 
  PurchasingList, 
  PurchasingView,
} from "@/features/purchasing/order/pages";

import PurchaseOrderDetailReport from "@/features/purchasing/report/pages/PurchaseOrderDetailReport";
import VendorInvoiceContainer from "@/features/purchasing/invoice/pages/VendorInvoiceContainer";
import VendorInvoiceList from "./features/purchasing/invoice/pages/VendorInvoiceList";

// Material Management
import RequisitionContainer from '@/features/requisition/pages/RequisitionContainer';
import RequisitionView from "@/features/requisition/pages/RequisitionView";
import RequisitionList from "@/features/requisition/pages/RequisitionList";
import GoodsReceiptContainer from '@/features/material/receipt/pages/GoodsReceiptContainer';
import GoodsReceiptList from "@/features/material/receipt/pages/GoodsReceiptList";
import InternalUseContainer from '@/features/material/internaluse/pages/InternalUseContainer';
import InternalUseList from "@/features/material/internaluse/pages/InternalUseList";
import ProductList from "@/features/master/product/pages/ProductList";
import ProductDetail from "@/features/master/product/pages/ProductDetail";
import ProductImport from "@/features/master/product/pages/ProductImport";
import InvoiceImport from "@/features/sales/invoice/pages/InvoiceImport";
import ShipmentContainer from "@/features/material/shipment/pages/ShipmentContainer"
import ShipmentList from "@/features/material/shipment/pages/ShipmentList"

// Sales Management
import POSContainer from "@/features/sales/order/pages/POSContainer"; 
import SalesOrderContainer from "@/features/sales/order/pages/SalesOrderContainer"; 
import SalesInvoiceContainer from "@/features/sales/invoice/pages/SalesInvoiceContainer";
import POSOrderList from "@/features/sales/order/pages/POSOrderList";
import SalesInvoiceList from "@/features/sales/invoice/pages/SalesInvoiceList";
import SalesOrderDetailReport from "@/features/sales/order/pages/SalesOrderDetailReport";
import OutstandingInvoiceReport from "@/features/sales/invoice/pages/OutstandingInvoiceReport";

//import BookingTimeline from '@/features/login/pages/BookingTimeline';

// Partner management
import BusinessPartner from "@/features/master/partner/pages/BusinessPartner"; 
import BusinessPartnerDetail from "@/features/master/partner/pages/BusinessPartnerDetail";
import { AccessProvider } from '@/context/AccessContext';
import UserManagement from "@/features/master/user/pages/UserManagement";
import RoleManagement from "@/features/master/user/pages/RoleManagement";

// Banking
import BankStatementContainer  from '@/features/banking/statement/pages/BankStatementContainer';
import BankStatementList  from '@/features/banking/statement/pages/BankStatementList';
import BankTransferList  from '@/features/banking/transfer/pages/BankTransferList';
//import PaymentReceiptContainer  from '@/features/banking/payment/pages/PaymentReceiptContainer'; form ini dipisah menjadi 2 
import ReceiptCustomerContainer  from '@/features/banking/payment/pages/ReceiptCustomerContainer';
import PaymentVendorContainer  from '@/features/banking/payment/pages/PaymentVendorContainer';

import ProtectedRoute from '@/shared/components/ProtectedRoute';
import IDempiereAuth from "@/features/login/pages/IDempiereAuth";

import Dashboard from "@/features/dashboard/pages/Dashboard";
import DashboardMenu from '@/features/dashboard/pages/DashboardMenu';
import DashboardStats from "@/features/dashboard/pages/DashboardStats";

import { Header, Sidebar } from "@/shared/components/setup"; 

import '@/css/AppLayout.css'; 
import InventoryStockReport from "@/features/material/inventory/pages/InventoryStockReport";
import WorkflowApprovalContainer from "@/features/workflow/pages/WorkflowApprovalContainer";
//import ShipmentCustomerReport from "@/features/sales/shipment/pages/ShipmentCustomerReport";

//Reporting multi features
import FinancialReportPage from '@/features/reporting/financial/pages/FinancialReportPage';
import FinancialComparisonPage from '@/features/reporting/financial/pages/FinancialComparisonPage';
import MonthlyTrendReport from '@/features/reporting/financial/pages/MonthlyTrendReport';
import GeneralLedgerReport from "@/features/reporting/financial/pages/GeneralLedgerReport";
import ProcurementTraceReport from "@/features/reporting/procurement/pages/ProcurementTraceReport";
import ProductAnalysisContainer from "@/features/reporting/product-analysis/pages/ProductAnalysisContainer";
import CashierClosingContainer from "./features/banking/cashier/pages/CashierClosingContainer";

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

function AppContent() {
  const [session, setSession] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const navigate = useNavigate();

  function handleLoginSuccess(sessionInfo) {
    setSession(sessionInfo);
  }

  function handleLogout() {
    setSession(null);
    localStorage.removeItem("token");
  }

  useEffect(() => {
    const handleSessionExpired = () => {
      localStorage.removeItem('token');
      setSession(null); 
      navigate('/', { replace: true });
    };

    window.addEventListener('session-expired', handleSessionExpired);
    return () => window.removeEventListener('session-expired', handleSessionExpired);
  }, [navigate]);

  return (
    <Routes>
      {/* ===== ROUTE PUBLIK ===== */}
      <Route path="/view/requisition/:uuid" element={<RequisitionView />} />
      <Route path="/view/order/:uuid" element={<PurchasingView />} />

      {/* ===== ROUTE YANG BUTUH SESSION ===== */}
      <Route
        path="*"
        element={
          !session ? (
            // Belum login - tampilkan auth
            <Routes>
              <Route path="/" element={<IDempiereAuth onLoginSuccess={handleLoginSuccess} />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          ) : (
            // Sudah login - Bungkus SELURUH layout (Sidebar, Header, Main) dengan AccessProvider
            <AccessProvider>
              <div className={`app-layout ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
                <Sidebar isCollapsed={isSidebarCollapsed} setIsCollapsed={setIsSidebarCollapsed} />
                <div className="main-wrapper">
                  <Header
                    session={session}
                    onLogout={handleLogout}
                    onSessionUpdate={(updated) => setSession((prev) => ({ ...prev, ...updated }))}
                  />

                  <main className="content">
                    <Routes>
                      <Route path="/" element={<Navigate to="/dashboard-stats" replace />} />
                      <Route path="/dashboard-stats" element={<DashboardStats session={session} />} />
                      <Route path="/dashboard" element={<Dashboard session={session} />} />
                      <Route path="/dashboard-menu" element={<DashboardMenu session={session} />} />
                      
                      {/* ===== Master ===== */}
                      <Route path="/business-partner" element={
                        <ProtectedRoute windowKey="businessPartner">
                          <BusinessPartner />
                        </ProtectedRoute>
                      } />
                      <Route path="/business-partner/new" element={
                        <ProtectedRoute windowKey="businessPartner">
                          <BusinessPartnerDetail />
                        </ProtectedRoute>
                      } />
                      <Route path="/business-partner/:id" element={
                        <ProtectedRoute windowKey="businessPartner">
                          <BusinessPartnerDetail />
                        </ProtectedRoute>
                      } />
                                                  
                      <Route path="/product" element={
                        <ProtectedRoute windowKey="product">
                          <ProductList />
                        </ProtectedRoute>
                      } />
                      
                      <Route path="/user-management" element={
                        <ProtectedRoute windowKey="userManagement"><UserManagement /></ProtectedRoute>
                      } />
                      <Route path="/product-detail/new" element={
                        <ProtectedRoute windowKey="productDetail">
                          <ProductDetail />
                        </ProtectedRoute>
                      } />
                      <Route path="/product-detail/edit/:id" element={
                        <ProtectedRoute windowKey="productDetail">
                          <ProductDetail />
                        </ProtectedRoute>
                      } />
                      <Route path="/product-import" element={
                        <ProtectedRoute windowKey="productImport">
                          <ProductImport />
                        </ProtectedRoute>
                      } />
                      <Route path="/sales-import" element={
                        <ProtectedRoute windowKey="salesImport">
                          <InvoiceImport />
                        </ProtectedRoute>
                      } />
                      <Route path="/purchase-order-detail" element={
                        <ProtectedRoute windowKey="purchaseOrderDetail">
                          <PurchaseOrderDetailReport />
                        </ProtectedRoute>
                      } />
                      {/* ===== Transaksi ===== */}
                      <Route path="/pos-order" element={
                        <ProtectedRoute windowKey="posOrder">
                          <POSContainer />
                        </ProtectedRoute>
                      } />                        
                      <Route path="/requisition" element={
                        <ProtectedRoute windowKey="requisition">
                          <RequisitionContainer />
                        </ProtectedRoute>
                      } />

                      <Route path="/cashier-closing" element={
                        <ProtectedRoute windowKey="cashierClosing">
                          <CashierClosingContainer />
                        </ProtectedRoute>
                      } />

                      <Route  path= "/inventory-report" element={
                        <ProtectedRoute windowKey="inventoryReport">
                          <InventoryStockReport /> 
                        </ProtectedRoute> 
                      } />

                      <Route path="/purchasing" element={
                        <ProtectedRoute windowKey="purchasing">
                          <PurchasingContainer />
                        </ProtectedRoute>
                      } />
                      <Route path="/goods-receipt" element={
                        <ProtectedRoute windowKey="goodsReceipt">
                          <GoodsReceiptContainer />
                        </ProtectedRoute>
                      } />
                      <Route path="/internal-use" element={
                        <ProtectedRoute windowKey="internalUse">
                          <InternalUseContainer />
                        </ProtectedRoute>
                      } />
                      <Route path="/shipment-customer" element={
                        <ProtectedRoute windowKey="shipmentCustomer">
                          <ShipmentContainer />
                        </ProtectedRoute>
                      } />
                      <Route path="/shimpent-list" element={
                        <ProtectedRoute windowKey="shipmentList">
                          <ShipmentList />
                        </ProtectedRoute>
                      } />
                      {/* ===== List atau report ===== */}
                      <Route path="/requisition-list" element={
                        <ProtectedRoute windowKey="requisitionList">
                          <RequisitionList />
                        </ProtectedRoute>
                      } />
                      <Route path="/purchasing-list" element={
                        <ProtectedRoute windowKey="purchasingList">
                          <PurchasingList />
                        </ProtectedRoute>
                      } />

                      <Route path="/shipment-customer-report" element={
                        <ProtectedRoute windowKey="shipmentCustomerReport">
                          <ShipmentList />
                        </ProtectedRoute>
                      } />
                      <Route path="/role-management" element={
                        <ProtectedRoute windowKey="roleManagement">
                          <RoleManagement />
                        </ProtectedRoute>
                      } />
                      <Route path="/goodsreceipt-list" element={
                        <ProtectedRoute windowKey="goodsReceiptList">
                          <GoodsReceiptList />
                        </ProtectedRoute>
                      } />
                      <Route path="/internaluse-list" element={
                        <ProtectedRoute windowKey="internalUseList">
                          <InternalUseList />
                        </ProtectedRoute>
                      } />
                      <Route path="/posorder-list" element={
                        <ProtectedRoute windowKey="posOrderList">
                          <POSOrderList />
                        </ProtectedRoute>
                      } />
                      <Route path="/vendor-invoice" element={
                        <ProtectedRoute windowKey="vendorInvoice">
                          <VendorInvoiceContainer />
                        </ProtectedRoute>
                      } />
                      <Route path="/vendorinvoice-list" element={
                        <ProtectedRoute windowKey="vendorInvoiceList">
                          <VendorInvoiceList />
                        </ProtectedRoute>
                      } />
                      <Route path="/bank-statement" element={
                        <ProtectedRoute windowKey="bankStatement">
                          <BankStatementContainer />
                        </ProtectedRoute>
                      } />
                      <Route path="/bank-transfer" element={
                        <ProtectedRoute windowKey="bankTransfer">
                          <BankTransferList />
                        </ProtectedRoute>
                      } />
                      <Route path="/statement-list" element={
                        <ProtectedRoute windowKey="statementList">
                          <BankStatementList />
                        </ProtectedRoute>
                      } />
                      <Route path="/payment-vendor" element={
                        <ProtectedRoute windowKey="paymentVendor">
                          <PaymentVendorContainer />
                        </ProtectedRoute>
                      } />
                      <Route path="/receipt-customer" element={
                        <ProtectedRoute windowKey="receiptCustomer">
                          <ReceiptCustomerContainer />
                        </ProtectedRoute>
                      } />
                      
                      <Route path="/financial-report" element={
                        <ProtectedRoute windowKey="financialReport">
                          <FinancialReportPage token={session?.token} acctSchemaId={session?.acctSchemaId} />
                        </ProtectedRoute>
                      } />
                      <Route path="/financial-comparasion" element={
                        <ProtectedRoute windowKey="financialComparation">
                          <FinancialComparisonPage token={session?.token} acctSchemaId={session?.acctSchemaId} />
                        </ProtectedRoute>
                      } />
                      <Route path="/trend-report" element={
                        <ProtectedRoute windowKey="trendReport">
                          <MonthlyTrendReport token={session?.token} acctSchemaId={session?.acctSchemaId} />
                        </ProtectedRoute>
                      } />
                      <Route path="/general-ledger" element={
                        <ProtectedRoute windowKey="generalLedger">
                          <GeneralLedgerReport token={session?.token} acctSchemaId={session?.acctSchemaId} />
                        </ProtectedRoute>
                      } />
                      <Route path="/product-analysis" element={
                        <ProtectedRoute windowKey="productAnalysis">
                          <ProductAnalysisContainer />
                        </ProtectedRoute>
                      } />
                      <Route path="/workflow-approval" element={
                        <ProtectedRoute windowKey="workflowApproval">
                          <WorkflowApprovalContainer />
                        </ProtectedRoute>
                      } />
                      
                      <Route path="/procurement-trace" element={
                        <ProtectedRoute windowKey="procurementTrace">
                          <ProcurementTraceReport />
                        </ProtectedRoute>
                      } />
                      <Route path="/sales-order" element={
                        <ProtectedRoute windowKey="salesOrder">
                          <SalesOrderContainer />
                        </ProtectedRoute>
                      } />
                      <Route path="/sales-invoice" element={
                        <ProtectedRoute windowKey="salesInvoice">
                          <SalesInvoiceContainer />
                        </ProtectedRoute>
                      } />
                      <Route path="/salesinvoice-list" element={
                        <ProtectedRoute windowKey="salesInvoiceList">
                          <SalesInvoiceList />
                        </ProtectedRoute>
                      } />
                      <Route path="/outstanding-invoice" element={
                        <ProtectedRoute windowKey="outstandingInvoice">
                          <OutstandingInvoiceReport />
                        </ProtectedRoute>
                      } />
                      <Route path="/salesorder-detailreport" element={
                        <ProtectedRoute windowKey="salesOrderDetailReport">
                          <SalesOrderDetailReport />
                        </ProtectedRoute>
                      } />
                    </Routes>
                  </main>
                </div>
              </div>
            </AccessProvider>
          )
        }
      />
    </Routes>
  );
}