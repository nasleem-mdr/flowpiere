/**  ─────────────────────────────────────────────────────────────────────────────
* PaymentVendorContainer.jsx
* Bayar ke Vendor (AP Payment) — langsung terfilter: partner IsVendor,
* invoice Purchase (isSOTrx=false), C_Payment IsReceipt=false.
* ─────────────────────────────────────────────────────────────────────────────
*/
import React from 'react';
import PartnerPaymentForm from '@/features/banking/payment/components/PartnerPaymentForm';

const PaymentVendorContainer = () => <PartnerPaymentForm isReceipt={false} />;

export default PaymentVendorContainer;
