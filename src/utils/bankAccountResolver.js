import { idempiereApi } from '@/api/idempiereApi';

// ─────────────────────────────────────────────────────────────────────────────
// bankAccountResolver.js
// Diekstrak dari usePOSPaymentSubmit.jsx supaya tidak duplikat dengan
// useAPPaymentSubmit.jsx (pola sama seperti docTypeResolver.jsx: 1 sumber
// kebenaran, dipakai bersama oleh AR Receipt maupun AP Payment).
//
// Dipakai sebagai FALLBACK saja — kalau user sudah pilih bank account
// secara eksplisit di modal (PaymentModal / PurchasePaymentModal), nilai
// pilihan user itu yang harus menang. Fungsi ini baru dipanggil kalau
// caller tidak mengirim bankAccountId (mis. skenario mixed-payment).
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchDefaultBankAccount(orgId, currencyId) {
    const tryFetch = async (filter) => {
        const res = await idempiereApi(
            `/models/c_bankaccount?$filter=${filter}&$select=C_BankAccount_ID&$top=1`
        );
        const rec = res?.records?.[0];
        return rec?.id ?? rec?.C_BankAccount_ID ?? null;
    };

    // 1) Coba spesifik ke Org + Currency yang diminta
    let id = await tryFetch(
        `AD_Org_ID eq ${orgId} and C_Currency_ID eq ${currencyId} and IsActive eq true`
    );
    // 2) Fallback ke Org 0 (shared/HQ) — pola umum di iDempiere untuk Bank Account
    if (!id) {
        id = await tryFetch(
            `AD_Org_ID eq 0 and C_Currency_ID eq ${currencyId} and IsActive eq true`
        );
    }
    if (!id) {
        throw new Error(
            `Tidak ada C_BankAccount aktif untuk Org ${orgId} / Currency ${currencyId}. ` +
            `Setup Bank Account di window "Bank Account" dulu.`
        );
    }
    return id;
}
