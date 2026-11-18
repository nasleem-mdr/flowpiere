// src/utils/pdf/generateGoodsReceiptPDF.jsx
// PDF Formulir Penerimaan Barang — format sama dengan generateRequisitionPDF:
// logo kiri, judul tengah, logo TÜV kanan, kotak info, tabel bergaris penuh,
// lalu 2 kotak tanda tangan berisi QR Code (nama + tanggal):
//   • Diterima oleh  ← node (DocPrepare)
//   • Diketahui oleh ← approver (node approval terakhir yang selesai)
// Tidak lagi memakai renderDocumentPDF (tetap dipakai dokumen lain).
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { idempiereApi } from "@/api/idempiereApi";
import { cleanIdentifier } from "@/utils/pdf/formatIdentifier";
import { TUV_LOGO_DATA_URL, TUV_LOGO_RATIO } from "@/utils/pdf/tuvLogo";

const M_INOUT_AD_TABLE_ID = 319;

const STATUS_MAP = {
  DR: "Draft",
  IP: "Dalam Proses Approval",
  CO: "Selesai / Disetujui",
  CL: "Ditutup",
  VO: "Dibatalkan",
  NA: "Ditolak",
};

// Teks tetap di pojok bawah form. Kosongkan bila form ini tidak punya kode / catatan distribusi.
const FORM_CODE = ""; // contoh: "FORM : 002 - GUD - REV : A"
const COPY_NOTES = []; // contoh: ["Original : Accounting", "Copy 1 : Procurement"]

// Node workflow untuk kotak tanda tangan (nama persis seperti di iDempiere, tak peka huruf besar/kecil)
const RECEIVER_NODES = ["(DocPrepare)"];
// Kosong = otomatis: node approval TERAKHIR yang sudah selesai (di luar node sistem).
// Isi bila ingin menunjuk node tertentu, mis. ["Persetujuan Kepala Gudang"].
const APPROVER_NODES = [];
const SYSTEM_NODES = ["(start)", "(docprepare)", "(docauto)", "(completedocument)", "(doccomplete)"];
// WFState node yang BELUM selesai (OR = belum mulai, OS = berjalan, OP = ditangguhkan)
const UNFINISHED_STATES = ["OR", "OS", "OP"];

const MARGIN = 36;
const TABLE_BODY_H = 300; // tinggi area tabel (kotak tetap, seperti form kertas)

const qtyFmt = new Intl.NumberFormat("en-US");
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-GB") : ""); // dd/mm/yyyy

const getImageSize = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });

const imageFormat = (dataUrl) => (/^data:image\/jpe?g/i.test(dataUrl) ? "JPEG" : "PNG");

/**
 * @param {number} goodsReceiptId
 * @param {string} documentNo
 * @param {object} orgInfo - dari useOrgInfo().orgInfo (logoUrl, name, ...)
 */
