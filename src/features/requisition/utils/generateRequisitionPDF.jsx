// src/utils/pdf/generateRequisitionPDF.jsx
// PDF Formulir Permintaan Barang (FPB) — layout mengikuti form kertas:
// logo kiri, judul tengah, logo TÜV kanan, kotak info (No/Tanggal/Departemen/Sub Divisi),
// tabel bergaris penuh, dan 4 kotak tanda tangan (Permohonan/Diperiksa/Diketahui/Disetujui)
// yang masing-masing berisi QR Code (nama + tanggal approval).
// Tidak lagi memakai renderDocumentPDF (tetap dipakai dokumen lain).
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { idempiereApi } from "@/api/idempiereApi";
import { cleanIdentifier } from "@/utils/pdf/formatIdentifier";
import { TUV_LOGO_DATA_URL, TUV_LOGO_RATIO } from "@/utils/pdf/tuvLogo";

const M_REQUISITION_AD_TABLE_ID = 702;

const STATUS_MAP = {
  DR: "Draft",
  IP: "Dalam Proses Approval",
  CO: "Selesai / Disetujui",
  CL: "Ditutup",
  VO: "Dibatalkan",
  RE: "Ditolak",
};

// Teks tetap pada form kertas
const FORM_CODE = "FORM : 001 - U&P - REV : B";
const COPY_NOTES = ["Original : Accounting", "Copy 1 : Administration", "Copy 2 : Procurement"];

// Susunan kotak tanda tangan sesuai workflow Requisition.
// Tiap kotak berisi 1 atau lebih orang (masing-masing satu QR). Sumber orang:
//   source: "creator" → pembuat dokumen
//   nodes : [...]     → nama node workflow (persis seperti di iDempiere, tak peka huruf
//                       besar/kecil); bila lebih dari satu, dipakai node terbaru yang selesai.
// `role` hanya dicetak bila kotak berisi lebih dari satu orang.
const SIGN_BOXES = [
  {
    label: "Permohonan",
    people: [
      { role: "Pemohon", source: "creator" },
      { role: "Atasan", nodes: ["Persetujuan Kadep"] },
    ],
  },
  {
    label: "Diperiksa",
    people: [
      { role: "Kadep UP", nodes: ["Persetujuan Kadep Umum"] },
      { role: "Purchasing", nodes: ["Purchasing Review"] },
    ],
  },
  { label: "Diketahui", people: [{ nodes: ["Disetujui Kadep Keuangan"] }] },
  { label: "Disetujui", people: [{ nodes: ["Disetujui Kepala Divisi"] }] },
];
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
 * @param {number} requisitionId
 * @param {string} documentNo
 * @param {object} orgInfo - dari useOrgInfo().orgInfo (logoUrl, name, ...)
 */
