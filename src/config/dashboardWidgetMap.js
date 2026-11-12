import { lazy } from 'react';

export const dashboardWidgetMap = {
  generalLedger   :        { windowKey: 'generalLegder', component: lazy(() => import('@/features/reporting/financial/pages/GeneralLedgerReport')) },
  procurementTrace:        { windowKey: 'procurementTrace',   component: lazy(() => import('@/features/reporting/procurement/pages/ProcurementTraceReport')) },
  trendReport     :        { windowKey: 'trendReport', component: lazy(() => import('@/features/reporting/financial/pages/MonthlyTrendReport')) },
  requisitionList:         { windowKey: 'requisitionList', component: lazy(() => import('@/features/requisition/pages/RequisitionList')) }, 
  posOrder:                { windowKey: 'posOrder', component: lazy(() => import('@/features/sales/order/pages/POSContainer')) }, 
  purchasingList:          { windowKey: 'purchasingList', component: lazy(() => import('@/features/purchasing/order/pages/PurchasingList'))},
  goodsReceiptList:        { windowKey: 'goodsReceiptList', component: lazy(() => import('@/features/material/receipt/pages/GoodsReceiptList')) },
  internalUseList:         { windowKey: 'internalUseList', component: lazy(() => import('@/features/material/internaluse/pages/InternalUseList')) },
  vendorInvoiceList:       { windowKey: 'vendorInvoiceList', component: lazy(() => import('@/features/purchasing/invoice/pages/VendorInvoiceList'))},
  salesInvoiceList:        { windowKey: 'salesInvoiceList', component: lazy(() => import('@/features/sales/invoice/pages/SalesInvoiceList')) } ,
  financialReport:         { windowKey: 'financielReport', component: lazy(() => import('@/features/reporting/financial/pages/FinancialReportPage'))},
  outstandingInvoice:      { windowKey: 'outstandingInvoice', component: lazy(() => import('@/features/sales/invoice/pages/OutstandingInvoiceReport')) },
  dashboardMenu:           { windowKey: 'dashboardMenu', component: lazy(() => import('@/features/dashboard/pages/DashboardMenu'))},
  productAnalysis:         { windowKey: 'productAnalysis', component: lazy(() => import('@/features/reporting/product-analysis/pages/ProductAnalysisContainer')) },
};