export async function generateGoodsReceiptPDF(goodsReceiptId, documentNo, orgInfo) {
  // ── Data ────────────────────────────────────────────────────────────
  const header = await idempiereApi(
    `/models/m_inout/${goodsReceiptId}` +
      `?$select=DocumentNo,MovementDate,Created,Description,DocStatus,AD_Org_ID,CreatedBy,C_BPartner_ID,M_Warehouse_ID,M_InOut_UU`
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
      `&$select=AD_WF_Node_ID,AD_User_ID,UpdatedBy,Updated,WFState` +
      `&$orderby=Updated asc`
  );

  const docNo = header.DocumentNo || documentNo;
  const statusCode = header.DocStatus?.id ?? header.DocStatus;

  // Siapa yang menyelesaikan sebuah node = UpdatedBy pada record event audit.
  // AD_User_ID tidak dipakai: kosong untuk node Responsible Role, dan untuk node Invoker
  // berisi pembuat dokumen — bukan orang yang menekan Approve.
  const finishedNodes = (historyRes.records || []).filter((h) => {
    const state = h.WFState?.id ?? h.WFState;
    return !UNFINISHED_STATES.includes(state);
  });
  const nodeName = (h) => (h.AD_WF_Node_ID?.identifier || "").toLowerCase();
  const toPerson = (h) => {
    const name = h && (h.UpdatedBy?.identifier || h.AD_User_ID?.identifier);
    return name ? { name, date: h.Updated } : null;
  };
  const latestByNode = (names = []) => {
    const wanted = names.map((n) => n.toLowerCase());
    const hits = finishedNodes.filter((h) => wanted.includes(nodeName(h)));
    return toPerson(hits[hits.length - 1]);
  };
  const lastApproval = () => {
    const hits = finishedNodes.filter((h) => !SYSTEM_NODES.includes(nodeName(h)));
    return toPerson(hits[hits.length - 1]);
  };

  const creatorName = header.CreatedBy?.identifier;
  const receiver =
    latestByNode(RECEIVER_NODES) ||
    (creatorName ? { name: creatorName, date: header.Created || header.MovementDate } : null);
  const approver = APPROVER_NODES.length ? latestByNode(APPROVER_NODES) : lastApproval();

  const signBoxes = [
    { label: "Diterima oleh", data: receiver, qr: null },
    { label: "Diketahui oleh", data: approver, qr: null },
  ];

  // Satu QR per kotak: nama + tanggal approval (+ nomor dokumen)
  await Promise.all(
    signBoxes.map(async (b) => {
      if (!b.data) return;
      b.qr = await QRCode.toDataURL(
        `Nama: ${b.data.name}\nTanggal: ${fmtDate(b.data.date)}\nDokumen: ${docNo}`,
        { margin: 1, width: 200 }
      );
    })
  );

  // ── Dokumen ─────────────────────────────────────────────────────────
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const usableW = pageW - MARGIN * 2;

  doc.setDrawColor(0, 0, 0).setLineWidth(0.8).setTextColor(0, 0, 0);

  // Kecilkan font sampai muat; bila tetap tidak muat, potong dengan "..."
  const fitText = (text, maxW, size, minSize = 6.5) => {
    let s = size;
    doc.setFontSize(s);
    while (doc.getTextWidth(text) > maxW && s > minSize) {
      s -= 0.5;
      doc.setFontSize(s);
    }
    if (doc.getTextWidth(text) <= maxW) return text;
    let t = text;
    while (t.length > 1 && doc.getTextWidth(`${t}...`) > maxW) t = t.slice(0, -1);
    return `${t}...`;
  };

  // ── 1. Kop: logo kiri, judul tengah, logo TÜV kanan ─────────────────
  if (orgInfo?.logoUrl) {
    try {
      const { width, height } = await getImageSize(orgInfo.logoUrl);
      const scale = Math.min(105 / width, 52 / height);
      doc.addImage(orgInfo.logoUrl, imageFormat(orgInfo.logoUrl), MARGIN, 22, width * scale, height * scale);
    } catch (err) {
      console.warn("[generateGoodsReceiptPDF] Gagal memuat logo:", err.message);
    }
  } else if (orgInfo?.name) {
    doc.setFont("times", "bold").setFontSize(11);
    doc.text(String(orgInfo.name).toUpperCase(), MARGIN, 40);
  }

  doc.setFont("times", "bold").setFontSize(15);
  doc.text("FORMULIR PENERIMAAN BARANG", pageW / 2, 52, { align: "center" });

  const tuvW = 78;
  doc.addImage(TUV_LOGO_DATA_URL, "PNG", pageW - MARGIN - tuvW, 22, tuvW, tuvW / TUV_LOGO_RATIO);

  // Penanda status bila belum final (supaya cetakan draft tidak tertukar)
  if (statusCode !== "CO") {
    doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(200, 0, 0);
    doc.text(`Status: ${STATUS_MAP[statusCode] || statusCode}`, pageW - MARGIN, 74, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  // ── 2. Kotak info kiri (Nomor, Tanggal, Gudang Tujuan, Supplier) & kotak Keterangan kanan ──
  const boxY = 82;
  const rowH = 18;
  const leftW = 255;
  const rightX = MARGIN + leftW + 10;
  const rightW = usableW - leftW - 10;

  doc.rect(MARGIN, boxY, leftW, rowH * 4);
  for (let i = 1; i < 4; i++) doc.line(MARGIN, boxY + rowH * i, MARGIN + leftW, boxY + rowH * i);

  const infoRows = [
    ["Nomor", docNo],
    ["Tanggal", fmtDate(header.MovementDate)],
    ["Gudang Tujuan", header.M_Warehouse_ID?.identifier || ""],
    ["Supplier", header.C_BPartner_ID?.identifier || ""],
  ];
  infoRows.forEach(([label, val], i) => {
    const ty = boxY + rowH * i + 12.5;
    doc.setFont("times", "bold").setFontSize(9.5);
    doc.text(label, MARGIN + 6, ty);
    doc.text(":", MARGIN + 92, ty);
    if (val) {
      doc.setFont("helvetica", "normal");
      const txt = fitText(String(val), leftW - 100 - 6, 8);
      doc.text(txt, MARGIN + 100, ty);
    }
  });

  doc.rect(rightX, boxY, rightW, rowH * 4);
  doc.setFont("times", "bold").setFontSize(9.5);
  doc.text("Keterangan :", rightX + 6, boxY + 12.5);
  if (header.Description) {
    doc.setFont("helvetica", "normal").setFontSize(8);
    let descLines = doc.splitTextToSize(String(header.Description), rightW - 12);
    if (descLines.length > 5) {
      descLines = descLines.slice(0, 5);
      descLines[4] = `${descLines[4].slice(0, -3)}...`;
    }
    doc.text(descLines, rightX + 6, boxY + 26, { lineHeightFactor: 1.2 });
  }

  // ── 3. Tabel item (kolom penuh sampai bawah kotak) ──────────────────
  const tableTop = boxY + rowH * 4 + 10;
  const tableBottom = tableTop + TABLE_BODY_H;
  const fixed = [24, 236, 64, 68];
  const widths = [...fixed, usableW - fixed.reduce((a, b) => a + b, 0)];

  autoTable(doc, {
    startY: tableTop,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: pageH - tableBottom },
    theme: "plain",
    head: [["No", "Nama Barang", "Qty", "UOM", "Keterangan"]],
    body: lines.map((l, idx) => [
      idx + 1,
      cleanIdentifier(l.M_Product_ID?.identifier) || "-",
      qtyFmt.format(l.MovementQty ?? 0),
      l.C_UOM_ID?.identifier || "-",
      l.Description || "",
    ]),
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      textColor: 0,
      lineWidth: 0,
      overflow: "linebreak",
    },
    headStyles: {
      font: "times",
      fontStyle: "bold",
      fontSize: 10,
      textColor: 0,
      cellPadding: { top: 6, bottom: 6, left: 4, right: 4 },
    },
    columnStyles: {
      0: { cellWidth: widths[0], halign: "center" },
      1: { cellWidth: widths[1] },
      2: { cellWidth: widths[2], halign: "center" },
      3: { cellWidth: widths[3], halign: "center" },
      4: { cellWidth: widths[4] },
    },
    didParseCell: (data) => {
      if (data.section === "head") data.cell.styles.halign = "center";
    },
    didDrawPage: (data) => {
      const top = data.pageNumber === 1 ? tableTop : MARGIN;
      const headH = data.table?.head?.[0]?.height ?? 22;
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

  // ── 4. Dua kotak tanda tangan + QR (halaman terakhir) ───────────────
  const sigTop = tableBottom + 14;
  const sigHeadH = 20;
  const sigBodyH = 94;
  const colW = usableW / signBoxes.length;
  const qrSize = 56;

  signBoxes.forEach((box, i) => {
    const x = MARGIN + i * colW;
    const bodyTop = sigTop + sigHeadH;
    doc.setDrawColor(0, 0, 0).setLineWidth(0.8);
    doc.rect(x, sigTop, colW, sigHeadH);
    doc.rect(x, bodyTop, colW, sigBodyH);

    doc.setFont("times", "bold").setFontSize(10);
    doc.text(box.label, x + colW / 2, sigTop + 13.5, { align: "center" });

    if (!box.data || !box.qr) return; // node belum selesai → kotak dikosongkan
    const cx = x + colW / 2;
    doc.addImage(box.qr, "PNG", cx - qrSize / 2, bodyTop + 5, qrSize, qrSize);

    doc.setFont("helvetica", "bold").setFontSize(7.5);
    const nameLines = doc.splitTextToSize(box.data.name, colW - 10).slice(0, 2);
    doc.text(nameLines, cx, bodyTop + 72, { align: "center", lineHeightFactor: 1.15 });

    doc.setFont("helvetica", "normal").setFontSize(7.5);
    doc.text(fmtDate(box.data.date), cx, bodyTop + 88, { align: "center" });
  });

  // ── 5. Catatan distribusi & kode form (opsional) ────────────────────
  const noteY = sigTop + sigHeadH + sigBodyH + 12;
  doc.setFont("helvetica", "normal").setFontSize(7);
  COPY_NOTES.forEach((t, i) => doc.text(t, MARGIN, noteY + i * 9));
  if (FORM_CODE) {
    doc.setFontSize(8);
    doc.text(FORM_CODE, pageW - MARGIN, noteY, { align: "right" });
  }

  // ── 6. Nomor halaman (bila lebih dari satu) ─────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  if (pageCount > 1) {
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(0, 0, 0);
      doc.text(`Hal ${p}/${pageCount}`, pageW - MARGIN, pageH - 16, { align: "right" });
    }
  }

  doc.save(`Penerimaan-${docNo}.pdf`);
}