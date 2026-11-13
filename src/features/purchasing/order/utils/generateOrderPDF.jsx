// src/utils/pdf/generateOrderPDF.jsx
// PDF Purchase Order — layout "Order Pembelian" (kotak-kotak, font Courier, kolom tabel
// penuh sampai bawah, terbilang, syarat pembayaran, baris tanda tangan).
// Tidak lagi memakai renderDocumentPDF (itu tetap dipakai dokumen lain, mis. Invoice).
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { idempiereApi } from "@/api/idempiereApi";
import { cleanIdentifier } from "@/utils/pdf/formatIdentifier";
import { amountInWords, AMOUNT_LABEL } from "@/utils";

const C_ORDER_AD_TABLE_ID = 259;

// Label jabatan untuk pembuat PO (kolom tanda tangan pertama setelah supplier).
// Kolom berikutnya memakai nama node workflow sebagai jabatan.
const CREATOR_ROLE_LABEL = "Staff Purchasing";

const STATUS_MAP = {
  DR: "Draft",
  IP: "Dalam Proses Approval",
  CO: "Selesai / Disetujui",
  CL: "Ditutup",
  VO: "Dibatalkan",
  NA: "Ditolak",
};

const MARGIN = 36;
const BLUE = [0, 0, 220];
const HIDDEN_NODES = ["(start)", "(docauto)", "(completedocument)"];

const qtyFmt = new Intl.NumberFormat("en-US");
const moneyFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB") : ""); // dd/mm/yyyy

const getImageSize = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });

const imageFormat = (dataUrl) => (/^data:image\/jpe?g/i.test(dataUrl) ? "JPEG" : "PNG");

