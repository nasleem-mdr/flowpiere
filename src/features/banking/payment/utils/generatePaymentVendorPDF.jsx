// src/features/banking/payment/utils/generatePaymentVendorPDF.jsx
// PDF Bukti Pembayaran ke Vendor (C_Payment, IsReceipt = false) — gaya sama dengan generateOrderPDF:
// kotak-kotak, font Courier, kolom tabel penuh sampai bawah, terbilang, baris tanda tangan.
// Tabel berisi invoice yang dilunasi (dari C_PaymentAllocate / C_AllocationLine).
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { idempiereApi, fkId } from "@/api/idempiereApi";
import { amountInWords, AMOUNT_LABEL } from "@/utils";

const C_PAYMENT_AD_TABLE_ID = 335;

// Jabatan di bawah nama pembuat dokumen, dan label kolom TTD kosong
// (dicetak bila dokumen tidak punya approver di histori workflow).
const CREATOR_ROLE_LABEL = "Dibuat oleh";
const MANUAL_APPROVER_LABEL = "Disetujui oleh";

const STATUS_MAP = {
  DR: "Draft",
  IP: "Dalam Proses Approval",
  CO: "Selesai / Disetujui",
  CL: "Ditutup",
  VO: "Dibatalkan",
  RE: "Di-reverse",
  NA: "Ditolak",
};

const SYSTEM_NODES = ["(start)", "(docprepare)", "(docauto)", "(completedocument)", "(doccomplete)"];
// WFState node yang BELUM selesai (OR = belum mulai, OS = berjalan, OP = ditangguhkan)
const UNFINISHED_STATES = ["OR", "OS", "OP"];

const MARGIN = 36;
const BLUE = [0, 0, 220];

const moneyFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB") : ""); // dd/mm/yyyy

const idOf = (fk) => Number(fkId(fk) ?? fk?.id ?? fk);

const getImageSize = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });

const imageFormat = (dataUrl) => (/^data:image\/jpe?g/i.test(dataUrl) ? "JPEG" : "PNG");

// Invoice yang dilunasi payment ini: C_PaymentAllocate → C_AllocationLine → C_Invoice_ID di header.
async function loadPaidInvoices(paymentId, header) {
  let rows = [];
  try {
    const r = await idempiereApi(
      `/models/c_paymentallocate?$filter=C_Payment_ID eq ${paymentId}&$select=C_Invoice_ID,Amount`
    );
    rows = (r.records || []).map((x) => ({ invoice: x.C_Invoice_ID, amount: x.Amount }));
  } catch (err) {
    console.warn("[generatePaymentVendorPDF] c_paymentallocate:", err.message);
  }

  if (!rows.length) {
    try {
      const r = await idempiereApi(
        `/models/c_allocationline?$filter=C_Payment_ID eq ${paymentId}&$select=C_Invoice_ID,Amount`
      );
      rows = (r.records || [])
        .filter((x) => x.C_Invoice_ID)
        .map((x) => ({ invoice: x.C_Invoice_ID, amount: x.Amount }));
    } catch (err) {
      console.warn("[generatePaymentVendorPDF] c_allocationline:", err.message);
    }
  }

  if (!rows.length && header.C_Invoice_ID) {
    rows = [{ invoice: header.C_Invoice_ID, amount: header.PayAmt }];
  }
  if (!rows.length) return [];

  const ids = [...new Set(rows.map((r) => idOf(r.invoice)).filter(Boolean))];
  const invMap = new Map();
  if (ids.length) {
    const cond = ids.map((i) => `C_Invoice_ID eq ${i}`).join(" or ");
    const r = await idempiereApi(`/models/c_invoice?$filter=${cond}&$select=DocumentNo,DateInvoiced,GrandTotal`);
    (r.records || []).forEach((inv) => invMap.set(Number(inv.id ?? inv.C_Invoice_ID), inv));
  }

  return rows.map((r) => {
    const inv = invMap.get(idOf(r.invoice));
    return {
      documentNo: inv?.DocumentNo || r.invoice?.identifier || "-",
      date: inv?.DateInvoiced,
      invoiceTotal: inv?.GrandTotal,
      paid: r.amount,
    };
  });
}

