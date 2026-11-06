import QRCode from "qrcode";
import jsPDF from "jspdf";

import { idempiereApi, getProductImageBlobUrls } from "@/api/idempiereApi";

// ---------- Brand palette (sesuaikan dengan warna resmi Sekupang Logistics) ----------
const BRAND = {
  orange: [246, 166, 35],
  navy: [26, 38, 91],
  white: [255, 255, 255],
  grey: [128, 128, 128],
  textDark: [30, 30, 30],
};

// ─── Helper kecil ─────────────────────────────────────────────────────────
function isYes(val) {
  return val === true || val === "Y" || val === "true";
}

// Menerima blob URL maupun data URL (mis. logoUrl dari useOrgInfo).
// Hasilnya selalu dikonversi ke PNG lewat canvas, jadi aman untuk logo JPG/PNG/WebP.
export function blobUrlToImageData(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve({
        dataUrl: canvas.toDataURL("image/png"),
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function drawImageContained(doc, img, boxX, boxWidth, boxY, boxHeight) {
  const ratio = Math.min(boxWidth / img.width, boxHeight / img.height);
  const drawW = img.width * ratio;
  const drawH = img.height * ratio;
  const drawX = boxX + (boxWidth - drawW) / 2;
  const drawY = boxY + (boxHeight - drawH) / 2;
  doc.addImage(img.dataUrl, "PNG", drawX, drawY, drawW, drawH);
}

function drawBrandBackground(doc, pageWidth, pageHeight) {
  const { orange, navy, grey, white } = BRAND;
  doc.setFillColor(...orange);
  doc.rect(0, 0, pageWidth, 30, "F");
  doc.setFillColor(...white);
  doc.triangle(pageWidth * 0.44, 0, pageWidth, 0, pageWidth, 65, "F");
  doc.triangle(pageWidth * 0.44, 0, pageWidth, 65, pageWidth * 0.61, 65, "F");
  doc.setFillColor(...orange);
  doc.triangle(pageWidth * 0.45, 0, pageWidth, 0, pageWidth, 65, "F");
  doc.triangle(pageWidth * 0.45, 0, pageWidth, 65, pageWidth * 0.62, 65, "F");
  doc.setFillColor(...white);
  doc.circle(pageWidth - 12, 2, 112, "F");
  doc.setFillColor(...navy);
  doc.circle(pageWidth - 10, 0, 110, "F");
  doc.setFillColor(...white);
  doc.circle(pageWidth - 45, 40, 32, "F");
  doc.setFillColor(...grey);
  const opacity50 = new doc.GState({ opacity: 0.5 });
  doc.setGState(opacity50);
  doc.circle(400, pageHeight - 20, 150, "F");
  const opacityFull = new doc.GState({ opacity: 1.0 });
  doc.setGState(opacityFull);
  doc.setFillColor(...white);
  doc.circle(420, pageHeight - 30, 130, "F");
  doc.setFillColor(...orange);
  doc.rect(0, pageHeight - 20, pageWidth, 40, "F");
  doc.setFillColor(...white);
  doc.circle(-33, pageHeight + 27, 140, "F");
  doc.setFillColor(...navy);
  doc.circle(-35, pageHeight + 30, 140, "F");
}

// ─── Fungsi utama ─────────────────────────────────────────────────────────
/**
 * @param {string|number} productId
 * @param {{ logoUrl?: string|null }} [options]  logoUrl dari useOrgInfo().orgInfo.logoUrl
 */
export async function generateProductPDF(productId, { logoUrl = null } = {}) {
  const product = await idempiereApi(
    `/models/m_product/${productId}` +
    `?$select=Value,Name,Description,UPC,IsPurchased,IsSold,M_Product_Category_ID,UpdatedBy,Updated`
  );

  let blobUrls = [];
  const images = [];
  try {
    blobUrls = await getProductImageBlobUrls(productId);
    const first2 = (blobUrls || []).slice(0, 2);
    for (const item of first2) {
      try {
        const imgData = await blobUrlToImageData(item.url);
        images.push(imgData);
      } catch (imgErr) {
        console.error("Gagal memuat gambar produk:", imgErr.message);
      }
    }
  } catch (err) {
    console.error("Gagal fetch gambar produk:", err.message);
  } finally {
    (blobUrls || []).forEach((i) => URL.revokeObjectURL(i.url));
  }

  const qrValue = product.UPC || product.Value || String(productId);
  const qrDataUrl = await QRCode.toDataURL(qrValue, { margin: 1, width: 300 });

  // Logo organisasi (opsional) — kalau kosong/gagal dimuat, PDF tetap dibuat tanpa logo
  let logo = null;
  if (logoUrl) {
    try {
      logo = await blobUrlToImageData(logoUrl);
    } catch (err) {
      console.warn("Gagal memuat logo organisasi:", err?.message);
    }
  }

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 55;
  const marginRight = 40;
  const usableWidth = pageWidth - marginLeft - marginRight;

  drawBrandBackground(doc, pageWidth, pageHeight);
  if (logo) drawImageContained(doc, logo, pageWidth - 75, 58, 20, 38);

  doc.setTextColor(...BRAND.textDark);
  doc.setFontSize(22).setFont(undefined, "bold");
  doc.text("Catalogue Product/Service", marginLeft, 60);

  let y = 105;
  const qrSize = 90;
  doc.addImage(qrDataUrl, "PNG", marginLeft, y, qrSize, qrSize);

  const isPurchasedLabel = isYes(product.IsPurchased) ? "Yes" : "No";
  const isSoldLabel = isYes(product.IsSold) ? "Yes" : "No";
  const infoX = marginLeft + qrSize + 25;
  const colonX = infoX + 90;
  const valueX = infoX + 100;
  let infoY = y + 15;
  const lineHeight = 20;

  doc.setFontSize(11);
  const drawField = (label, value) => {
    doc.setFont(undefined, "bold");
    doc.text(label, infoX, infoY);
    doc.text(":", colonX, infoY);
    doc.setFont(undefined, "normal");
    doc.text(String(value ?? "-"), valueX, infoY);
    infoY += lineHeight;
  };

  drawField("Value/Search", product.Value);
  drawField("Name", product.Name);
  drawField("isPurchased", isPurchasedLabel);
  drawField("isSold", isSoldLabel);

  y += qrSize + 30;

  const imgAreaHeight = 240;
  const boxRadius = 14;
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(2.5);
  doc.roundedRect(marginLeft, y, usableWidth, imgAreaHeight, boxRadius, boxRadius, "S");

  const innerPad = 18;
  const innerX = marginLeft + innerPad;
  const innerY = y + innerPad;
  const innerWidth = usableWidth - innerPad * 2;
  const innerHeight = imgAreaHeight - innerPad * 2;

  if (images.length === 1) {
    const boxWidth = innerWidth * 0.6;
    const boxX = innerX + (innerWidth - boxWidth) / 2;
    drawImageContained(doc, images[0], boxX, boxWidth, innerY, innerHeight);
  } else if (images.length === 2) {
    const halfWidth = innerWidth / 2;
    drawImageContained(doc, images[0], innerX, halfWidth - 10, innerY, innerHeight);
    drawImageContained(doc, images[1], innerX + halfWidth + 10, halfWidth - 10, innerY, innerHeight);
    doc.setDrawColor(20, 20, 20);
    doc.setLineWidth(1);
    doc.line(marginLeft + usableWidth / 2, innerY, marginLeft + usableWidth / 2, innerY + innerHeight);
  } else {
    doc.setFont(undefined, "italic").setFontSize(9);
    doc.text("Tidak ada gambar terlampir", pageWidth / 2, y + imgAreaHeight / 2, { align: "center" });
  }

  y += imgAreaHeight + 25;

  doc.setFontSize(11).setFont(undefined, "bold");
  doc.setTextColor(...BRAND.textDark);
  doc.text("Description:", marginLeft, y);
  y += 16;

  doc.setFont(undefined, "normal").setFontSize(10.5);
  const descText = product.Description || "-";
  const descLines = doc.splitTextToSize(descText, usableWidth);
  doc.text(descLines, marginLeft, y);
  y += descLines.length * 14;

  const updatedBy = product.UpdatedBy?.identifier || "-";
  const updatedDate = product.Updated
    ? new Date(product.Updated).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "-";

  doc.setFont(undefined, "bold").setFontSize(10);
  doc.setTextColor(...BRAND.textDark);
  doc.text(`Update by: ${updatedBy}`, 350, pageHeight - 52, { align: "left" });
  doc.text(`Update Date: ${updatedDate}`, 350, pageHeight - 32, { align: "left" });
  doc.text(`www.sekupanglogistics.com`, pageWidth / 2 + 10, pageHeight - 6, { align: "center" });

  doc.save(`Product-${product.Value || productId}.pdf`);
}