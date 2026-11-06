import ReactDOMServer from "react-dom/server";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";

const MAX_LOGO_WIDTH = 70;
const MAX_LOGO_HEIGHT = 58;

const getImageNaturalSize = (dataUrl) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = reject;
        img.src = dataUrl;
    });
};

const svgToPngDataUrl = (svgString, width, height) => {
    return new Promise((resolve, reject) => {
        const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = width * 2;
            canvas.height = height * 2;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = reject;
        img.src = url;
    });
};

function drawAbstractBackground(doc, pageWidth, pageHeight) {
    // 1. FOOTER ABSTRACT PATTERN
    doc.setFillColor(180, 20, 20);
    doc.lines(
        [
            [-150, -40, -300, 20, -450, 0],
            [0, 50],
            [450, 0]
        ],
        pageWidth, pageHeight - 50,
        [1, 1],
        "F"
    );

    doc.setFillColor(220, 38, 38);
    doc.lines(
        [
            [-200, 30, -350, -40, -pageWidth, -10],
            [0, 60],
            [pageWidth, 0]
        ],
        pageWidth, pageHeight - 50,
        [1, 1],
        "F"
    );

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(1.5);
    doc.lines(
        [
            [-180, 20, -320, -30, -pageWidth, -5]
        ],
        pageWidth, pageHeight - 45
    );

    // 2. HEADER ABSTRACT ACCENT
    doc.setFillColor(220, 38, 38);
    doc.triangle(0, 0, 120, 0, 0, 45, "F");

    doc.setFillColor(180, 20, 20);
    doc.triangle(0, 0, 60, 0, 0, 75, "F");

    doc.setFillColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1);
}

function drawLetterhead(doc, orgInfo, pageWidth) {
    const { logoDataUrl, logoDrawWidth, logoDrawHeight, name, address, addressLines, phone, email } = orgInfo || {};
    const marginRight = pageWidth - 20;

    doc.setFont(undefined, "bold").setFontSize(13);
    let maxTextWidth = name ? doc.getTextWidth(name) : 0;

    doc.setFont(undefined, "normal").setFontSize(8);
    const linesToPrint = (addressLines && addressLines.length > 0)
        ? addressLines
        : (address ? [address] : []);

    linesToPrint.forEach((line) => {
        const w = doc.getTextWidth(line);
        if (w > maxTextWidth) maxTextWidth = w;
    });

    if (phone) {
        const w = doc.getTextWidth(`Telp. ${phone}`);
        if (w > maxTextWidth) maxTextWidth = w;
    }
    if (email) {
        const w = doc.getTextWidth(`Email : ${email}`);
        if (w > maxTextWidth) maxTextWidth = w;
    }

    const textBlockMaxWidth = Math.max(maxTextWidth, 180);

    let logoBottom = 15;
    if (logoDataUrl) {
        const w = logoDrawWidth || MAX_LOGO_WIDTH;
        const h = logoDrawHeight || MAX_LOGO_HEIGHT;
        const logoX = marginRight - textBlockMaxWidth + 35 - w;
        doc.addImage(logoDataUrl, "PNG", logoX, 8, w, h);
        logoBottom = 8 + h;
    }

    let y = 18;
    if (name) {
        doc.setFont(undefined, "bold").setFontSize(13);
        doc.text(name, marginRight, y, { align: "right" });
        y += 14;
    }

    doc.setFont(undefined, "normal").setFontSize(8);
    linesToPrint.forEach((line) => {
        const wrapped = doc.splitTextToSize(line, textBlockMaxWidth);
        wrapped.forEach((wline) => {
            doc.text(wline, marginRight, y, { align: "right" });
            y += 10;
        });
    });
    if (phone) {
        doc.text(`Telp. ${phone}`, marginRight, y, { align: "right" });
        y += 10;
    }
    if (email) {
        doc.text(`Email : ${email}`, marginRight, y, { align: "right" });
        y += 10;
    }

    return Math.max(y, logoBottom) + 8;
}