// options: { lang: 'id' | 'en', currency: 'IDR' | 'USD' | ... } (keduanya opsional)
export async function generatePaymentVendorPDF(paymentId, documentNo, orgInfo, options = {}) {
  const { lang = "id", currency } = options;

  // ── Data ────────────────────────────────────────────────────────────
  const header = await idempiereApi(
    `/models/c_payment/${paymentId}` +
      `?$select=DocumentNo,DateTrx,Created,Description,DocStatus,CreatedBy,C_BPartner_ID,C_BankAccount_ID,` +
      `C_Currency_ID,C_Invoice_ID,PayAmt,TenderType`
  );

  const paidInvoices = await loadPaidInvoices(paymentId, header);

  const historyRes = await idempiereApi(
    `/models/ad_wf_eventaudit` +
      `?$filter=AD_Table_ID eq ${C_PAYMENT_AD_TABLE_ID} and Record_ID eq ${paymentId}` +
      `&$select=AD_WF_Node_ID,AD_User_ID,UpdatedBy,Updated,WFState` +
      `&$orderby=Updated asc`
  );

  const docNo = header.DocumentNo || documentNo;
  const statusCode = header.DocStatus?.id ?? header.DocStatus;
  const payAmt = Number(header.PayAmt) || 0;

  const rawCurrency = String(header.C_Currency_ID?.identifier || "").trim();
  const currencyCode =
    currency || (/^[A-Za-z]{3}$/.test(rawCurrency) ? rawCurrency.toUpperCase() : "IDR");

  const words = amountInWords(payAmt, {
    lang,
    currency: currencyCode,
    decimals: currencyCode === "IDR" ? 0 : 2,
  });
  const sayLabel = lang === "en" ? `${currencyCode} Say` : AMOUNT_LABEL[lang] || AMOUNT_LABEL.id;

  // Penandatangan: vendor (penerima), pembuat dokumen, lalu approver dari histori workflow.
  // Nama approver = UpdatedBy (AD_User_ID kosong untuk node Responsible Role).
  const creator = header.CreatedBy?.identifier;
  const signers = [];
  if (creator) signers.push({ name: creator, role: CREATOR_ROLE_LABEL });

  const seen = new Set();
  let approverCount = 0;
  (historyRes.records || []).forEach((h) => {
    const state = h.WFState?.id ?? h.WFState;
    const node = h.AD_WF_Node_ID?.identifier || "";
    const name = h.UpdatedBy?.identifier || h.AD_User_ID?.identifier || "";
    if (!name || name === creator) return;
    if (UNFINISHED_STATES.includes(state) || SYSTEM_NODES.includes(node.toLowerCase())) return;
    const key = `${name}|${node}`;
    if (seen.has(key)) return;
    seen.add(key);
    signers.push({ name, role: node });
    approverCount++;
  });
  if (approverCount === 0) signers.push({ name: "", role: MANUAL_APPROVER_LABEL });

  // ── Dokumen & ukuran ────────────────────────────────────────────────
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const usableW = pageW - MARGIN * 2;

  doc.setDrawColor(0, 0, 0).setLineWidth(0.8).setTextColor(0, 0, 0);

  // ── 1. Kop: logo kiri, nama perusahaan, kotak "BUKTI PEMBAYARAN" kanan ──
  const boxW = 165;
  const boxX = pageW - MARGIN - boxW;

  if (orgInfo?.logoUrl) {
    try {
      const { width, height } = await getImageSize(orgInfo.logoUrl);
      const scale = Math.min(115 / width, 58 / height);
      doc.addImage(orgInfo.logoUrl, imageFormat(orgInfo.logoUrl), MARGIN, 24, width * scale, height * scale);
    } catch (err) {
      console.warn("[generatePaymentVendorPDF] Gagal memuat logo:", err.message);
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
  doc.text("BUKTI PEMBAYARAN", boxX + boxW / 2, 73, { align: "center" });
  doc.setFont("courier", "bold").setFontSize(8);
  const noLabel = "No. : ";
  doc.text(noLabel, boxX + 6, 98);
  doc.setTextColor(...BLUE);
  doc.text(String(docNo || ""), boxX + 6 + doc.getTextWidth(noLabel), 98);
  doc.setTextColor(0, 0, 0);

  // Penanda status bila belum final (supaya cetakan draft tidak tertukar)
  if (statusCode !== "CO") {
    doc.setFont("courier", "bold").setFontSize(7).setTextColor(200, 0, 0);
    doc.text(`Status: ${STATUS_MAP[statusCode] || statusCode}`, boxX + boxW, 117, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  // ── 2. Tiga kotak info: Dibayarkan kepada | Bank / Kas | Tanggal ────
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
    doc.text("Dibayarkan kepada :", x, infoY + 14);
    writeLines([header.C_BPartner_ID?.identifier || "-"], x, infoY + 27);
  });
  drawBox(1, (x) => {
    doc.text("Bank / Kas", x, infoY + 14);
    writeLines([header.C_BankAccount_ID?.identifier || "-"], x, infoY + 27);
  });
  drawBox(2, (x) => {
    const lbl1 = "Tanggal : ";
    doc.text(lbl1, x, infoY + 14);
    const dx = x + doc.getTextWidth(lbl1);
    const d1 = fmtDate(header.DateTrx);
    doc.setFont("courier", "bold").setTextColor(...BLUE);
    doc.text(d1, dx, infoY + 14);
    doc.setLineWidth(0.5).line(dx, infoY + 17, dx + doc.getTextWidth(d1), infoY + 17).setLineWidth(0.8);
    doc.setFont("courier", "normal").setTextColor(0, 0, 0);

    const lbl2 = "Metode  : ";
    doc.text(lbl2, x, infoY + 29);
    doc.setFont("courier", "bold").setTextColor(...BLUE);
    doc.text(String(header.TenderType?.identifier || header.TenderType?.id || "-"), x + doc.getTextWidth(lbl2), infoY + 29);
    doc.setFont("courier", "normal").setTextColor(0, 0, 0);
  });

  // ── 3. Ruang footer (dihitung dulu supaya tabel berhenti di atasnya) ─
  const SIG_COLS = 4;
  const sigRowH = 78;
  const sigRows = Math.ceil((1 + signers.length) / SIG_COLS);
  const totalRowH = 16;
  const sayH = 40;
  const noteH = 30;
  const footerH = totalRowH + 8 + sayH + 4 + noteH + 22 + sigRows * sigRowH + 28;
  const tableBottom = pageH - footerH;

  // ── 4. Tabel invoice yang dilunasi: kolom bergaris penuh ─────────────
  const tableTop = infoY + infoH + 14;
  const w = { no: 24, date: 80, total: 120, paid: 120 };
  const descW = usableW - (w.no + w.date + w.total + w.paid);
  const widths = [w.no, descW, w.date, w.total, w.paid];

  const body = paidInvoices.length
    ? paidInvoices.map((p, idx) => [
        idx + 1,
        p.documentNo,
        fmtDate(p.date),
        p.invoiceTotal != null ? moneyFmt.format(Number(p.invoiceTotal) || 0) : "",
        moneyFmt.format(Number(p.paid) || 0),
      ])
    : [[1, header.Description || "Pembayaran", "", "", moneyFmt.format(payAmt)]];

  autoTable(doc, {
    startY: tableTop,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: footerH },
    theme: "plain",
    head: [["No", "No. Invoice", "Tgl Invoice", "Total Invoice", "Dibayar"]],
    body,
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
      2: { cellWidth: widths[2] },
      3: { cellWidth: widths[3], halign: "right" },
      4: { cellWidth: widths[4], halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= 3) data.cell.styles.halign = "right";
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
  const labelX = MARGIN + widths[0] + widths[1] + widths[2];
  const amountX = labelX + widths[3];
  let y = tableBottom;

  doc.setDrawColor(0, 0, 0).setLineWidth(0.8);
  doc.rect(MARGIN, y, usableW, totalRowH);
  doc.line(labelX, y, labelX, y + totalRowH);
  doc.line(amountX, y, amountX, y + totalRowH);
  doc.setFont("courier", "normal").setFontSize(8);
  doc.text(`TOTAL  ${currencyCode}`, labelX + 4, y + 11);
  doc.setFont("courier", "bold");
  doc.text(moneyFmt.format(payAmt), MARGIN + usableW - 4, y + 11, { align: "right" });
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

  // ── 7. Keterangan ────────────────────────────────────────────────────
  doc.rect(MARGIN, y, usableW, noteH);
  doc.setFont("courier", "normal").setFontSize(8);
  const noteLabel = "Keterangan : ";
  doc.text(noteLabel, MARGIN + 8, y + 12);
  const noteLines = doc
    .splitTextToSize(String(header.Description || "-"), usableW - 16 - doc.getTextWidth(noteLabel))
    .slice(0, 2);
  doc.text(noteLines, MARGIN + 8 + doc.getTextWidth(noteLabel), y + 12);
  y += noteH + 12;

  // ── 8. Tanda terima + tanda tangan ───────────────────────────────────
  doc.text("Diterima oleh,", MARGIN, y);
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
      const shown = s.name ? `( ${s.name} )` : "(                    )"; // kolom TTD kosong
      doc.text(doc.splitTextToSize(shown, textW), x, ny);
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

  doc.save(`Pembayaran-${docNo || documentNo}.pdf`);
}
