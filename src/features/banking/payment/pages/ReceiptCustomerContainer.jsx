/**  ─────────────────────────────────────────────────────────────────────────────
* ReceiptCustomerContainer.jsx
* Terima Pembayaran Customer (AR Receipt) — langsung terfilter: partner
* IsCustomer, invoice Sales (isSOTrx=true), C_Payment IsReceipt=true.
* ─────────────────────────────────────────────────────────────────────────────
*/
import React from 'react';
import PartnerPaymentForm from '@/features/banking/payment/components/PartnerPaymentForm';

const ReceiptCustomerContainer = () => <PartnerPaymentForm isReceipt={true} />;

export default ReceiptCustomerContainer;
