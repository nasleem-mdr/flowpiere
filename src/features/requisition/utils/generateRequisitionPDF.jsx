import { renderDocumentPDF } from '@/utils/pdf/renderDocumentPDF';
import { cleanIdentifier } from '@/utils/pdf/formatIdentifier';
import { idempiereApi } from '@/api/idempiereApi';
// ─────────────────────────────────────────────────────────────────────────────
// generateRequisitionPDF.js
// Wrapper tipis: fetch data spesifik Requisition (header + lines + histori
// workflow), lalu delegasikan seluruh rendering PDF ke renderDocumentPDF
// (utilitas generic yang sama dipakai PO/PI/SI). TIDAK membangun jsPDF/
// autoTable manual di sini — supaya perbaikan di renderDocumentPDF (mis.
// fallback logo) otomatis berlaku di sini juga, tanpa duplikasi kode.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_MAP = {
  DR: "Draft",
  IP: "Dalam Proses Approval",
  CO: "Selesai / Disetujui",
  CL: "Ditutup",
  VO: "Dibatalkan",
  RE: "Ditolak",
};

// TODO: pindahkan ke env var / config kalau base URL verifikasi berbeda
// antara environment dev/staging/production.
const VERIFY_BASE_URL = "https://192.168.0.126:8432/view/requisition";

/**
 * @param {number} requisitionId
 * @param {string} documentNo
 * @param {string} token          - Bearer token untuk fetch API
 * @param {string} [logoDataUrl]  - mis. dari useOrgInfo().orgInfo?.logoUrl
 */
export async function generateRequisitionPDF(requisitionId, documentNo, orgInfo) {
  // 1. Header
  const header = await idempiereApi(
    `/models/m_requisition/${requisitionId}` +
    `?$select=DocumentNo,DateDoc,Description,DocStatus,AD_Org_ID,CreatedBy,M_Warehouse_ID,M_Requisition_UU`
  );

  // 2. Lines
  const linesRes = await idempiereApi(
    `/models/m_requisitionline` +
    `?$filter=M_Requisition_ID eq ${requisitionId}` +
    `&$select=Line,M_Product_ID,Qty,QtyEntered,C_UOM_ID,Description` +
    `&$orderby=Line`
  );
  const lines = linesRes.records || [];

  // 3. Workflow history (AD_Table_ID 702 = M_Requisition)
  const historyRes = await idempiereApi(
    `/models/ad_wf_eventaudit` +
    `?$filter=AD_Table_ID eq 702 and Record_ID eq ${requisitionId}` +
    `&$select=AD_WF_Node_ID,AD_User_ID,Updated` +
    `&$orderby=Updated asc`
  );
  const history = (historyRes.records || [])
    .filter((h) => {
      const nodeName = (h.AD_WF_Node_ID?.identifier || "").toLowerCase();
      return nodeName !== "(start)" &&
        nodeName !== "(docauto)" &&
        nodeName !== "(completedocument)";
    })
    .map((h) => ({
      nodeName: h.AD_WF_Node_ID?.identifier || "-",
      userName: h.AD_User_ID?.identifier || "-",
      date:     h.Updated ? new Date(h.Updated).toLocaleDateString("id-ID") : "-",
    }));

  const statusCode = header.DocStatus?.id ?? header.DocStatus;

  // 4. Delegasikan seluruh rendering ke renderDocumentPDF — tidak ada
  // manipulasi jsPDF/autoTable/QR manual di sini sama sekali.
  await renderDocumentPDF({
    title:    "FORMULIR PERMINTAAN BARANG (FPB)",
    subtitle: "Purchase Requisition - Dokumen ini sah dengan histori approval terlampir",
    orgInfo,
    infoLeft: [
      ["No. Dokumen",   ": " + header.DocumentNo],
      ["Pemohon",       ": " + (header.CreatedBy?.identifier || "-")],
      ["Gudang Tujuan", ": " + (header.M_Warehouse_ID?.identifier || "-")],
      ["Keterangan",    ": " + (header.Description || "-")],
    ],
    infoRight: [
      ["Tanggal",     ": " + new Date(header.DateDoc).toLocaleDateString("id-ID")],
      ["Departemen",  ": " + (header.AD_Org_ID?.identifier || "-")],
      ["Status",      ": " + (STATUS_MAP[statusCode] || statusCode)],
    ],
    table: {
      head: [["No", "Nama Barang", "Qty", "UOM", "Keterangan"]],
      body: lines.map((l, idx) => [
        idx + 1,
        cleanIdentifier(l.M_Product_ID?.identifier) || "-",
        l.QtyEntered,
        l.C_UOM_ID?.identifier || "-",
        l.Description || "",
      ]),
      columnStyles: {
        2: { halign: 'right' }, // No of Unit / QtyEntered
      },
    },
    history,
    verifyUrl:     `${VERIFY_BASE_URL}/${header.uid}`,
    verifyCaption: "Scan untuk verifikasi keaslian & status approval dokumen {documentNo}",
    filenamePrefix: "Requisition",
    documentNo,
  });
}