// options: { lang: 'id' | 'en', currency: 'IDR' | 'USD' | ... } (keduanya opsional)
export async function generateOrderPDF(orderId, documentNo, orgInfo, options = {}) {
  const { lang = "id", currency } = options;

  // ── Data ────────────────────────────────────────────────────────────
  const header = await idempiereApi(
    `/models/c_order/${orderId}` +
      `?$select=DocumentNo,DateOrdered,DatePromised,Description,DocStatus,AD_Org_ID,CreatedBy,C_BPartner_ID,M_Warehouse_ID,C_PaymentTerm_ID,GrandTotal,C_Currency_ID,C_Order_UU`
  );

  const linesRes = await idempiereApi(
    `/models/c_orderline` +
      `?$filter=C_Order_ID eq ${orderId}` +
      `&$select=Line,M_Product_ID,QtyOrdered,QtyEntered,C_UOM_ID,PriceEntered,PriceActual,LineNetAmt,Description` +
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
    .filter((h) => !HIDDEN_NODES.includes((h.AD_WF_Node_ID?.identifier || "").toLowerCase()))
    .map((h) => ({
      nodeName: h.AD_WF_Node_ID?.identifier || "-",
      userName: h.AD_User_ID?.identifier || "-",
    }));

  const statusCode = header.DocStatus?.id ?? header.DocStatus;

  const rawCurrency = String(header.C_Currency_ID?.identifier || "").trim();
  const currencyCode =
    currency || (/^[A-Za-z]{3}$/.test(rawCurrency) ? rawCurrency.toUpperCase() : "IDR");

  const words = amountInWords(header.GrandTotal, {
    lang,
    currency: currencyCode,
    decimals: currencyCode === "IDR" ? 0 : 2,
  });
  const sayLabel = lang === "en" ? `${currencyCode} Say` : AMOUNT_LABEL[lang] || AMOUNT_LABEL.id;

  // Penandatangan: pembuat PO + approver dari histori workflow (tanpa duplikat)
  const creator = header.CreatedBy?.identifier;
  const signers = [];
  if (creator) signers.push({ name: creator, role: CREATOR_ROLE_LABEL });
  const seen = new Set();
  history.forEach((h) => {
    const key = `${h.userName}|${h.nodeName}`;
    if (h.userName === "-" || h.userName === creator || seen.has(key)) return;
    seen.add(key);
    signers.push({ name: h.userName, role: h.nodeName });
  });

  // ── Dokumen & ukuran ────────────────────────────────────────────────
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const usableW = pageW - MARGIN * 2;

  doc.setDrawColor(0, 0, 0).setLineWidth(0.8).setTextColor(0, 0, 0);

  // ── 1. Kop: logo kiri, nama perusahaan, kotak "ORDER PEMBELIAN" kanan ──
  const boxW = 165;
  const boxX = pageW - MARGIN - boxW;

  if (orgInfo?.logoUrl) {
    try {
      const { width, height } = await getImageSize(orgInfo.logoUrl);
      const scale = Math.min(115 / width, 58 / height);
      doc.addImage(orgInfo.logoUrl, imageFormat(orgInfo.logoUrl), MARGIN, 24, width * scale, height * scale);
    } catch (err) {
      console.warn("[generateOrderPDF] Gagal memuat logo:", err.message);
    }
  }

  const nameX = MARGIN + 150;
  const nameW = boxX - nameX - 10;
  doc.setFont("courier", "bold").setFontSize(11);
  const nameLines = doc.splitTextToSize((orgInfo?.name || "").toUpperCase(), nameW);
  doc.text(nameLines, nameX, 50);

  const addrLines = orgInfo?.addressLines?.length ? orgInfo.addressLines : orgInfo?.address ? [orgInfo.address] : [];
  if (addrLines.length) {
    doc.setFont("courier", "normal").setFontSize(7);
    let ay = 50 + nameLines.length * 12;
    addrLines.forEach((line) => {
      doc.splitTextToSize(line, nameW).forEach((l) => {
        doc.text(l, nameX, ay);
        ay += 9;
      });
    });
  }

  doc.rect(boxX, 56, boxW, 26);
  doc.rect(boxX, 82, boxW, 24);
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text("ORDER PEMBELIAN", boxX + boxW / 2, 73, { align: "center" });
  doc.setFont("courier", "bold").setFontSize(8);
  const poLabel = "PO. No : ";
  doc.text(poLabel, boxX + 6, 98);
  doc.setTextColor(...BLUE);
  doc.text(String(header.DocumentNo || ""), boxX + 6 + doc.getTextWidth(poLabel), 98);
  doc.setTextColor(0, 0, 0);

  // Penanda status bila PO belum final (supaya cetakan draft tidak tertukar)
  if (statusCode !== "CO") {
    doc.setFont("courier", "bold").setFontSize(7).setTextColor(200, 0, 0);
    doc.text(`Status: ${STATUS_MAP[statusCode] || statusCode}`, boxX + boxW, 117, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  // ── 2. Tiga kotak info: Kepada | Alamat Pengiriman | Tanggal ────────
  const infoY = 132;
  const infoH = 64;
  const gap = 10;
  const infoW = (usableW - gap * 2) / 3;
  const innerW = infoW - 16;

  const drawBox = (i, drawContent) => {
    const x = MARGIN + i * (infoW + gap);
    doc.rect(x, infoY, infoW, infoH);
    drawContent(x + 8);
  };
  const writeLines = (lines, x, y0) => {
    let y = y0;
    lines.forEach((t) => {
      doc.splitTextToSize(String(t), innerW).forEach((l) => {
        doc.text(l, x, y);
        y += 10;
      });
    });
  };

  doc.setFont("courier", "normal").setFontSize(8);
  drawBox(0, (x) => {
    doc.text("Kepada :", x, infoY + 14);
    writeLines([header.C_BPartner_ID?.identifier || "-"], x, infoY + 27);
  });
  drawBox(1, (x) => {
    doc.text("Alamat Pengiriman", x, infoY + 14);
    writeLines([orgInfo?.name || "", header.M_Warehouse_ID?.identifier || ""].filter(Boolean), x, infoY + 27);
  });
  drawBox(2, (x) => {
    const lbl1 = "Tanggal : ";
    doc.text(lbl1, x, infoY + 14);
    const dx = x + doc.getTextWidth(lbl1);
    const d1 = fmtDate(header.DateOrdered);
    doc.setFont("courier", "bold").setTextColor(...BLUE);
    doc.text(d1, dx, infoY + 14);
    doc.setLineWidth(0.5).line(dx, infoY + 17, dx + doc.getTextWidth(d1), infoY + 17).setLineWidth(0.8);
    doc.setFont("courier", "normal").setTextColor(0, 0, 0);

    const lbl2 = "Tanggal Pengiriman : ";
    doc.text(lbl2, x, infoY + 29);
    doc.setFont("courier", "bold").setTextColor(...BLUE);
    doc.text(fmtDate(header.DatePromised), x + doc.getTextWidth(lbl2), infoY + 29);
    doc.setFont("courier", "normal").setTextColor(0, 0, 0);
  });

  // ── 3. Ruang footer (dihitung dulu supaya tabel berhenti di atasnya) ─
  const SIG_COLS = 4;
  const sigRowH = 78;
  const sigRows = Math.ceil((1 + signers.length) / SIG_COLS);
  const totalRowH = 16;
  const sayH = 40;
  const termsH = 18;
  const footerH = totalRowH + 8 + sayH + 4 + termsH + 22 + sigRows * sigRowH + 28;
  const tableBottom = pageH - footerH;

  // ── 4. Tabel item: kolom bergaris penuh sampai tableBottom ───────────
  const tableTop = infoY + infoH + 14;
  const w = { no: 24, qty: 55, unit: 38, price: 75, total: 88 };
  const descW = usableW - (w.no + w.qty + w.unit + w.price + w.total);
  const widths = [w.no, descW, w.qty, w.unit, w.price, w.total];

  autoTable(doc, {
    startY: tableTop,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: footerH },
    theme: "plain",
    head: [["No", "Description", "Qty", "Unit", "Price/Unit", "Total"]],
    body: lines.map((l, idx) => {
      const prod = cleanIdentifier(l.M_Product_ID?.identifier) || "-";
      return [
        idx + 1,
        l.Description ? `${prod}\n${l.Description}` : prod,
        qtyFmt.format(l.QtyEntered ?? 0),
        l.C_UOM_ID?.identifier || "-",
        qtyFmt.format(l.PriceEntered ?? 0),
        qtyFmt.format(l.LineNetAmt ?? 0),
      ];
    }),
    styles: {
      font: "courier",
      fontSize: 8,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      textColor: 0,
      lineWidth: 0,
      overflow: "linebreak",
    },
    headStyles: { font: "helvetica", fontStyle: "bold", textColor: 0 },
    columnStyles: {
      0: { cellWidth: widths[0], halign: "left" },
      1: { cellWidth: widths[1] },
      2: { cellWidth: widths[2], halign: "right" },
      3: { cellWidth: widths[3] },
      4: { cellWidth: widths[4], halign: "right" },
      5: { cellWidth: widths[5], halign: "right" },
    },
    didDrawPage: (data) => {
      const top = data.pageNumber === 1 ? tableTop : MARGIN;
      const headH = data.table?.head?.[0]?.height ?? 18;
      doc.setDrawColor(0, 0, 0).setLineWidth(0.8);
      doc.rect(MARGIN, top, usableW, tableBottom - top);
      let x = MARGIN;
      widths.slice(0, -1).forEach((cw) => {
        x += cw;
        doc.line(x, top, x, tableBottom);
      });
      doc.line(MARGIN, top + headH, MARGIN + usableW, top + headH);
    },
  });

  // ── 5. Baris TOTAL (halaman terakhir) ────────────────────────────────
  const priceX = MARGIN + widths[0] + widths[1] + widths[2] + widths[3];
  const totalX = priceX + widths[4];
  let y = tableBottom;

  doc.setDrawColor(0, 0, 0).setLineWidth(0.8);
  doc.rect(MARGIN, y, usableW, totalRowH);
  doc.line(priceX, y, priceX, y + totalRowH);
  doc.line(totalX, y, totalX, y + totalRowH);
  doc.setFont("courier", "normal").setFontSize(8);
  doc.text(`TOTAL  ${currencyCode}`, priceX + 4, y + 11);
  doc.setFont("courier", "bold");
  doc.text(moneyFmt.format(header.GrandTotal ?? 0), MARGIN + usableW - 4, y + 11, { align: "right" });
  y += totalRowH + 8;

  // ── 6. Terbilang ─────────────────────────────────────────────────────
  doc.rect(MARGIN, y, usableW, sayH);
  doc.setFont("courier", "normal").setFontSize(8);
  const sayText = `${sayLabel} : `;
  const sayLabelW = doc.getTextWidth(sayText);
  doc.text(sayText, MARGIN + 8, y + 14);
  doc.setFont("courier", "italic").setFontSize(9).setTextColor(...BLUE);
  doc.text(doc.splitTextToSize(String(words), usableW - 16 - sayLabelW).slice(0, 3), MARGIN + 8 + sayLabelW, y + 14);
  doc.setTextColor(0, 0, 0);
  y += sayH + 4;

  // ── 7. Syarat pembayaran ─────────────────────────────────────────────
  doc.rect(MARGIN, y, usableW, termsH);
  doc.setFont("courier", "normal").setFontSize(8);
  doc.text(`Syarat Pembayaran :  ${header.C_PaymentTerm_ID?.identifier || "-"}`, MARGIN + 8, y + 12);
  y += termsH + 12;

  // ── 8. Disetujui + tanda tangan ──────────────────────────────────────
  doc.text("Disetujui Supplier,", MARGIN, y);
  const sigTop = y + 8;
  const colStep = usableW / SIG_COLS;
  const textW = colStep - 10;

  const slots = [{ vendor: true, name: header.C_BPartner_ID?.identifier || "-" }, ...signers];
  slots.forEach((s, i) => {
    const col = i % SIG_COLS;
    const row = Math.floor(i / SIG_COLS);
    const x = MARGIN + col * colStep;
    const ny = sigTop + row * sigRowH + 58;

    doc.setFont("courier", "normal").setFontSize(8);
    if (s.vendor) {
      doc.text(doc.splitTextToSize(s.name, textW), x, ny);
    } else {
      doc.text(doc.splitTextToSize(`( ${s.name} )`, textW), x, ny);
      doc.text(doc.splitTextToSize(s.role, textW), x, ny + 10);
    }
  });

  // ── 9. Nomor halaman (bila lebih dari satu) ──────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  if (pageCount > 1) {
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFont("courier", "normal").setFontSize(7).setTextColor(0, 0, 0);
      doc.text(`Hal ${p}/${pageCount}`, pageW - MARGIN, pageH - 16, { align: "right" });
    }
  }

  doc.save(`PO-${header.DocumentNo || documentNo}.pdf`);
}