export async function generateRequisitionPDF(requisitionId, documentNo, orgInfo) {
  // ── Data ────────────────────────────────────────────────────────────
  const header = await idempiereApi(
    `/models/m_requisition/${requisitionId}` +
      `?$select=DocumentNo,DateDoc,Created,Description,DocStatus,AD_Org_ID,CreatedBy,M_Warehouse_ID,M_Requisition_UU`
  );

  const linesRes = await idempiereApi(
    `/models/m_requisitionline` +
      `?$filter=M_Requisition_ID eq ${requisitionId}` +
      `&$select=Line,M_Product_ID,Qty,QtyEntered,C_UOM_ID,Description` +
      `&$orderby=Line`
  );
  const lines = linesRes.records || [];

  const historyRes = await idempiereApi(
    `/models/ad_wf_eventaudit` +
      `?$filter=AD_Table_ID eq ${M_REQUISITION_AD_TABLE_ID} and Record_ID eq ${requisitionId}` +
      `&$select=AD_WF_Node_ID,AD_User_ID,UpdatedBy,Updated,WFState` +
      `&$orderby=Updated asc`
  );

  const docNo = header.DocumentNo || documentNo;
  const statusCode = header.DocStatus?.id ?? header.DocStatus;

  // Siapa yang menyetujui sebuah node = UpdatedBy pada record event audit.
  // AD_User_ID TIDAK dipakai: untuk node Responsible Role isinya kosong, dan untuk
  // node Invoker berisi pembuat dokumen — bukan orang yang menekan Approve.
  const finishedNodes = (historyRes.records || []).filter((h) => {
    const state = h.WFState?.id ?? h.WFState;
    return !UNFINISHED_STATES.includes(state);
  });

  const latestByNode = (names = []) => {
    const wanted = names.map((n) => n.toLowerCase());
    const hits = finishedNodes.filter((h) =>
      wanted.includes((h.AD_WF_Node_ID?.identifier || "").toLowerCase())
    );
    const h = hits[hits.length - 1];
    const name = h && (h.UpdatedBy?.identifier || h.AD_User_ID?.identifier);
    return name ? { name, date: h.Updated } : null;
  };

  // Isi kotak tanda tangan. Orang yang node-nya belum selesai dibiarkan kosong.
  const creatorName = header.CreatedBy?.identifier;
  const resolvePerson = (p) =>
    p.source === "creator"
      ? creatorName
        ? { name: creatorName, date: header.Created || header.DateDoc }
        : null
      : latestByNode(p.nodes);

  const signBoxes = SIGN_BOXES.map((box) => ({
    label: box.label,
    people: box.people.map((p) => ({ role: p.role, data: resolvePerson(p), qr: null })),
  }));

  // Satu QR per orang: nama + tanggal approval (+ peran bila ada, + nomor dokumen)
  await Promise.all(
    signBoxes.flatMap((b) =>
      b.people.map(async (p) => {
        if (!p.data) return;
        const roleLine = b.people.length > 1 && p.role ? `\nPeran: ${p.role}` : "";
        p.qr = await QRCode.toDataURL(
          `Nama: ${p.data.name}\nTanggal: ${fmtDate(p.data.date)}${roleLine}\nDokumen: ${docNo}`,
          { margin: 1, width: 200 }
        );
      })
    )
  );

  // ── Dokumen ─────────────────────────────────────────────────────────
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const usableW = pageW - MARGIN * 2;

  doc.setDrawColor(0, 0, 0).setLineWidth(0.8).setTextColor(0, 0, 0);

  // ── 1. Kop: logo kiri, judul tengah, logo TÜV kanan ─────────────────
  if (orgInfo?.logoUrl) {
    try {
      const { width, height } = await getImageSize(orgInfo.logoUrl);
      const scale = Math.min(105 / width, 52 / height);
      doc.addImage(orgInfo.logoUrl, imageFormat(orgInfo.logoUrl), MARGIN, 22, width * scale, height * scale);
    } catch (err) {
      console.warn("[generateRequisitionPDF] Gagal memuat logo:", err.message);
    }
  } else if (orgInfo?.name) {
    doc.setFont("times", "bold").setFontSize(11);
    doc.text(String(orgInfo.name).toUpperCase(), MARGIN, 40);
  }

  doc.setFont("times", "bold").setFontSize(15);
  doc.text("FORMULIR PERMINTAAN BARANG/JASA", pageW / 2, 52, { align: "center" });

  const tuvW = 78;
  doc.addImage(TUV_LOGO_DATA_URL, "PNG", pageW - MARGIN - tuvW, 22, tuvW, tuvW / TUV_LOGO_RATIO);

  // Penanda status bila belum final (supaya cetakan draft tidak tertukar)
  if (statusCode !== "CO") {
    doc.setFont("helvetica", "bold").setFontSize(7).setTextColor(200, 0, 0);
    doc.text(`Status: ${STATUS_MAP[statusCode] || statusCode}`, pageW - MARGIN, 74, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  // ── 2. Kotak info kiri (4 baris) & kotak Nama Supplier kanan ────────
  const boxY = 82;
  const rowH = 18;
  const boxW = 210;
  const rightX = pageW - MARGIN - boxW;

  doc.rect(MARGIN, boxY, boxW, rowH * 4);
  for (let i = 1; i < 4; i++) doc.line(MARGIN, boxY + rowH * i, MARGIN + boxW, boxY + rowH * i);

  const infoRows = [
    ["No. Permintaan", docNo],
    ["Tanggal", fmtDate(header.DateDoc)],
    ["Departemen", ""], // judul saja, isi dikosongkan
    ["Sub Divisi", ""],
  ];
  infoRows.forEach(([label, val], i) => {
    const ty = boxY + rowH * i + 12.5;
    doc.setFont("times", "bold").setFontSize(9.5);
    doc.text(label, MARGIN + 6, ty);
    doc.text(":", MARGIN + 92, ty);
    if (val) {
      doc.setFont("helvetica", "normal").setFontSize(8);
      doc.text(String(val), MARGIN + 100, ty);
    }
  });

  doc.rect(rightX, boxY, boxW, rowH * 4);
  doc.setFont("times", "bold").setFontSize(9.5);
  doc.text("Nama Supplier :", rightX + 6, boxY + 12.5);

  // ── 3. Tabel item (kolom penuh sampai bawah kotak) ──────────────────
  const tableTop = boxY + rowH * 4 + 10;
  const tableBottom = tableTop + TABLE_BODY_H;
  const fixed = [24, 236, 64, 68];
  const widths = [...fixed, usableW - fixed.reduce((a, b) => a + b, 0)];

  autoTable(doc, {
    startY: tableTop,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: pageH - tableBottom },
    theme: "plain",
    head: [["No", "Nama Barang", "Jumlah", "Satuan", "Keterangan"]],
    body: lines.map((l, idx) => [
      idx + 1,
      cleanIdentifier(l.M_Product_ID?.identifier) || "-",
      qtyFmt.format(l.QtyEntered ?? 0),
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
      3: { cellWidth: widths[3] },
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

  // ── 4. Kotak tanda tangan + QR (halaman terakhir) ───────────────────
  const sigTop = tableBottom + 14;
  const sigHeadH = 20;
  const sigBodyH = 94;
  const colW = usableW / signBoxes.length;

  signBoxes.forEach((box, i) => {
    const x = MARGIN + i * colW;
    const bodyTop = sigTop + sigHeadH;
    doc.setDrawColor(0, 0, 0).setLineWidth(0.8);
    doc.rect(x, sigTop, colW, sigHeadH);
    doc.rect(x, bodyTop, colW, sigBodyH);

    doc.setFont("times", "bold").setFontSize(10);
    doc.text(box.label, x + colW / 2, sigTop + 13.5, { align: "center" });

    const n = box.people.length;
    const multi = n > 1;
    const cellW = colW / n;
    const qrSize = multi ? 44 : 52;

    box.people.forEach((p, j) => {
      const cx = x + cellW * j + cellW / 2;

      if (multi) {
        if (j > 0) {
          doc.setDrawColor(190, 190, 190).setLineWidth(0.4);
          doc.line(x + cellW * j, bodyTop + 6, x + cellW * j, bodyTop + sigBodyH - 6);
          doc.setDrawColor(0, 0, 0).setLineWidth(0.8);
        }
        doc.setFont("helvetica", "bold").setFontSize(7);
        doc.text(p.role || "", cx, bodyTop + 10, { align: "center" });
      }

      if (!p.data || !p.qr) return;
      doc.addImage(p.qr, "PNG", cx - qrSize / 2, bodyTop + (multi ? 15 : 6), qrSize, qrSize);

      doc.setFont("helvetica", "bold").setFontSize(multi ? 6.5 : 7);
      const nameLines = doc.splitTextToSize(p.data.name, cellW - 6).slice(0, 2);
      doc.text(nameLines, cx, bodyTop + (multi ? 70 : 68), { align: "center", lineHeightFactor: 1.15 });

      doc.setFont("helvetica", "normal").setFontSize(multi ? 6.5 : 7);
      doc.text(fmtDate(p.data.date), cx, bodyTop + 88, { align: "center" });
    });
  });

  // ── 5. Catatan distribusi & kode form ───────────────────────────────
  const noteY = sigTop + sigHeadH + sigBodyH + 12;
  doc.setFont("helvetica", "normal").setFontSize(7);
  COPY_NOTES.forEach((t, i) => doc.text(t, MARGIN, noteY + i * 9));
  doc.setFontSize(8);
  doc.text(FORM_CODE, pageW - MARGIN, noteY, { align: "right" });

  // ── 6. Nomor halaman (bila lebih dari satu) ─────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  if (pageCount > 1) {
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(0, 0, 0);
      doc.text(`Hal ${p}/${pageCount}`, pageW - MARGIN, pageH - 16, { align: "right" });
    }
  }

  doc.save(`Requisition-${documentNo}.pdf`);
}