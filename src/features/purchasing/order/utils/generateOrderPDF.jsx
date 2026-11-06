import { idempiereApi } from "@/api/idempiereApi";
import { renderDocumentPDF } from "@/utils/pdf/renderDocumentPDF";
import { cleanIdentifier } from "@/utils/pdf/formatIdentifier";
import { amountInWords, AMOUNT_LABEL } from "@/utils";

const C_ORDER_AD_TABLE_ID = 259;

const STATUS_MAP = {
  DR: "Draft",
  IP: "Dalam Proses Approval",
  CO: "Selesai / Disetujui",
  CL: "Ditutup",
  VO: "Dibatalkan",
  NA: "Ditolak",
};

const VERIFY_BASE_URL = "https://192.168.0.126:8432/view/order";

const numberFormatter = new Intl.NumberFormat("en-US");
const fmtRp = (n) => ` ${Math.round(n || 0).toLocaleString("id-ID")}`;

// options: { lang: 'id' | 'en', currency: 'IDR' | 'USD' | ... } (keduanya opsional)
export async function generateOrderPDF(orderId, documentNo, orgInfo, options = {}) {
  const { lang = "id", currency } = options;

  const header = await idempiereApi(
    `/models/c_order/${orderId}` +
      `?$select=DocumentNo,DateOrdered,Description,DocStatus,AD_Org_ID,CreatedBy,C_BPartner_ID,M_Warehouse_ID,GrandTotal,C_Currency_ID,C_Order_UU`
  );

  const linesRes = await idempiereApi(
    `/models/c_orderline` +
      `?$filter=C_Order_ID eq ${orderId}` +
      `&$select=Line,M_Product_ID,QtyOrdered,QtyEntered, C_UOM_ID,PriceEntered, PriceActual,LineNetAmt,Description` +
      `&$orderby=Line`
  );
  const lines = linesRes.records || [];

  const historyRes = await idempiereApi(
    `/models/ad_wf_eventaudit` +
      `?$filter=AD_Table_ID eq ${C_ORDER_AD_TABLE_ID} and Record_ID eq ${orderId}` +
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

  // Currency: pakai pilihan eksplisit, kalau tidak ambil dari dokumen, fallback IDR
  const rawCurrency = String(header.C_Currency_ID?.identifier || "").trim();
  const currencyCode =
    currency || (/^[A-Za-z]{3}$/.test(rawCurrency) ? rawCurrency.toUpperCase() : "IDR");

  const words = amountInWords(header.GrandTotal, {
    lang,
    currency: currencyCode,
    decimals: currencyCode === "IDR" ? 0 : 2,
  });

  await renderDocumentPDF({
    title: "PURCHASE ORDER (PO)",
    subtitle: "Dokumen ini sah dengan histori approval terlampir",
    orgInfo,
    infoLeft: [
      ["No. Dokumen", ": " + header.DocumentNo],
      ["Vendor", ": " + (header.C_BPartner_ID?.identifier || "-")],
      ["Gudang Tujuan", ": " + (header.M_Warehouse_ID?.identifier || "-")],
      ["Keterangan", ": " + (header.Description || "-")],
    ],
    infoRight: [
      ["Tanggal", ": " + new Date(header.DateOrdered).toLocaleDateString("id-ID")],
      ["Departemen", ": " + (header.AD_Org_ID?.identifier || "-")],
      ["Status", ": " + (STATUS_MAP[statusCode] || statusCode)],
      ["Grand Total", ": " + fmtRp(header.GrandTotal)],
    ],
    table: {
      head: [["No", "Nama Barang", "Qty", "UOM", "Harga", "Line Amount"]],
      body: lines.map((l, idx) => [
        idx + 1,
        cleanIdentifier(l.M_Product_ID?.identifier) || "-",
        numberFormatter.format(l.QtyEntered ?? 0),
        l.C_UOM_ID?.identifier || "-",
        numberFormatter.format(l.PriceEntered ?? 0),
        numberFormatter.format(l.LineNetAmt ?? 0),
      ]),
      foot: [
        [
          { content: "Grand Total", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
          { content: numberFormatter.format(header.GrandTotal ?? 0), styles: { halign: "right", fontStyle: "bold" } },
        ],
        // Terbilang
        [
          {
            content: `${AMOUNT_LABEL[lang] || AMOUNT_LABEL.id}: ${words}`,
            colSpan: 6,
            styles: { halign: "left", fontStyle: "italic" },
          },
        ],
      ],
      columnStyles: {
        0: { cellWidth: 30, halign: "center" },
        1: { cellWidth: 210 },
        2: { cellWidth: 55, halign: "right" },
        3: { cellWidth: 55 },
        4: { cellWidth: 90, halign: "right" },
        5: { cellWidth: 105, halign: "right" },
      },
    },
    history,
    verifyUrl: `${VERIFY_BASE_URL}/${header.C_Order_UU || header.uid || orderId}`,
    verifyCaption: "Scan untuk verifikasi keaslian & status approval dokumen {documentNo}",
    filenamePrefix: "PO",
    documentNo: header.DocumentNo,
  });
}