export async function renderDocumentPDF(config) {
    const {
        title, subtitle,
        orgInfo,
        logo, logoDataUrl: providedLogoDataUrl,
        infoLeft = [], infoRight = [],
        table, history = [],
        verifyUrl, verifyCaption,
        filenamePrefix, documentNo,
        // OPSIONAL — blok tanda tangan basah di kolom paling kanan baris workflow.
        // Bentuk: { label: "Customer:", name: "Pemko" }. Bila tidak diisi, layout dokumen
        // lain (Invoice, dll.) sama persis seperti sebelumnya.
        signRight,
    } = config;

    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 200 });

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // 1. Draw Background & Kop Surat
    drawAbstractBackground(doc, pageWidth, pageHeight);

    let logoDataUrl = orgInfo?.logoUrl || providedLogoDataUrl || null;
    if (!logoDataUrl && logo) {
        const logoSvgString = ReactDOMServer.renderToStaticMarkup(logo);
        logoDataUrl = await svgToPngDataUrl(logoSvgString, 70, 42);
    }

    let logoDrawWidth = MAX_LOGO_WIDTH;
    let logoDrawHeight = MAX_LOGO_HEIGHT;
    if (logoDataUrl) {
        try {
            const { width, height } = await getImageNaturalSize(logoDataUrl);
            const scale = Math.min(MAX_LOGO_WIDTH / width, MAX_LOGO_HEIGHT / height);
            logoDrawWidth = width * scale;
            logoDrawHeight = height * scale;
        } catch (err) {
            console.warn('[renderDocumentPDF] Gagal baca dimensi logo:', err.message);
        }
    }

    let currentY;
    if (orgInfo?.name || orgInfo?.address || orgInfo?.addressLines?.length || orgInfo?.phone || orgInfo?.email || logoDataUrl) {
        currentY = drawLetterhead(doc, { ...orgInfo, logoDataUrl, logoDrawWidth, logoDrawHeight }, pageWidth);
    } else {
        currentY = 30;
    }

    // 2. Draw Title & Subtitle Dokumen
    doc.setFontSize(14).setFont(undefined, "bold");
    doc.text(title, pageWidth / 2, currentY + 15, { align: "center" });
    doc.setFontSize(8.5).setFont(undefined, "italic");
    doc.text(subtitle, pageWidth / 2, currentY + 28, { align: "center" });
    
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.8);
    doc.line(20, currentY + 36, pageWidth - 20, currentY + 36);

    // 3. Draw Info Left & Info Right (HANYA SEKALI RUNNING)
    currentY += 52;
    doc.setFont(undefined, "normal").setFontSize(8.5);
    
    const leftRows = infoLeft.length;
    const rightRows = infoRight.length;
    const maxRows = Math.max(leftRows, rightRows);

    infoLeft.forEach(([label, val], i) => {
        doc.text(label, 20, currentY + i * 14);
        doc.text(String(val), 85, currentY + i * 14);
    });

    infoRight.forEach(([label, val], i) => {
        doc.text(label, 320, currentY + i * 14);
        doc.text(String(val), 385, currentY + i * 14);
    });

    // 4. Hitung startY Tabel Agar Tepat Di Bawah Info Block
    const tableStartY = currentY + (maxRows * 14) + 12;

    // 5. Render Tabel (Header Warna Abu-Abu Medium)
    autoTable(doc, {
        startY: tableStartY,
        head: table.head,
        body: table.body,
        foot: table.foot,
        columnStyles: table.columnStyles,
        theme: 'grid',
        styles: {
            fontSize: 8,
            cellPadding: 4,
            ...table.styles,
        },
        headStyles: {
            fillColor: [100, 100, 100], // Warna Abu-abu Header Tabel
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            ...table.headStyles,
        },
        footStyles: {
            fillColor: [245, 245, 245],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            lineWidth: 0.5,
            lineColor: [200, 200, 200],
            ...table.footStyles,
        },
        margin: { left: 20, right: 20 },
    });

    let finalY = doc.lastAutoTable.finalY + 20;

    // 6. Section Workflow / Approval
    if (finalY + (signRight ? 135 : 100) > pageHeight) {
        doc.addPage();
        drawAbstractBackground(doc, pageWidth, pageHeight);
        finalY = 40;
    }

    doc.setFont(undefined, "bold").setFontSize(10);
    doc.text("Approval / Workflow", 20, finalY);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1);
    doc.line(20, finalY + 6, pageWidth - 20, finalY + 6);
    finalY += 20;

    const marginLeft = 20, marginRight = 20;
    const usableWidth = pageWidth - marginLeft - marginRight;
    const colWidth = usableWidth / 5;
    // Dengan signRight, kolom paling kanan dicadangkan untuk blok tanda tangan,
    // histori memakai 4 kolom pertama. Jarak nama user diperlebar sebagai ruang TTD basah.
    const colCount = signRight ? 4 : 5;
    const rowHeight = signRight ? 85 : 65;
    const userOffset = signRight ? 48 : 22;

    history.forEach((h, idx) => {
        const col = idx % colCount;
        const row = Math.floor(idx / colCount);
        const x = marginLeft + col * colWidth;
        const yy = finalY + row * rowHeight;

        if (row > 0 && col === 0) {
            doc.setLineDashPattern([2, 2], 0);
            doc.setDrawColor(150, 150, 150);
            doc.line(20, yy - 10, pageWidth - 20, yy - 10);
            doc.setLineDashPattern([], 0);
            doc.setDrawColor(0, 0, 0);
        }

        const maxTextWidth = colWidth - 5;
        doc.setFont(undefined, "bold").setFontSize(7.5);
        const splitNode = doc.splitTextToSize(h.nodeName || "-", maxTextWidth);
        doc.text(splitNode, x, yy);
        const nodeHeightOffset = (splitNode.length - 1) * 9;

        doc.setFont(undefined, "normal").setFontSize(7.5);
        const splitUser = doc.splitTextToSize(h.userName || "-", maxTextWidth);
        const userY = yy + userOffset + nodeHeightOffset;
        doc.text(splitUser, x, userY);

        const textWidth = doc.getTextWidth(splitUser[0] || "");
        doc.line(x, userY + 2, x + Math.min(textWidth, maxTextWidth), userY + 2);

        const userHeightOffset = (splitUser.length - 1) * 9;
        doc.text(h.date || "-", x, userY + 15 + userHeightOffset);
    });

    // Blok tanda tangan kanan (mis. Customer) — rata kanan kertas, sejajar baris pertama histori.
    if (signRight) {
        const rightX = pageWidth - marginRight;
        const signMaxWidth = colWidth * 1.4;

        doc.setFont(undefined, "bold").setFontSize(7.5);
        doc.text(signRight.label || "", rightX, finalY, { align: "right" });

        // Samakan baris nama dengan nama user di histori (baris pertama)
        let row0NodeOffset = 0;
        history.slice(0, colCount).forEach((h) => {
            const n = doc.splitTextToSize(h.nodeName || "-", colWidth - 5).length;
            row0NodeOffset = Math.max(row0NodeOffset, (n - 1) * 9);
        });

        doc.setFont(undefined, "normal").setFontSize(7.5);
        const nameLines = doc.splitTextToSize(String(signRight.name || "-"), signMaxWidth);
        const nameY = finalY + userOffset + row0NodeOffset;
        doc.text(nameLines, rightX, nameY, { align: "right" });
        const nameW = Math.min(doc.getTextWidth(nameLines[0] || ""), signMaxWidth);
        doc.line(rightX - nameW, nameY + 2, rightX, nameY + 2);
    }

    const totalRows = Math.ceil(history.length / colCount);
    finalY += (totalRows > 0 ? totalRows : 1) * rowHeight;

    // 7. Verification Section & QR
    if (finalY + 90 > pageHeight) {
        doc.addPage();
        drawAbstractBackground(doc, pageWidth, pageHeight);
        finalY = 40;
    }

    doc.setFont(undefined, "bold").setFontSize(9);
    doc.text("Verifikasi Dokumen Digital", pageWidth / 2, finalY, { align: "center" });
    doc.addImage(qrDataUrl, "PNG", pageWidth / 2 - 30, finalY + 10, 60, 60);
    doc.setFont(undefined, "normal").setFontSize(6.5);
    if (verifyCaption) {
        doc.text(String(verifyCaption).replace("{documentNo}", documentNo ?? ""), pageWidth / 2, finalY + 78, { align: "center" });
    }

    // 8. Bottom Footer
    doc.setFont(undefined, "italic").setFontSize(7);
    doc.text(
        `Dokumen ini dicetak otomatis dari sistem dan sah tanpa tanda tangan basah selama status approval di atas terverifikasi pada sistem - dicetak ${new Date().toLocaleDateString("id-ID")}`,
        pageWidth / 2, pageHeight - 20, { align: "center" }
    );

    doc.save(`${filenamePrefix}-${documentNo}.pdf`);
}