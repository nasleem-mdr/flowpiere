import { idempiereApi } from '@/api/idempiereApi';

/** ───────────────────────────────────────────────────────────────────────────
*docStatusWaiter.js
*Poll DocStatus sampai final (CO/CL) atau gagal permanen, atau timeout.
*Dipakai di useCashPurchaseSubmit, useSalesOrderSubmit, useSalesShipmentSubmit.
*
*Perubahan: hasil timeout sekarang membawa `lastStatus` (DocStatus terakhir
*yang terbaca) dan `timedOut: true`, supaya pemanggil bisa membedakan
*"masih IP menunggu approval workflow" dari "benar-benar tidak merespons".
*`status: 'timeout'` dipertahankan agar pemanggil lama tidak rusak.
*Error 401 dari idempiereApi sengaja tidak ditelan — langsung dilempar.
*─────────────────────────────────────────────────────────────────────────────
*/
const SUCCESS_STATUSES = ['CO', 'CL'];             // final, boleh lanjut
const FAILURE_STATUSES = ['VO', 'RE', 'IN', 'NA']; // final/gagal — NA = ditolak approver

export async function waitForDocStatus(model, recordId, { timeoutMs = 20000, intervalMs = 700 } = {}) {
    const startedAt = Date.now();
    let lastStatus = null;
    let documentNo;

    while (Date.now() - startedAt < timeoutMs) {
        const rec = await idempiereApi(
            `/models/${model}/${recordId}?$select=DocStatus,DocumentNo`
        );
        lastStatus = rec?.DocStatus?.id ?? rec?.DocStatus ?? null;
        documentNo = rec?.DocumentNo;

        if (SUCCESS_STATUSES.includes(lastStatus)) {
            return { success: true, status: lastStatus, documentNo };
        }
        if (FAILURE_STATUSES.includes(lastStatus)) {
            return { success: false, status: lastStatus, documentNo };
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return {
        success: false,
        status: 'timeout',
        timedOut: true,
        lastStatus,                       // 'IP' = kemungkinan besar menunggu approval workflow
        awaitingApproval: lastStatus === 'IP',
        documentNo,
    };
}