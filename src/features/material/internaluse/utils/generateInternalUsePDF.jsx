import { idempiereApi } from "@/api/idempiereApi";
import { renderDocumentPDF } from "@/utils/pdf/renderDocumentPDF";
import { cleanIdentifier } from "@/utils/pdf/formatIdentifier";

const M_INVENTORY_AD_TABLE_ID = 321;

const STATUS_MAP = {
    DR: "Draft",
    IP: "Dalam Proses Approval",
    CO: "Selesai / Disetujui",
    CL: "Ditutup",
    VO: "Dibatalkan",
    NA: "Ditolak",
};

const VERIFY_BASE_URL = "https://192.168.0.126:8432/view/internaluse";

const numberFormatter = new Intl.NumberFormat("en-US");

export async function generateInternalUsePDF(internaluseId, documentNo, orgInfo) {
    const header = await idempiereApi(
        `/models/m_inventory/${internaluseId}` +
        `?$select=DocumentNo,MovementDate,Description,DocStatus,AD_Org_ID,CreatedBy,M_Warehouse_ID,ApprovalAmt,M_Inventory_UU`
    );

    const linesRes = await idempiereApi(
        `/models/m_inventoryline` +
        `?$filter=M_Inventory_ID eq ${internaluseId}` +
        `&$select=Line,M_Product_ID,QtyInternalUse,Description` +
        `&$orderby=Line`
    );
    const lines = linesRes.records || [];

    const historyRes = await idempiereApi(
        `/models/ad_wf_eventaudit` +
        `?$filter=AD_Table_ID eq ${M_INVENTORY_AD_TABLE_ID} and Record_ID eq ${internaluseId}` +
        `&$select=AD_WF_Node_ID,AD_User_ID,Updated` +
        `&$orderby=Updated asc`
    );

    const history = (historyRes.records || [])
        .filter(
            (h) =>
                ![
                    "(start)",
                    "(docauto)",
                    "(completedocument)",
                ].includes((h.AD_WF_Node_ID?.identifier || "").toLowerCase())
        )
        .map((h) => ({
            nodeName: h.AD_WF_Node_ID?.identifier || "-",
            userName: h.AD_User_ID?.identifier || "-",
            date: h.Updated ? new Date(h.Updated).toLocaleDateString("id-ID") : "-",
        }));

    const statusCode = header.DocStatus?.id ?? header.DocStatus;

    await renderDocumentPDF({
        title: "FORMULIR PENGAMBILAN BARANG DI GUDANG",
        subtitle: "Pengambilan Barang - Dokumen ini sah dengan histori approval terlampir",
        orgInfo,
        infoLeft: [
            ["No. Dokumen", ": " + header.DocumentNo],
            ["Pemohon", ": " + (header.CreatedBy?.identifier || "-")],
            ["Gudang", ": " + (header.M_Warehouse_ID?.identifier || "-")],
            ["Keterangan", ": " + (header.Description || "-")],
        ],
        infoRight: [
            ["Tanggal", ": " + new Date(header.MovementDate).toLocaleDateString("id-ID")],
            ["Departemen", ": " + (header.AD_Org_ID?.identifier || "-")],
            ["Status", ": " + (STATUS_MAP[statusCode] || statusCode)],
        ],
        table: {
            head: [["No", "Nama Barang", "Qty", "Keterangan"]],
            body: lines.map((l, idx) => [
                idx + 1,
                cleanIdentifier(l.M_Product_ID?.identifier) || "-",
                numberFormatter.format(l.QtyInternalUse ?? 0),
                l.Description || "",
            ]),
            columnStyles: {
                0: { cellWidth: 30, halign: "center" },
                1: { cellWidth: 220 },
                2: { cellWidth: 60, halign: "right" },
                3: { cellWidth: 185 },
            },
        },
        history,
        verifyUrl: `${VERIFY_BASE_URL}/${header.M_Inventory_UU || header.uid || internaluseId}`,
        verifyCaption: "Scan untuk verifikasi keaslian & status approval dokumen {documentNo}",
        filenamePrefix: "Penerimaan",
        documentNo: header.DocumentNo,
    });
}