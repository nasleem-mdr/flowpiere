import { idempiereApi } from "@/api/idempiereApi";
import { renderDocumentPDF } from "@/utils/pdf/renderDocumentPDF";
import { cleanIdentifier } from "@/utils/pdf/formatIdentifier";

const M_INOUT_AD_TABLE_ID = 319;

const STATUS_MAP = {
    DR: "Draft",
    IP: "Dalam Proses Approval",
    CO: "Selesai / Disetujui",
    CL: "Ditutup",
    VO: "Dibatalkan",
    NA: "Ditolak",
};

const VERIFY_BASE_URL = "https://192.168.0.126:8432/view/goodsreceipt";

const numberFormatter = new Intl.NumberFormat("en-US");

export async function generateGoodsReceiptPDF(goodsReceiptId, documentNo, orgInfo) {
    const header = await idempiereApi(
        `/models/m_inout/${goodsReceiptId}` +
        `?$select=DocumentNo,MovementDate,Description,DocStatus,AD_Org_ID,CreatedBy,M_Warehouse_ID,M_InOut_UU`
    );

    const linesRes = await idempiereApi(
        `/models/m_inoutline` +
        `?$filter=M_InOut_ID eq ${goodsReceiptId}` +
        `&$select=Line,M_Product_ID,MovementQty,C_UOM_ID,Description` +
        `&$orderby=Line`
    );
    const lines = linesRes.records || [];

    const historyRes = await idempiereApi(
        `/models/ad_wf_eventaudit` +
        `?$filter=AD_Table_ID eq ${M_INOUT_AD_TABLE_ID} and Record_ID eq ${goodsReceiptId}` +
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
        title: "FORMULIR PENERIMAAN BARANG DI GUDANG",
        subtitle: "Penerimaan Barang - Dokumen ini sah dengan histori approval terlampir",
        orgInfo,
        infoLeft: [
            ["No. Dokumen", ": " + header.DocumentNo],
            ["Pemohon", ": " + (header.CreatedBy?.identifier || "-")],
            ["Gudang Tujuan", ": " + (header.M_Warehouse_ID?.identifier || "-")],
            ["Keterangan", ": " + (header.Description || "-")],
        ],
        infoRight: [
            ["Tanggal", ": " + new Date(header.MovementDate).toLocaleDateString("id-ID")],
            ["Departemen", ": " + (header.AD_Org_ID?.identifier || "-")],
            ["Status", ": " + (STATUS_MAP[statusCode] || statusCode)],
        ],
        table: {
            head: [["No", "Nama Barang", "Qty", "UOM", "Keterangan"]],
            body: lines.map((l, idx) => [
                idx + 1,
                cleanIdentifier(l.M_Product_ID?.identifier) || "-",
                numberFormatter.format(l.MovementQty ?? 0),
                l.C_UOM_ID?.identifier || "-",
                l.Description || "",
            ]),
            columnStyles: {
                0: { cellWidth: 30, halign: "center" },
                1: { cellWidth: 190 },
                2: { cellWidth: 50, halign: "right" },
                3: { cellWidth: 50 },
                4: { cellWidth: 135 },
            },
        },
        history,
        verifyUrl: `${VERIFY_BASE_URL}/${header.M_InOut_UU || header.uid || goodsReceiptId}`,
        verifyCaption: "Scan untuk verifikasi keaslian & status approval dokumen {documentNo}",
        filenamePrefix: "Penerimaan",
        documentNo: header.DocumentNo,
    });
}