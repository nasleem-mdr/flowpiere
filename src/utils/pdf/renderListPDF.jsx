import ReactDOMServer from "react-dom/server";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { svgToPngDataUrl } from "./svgToPngDataUrl";

// Ukuran maksimum kotak logo di kop surat (pt). Logo asli di-scale
// proporsional supaya pas di dalam kotak ini tanpa gepeng/gemuk.
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

/**
 * Menggambar elemen hiasan abstrak (waves/lines) di header dan footer secara langsung
 */
function drawAbstractBackground(doc, pageWidth, pageHeight) {
    // -------------------------------------------------------------
    // 1. FOOTER ABSTRACT PATTERN (Sudut Kanan Bawah & Bottom Wave)
    // -------------------------------------------------------------
    doc.setFillColor(180, 20, 20); // Merah tua
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

    doc.setFillColor(220, 38, 38); // Red-600
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

    // -------------------------------------------------------------
    // 2. HEADER ABSTRACT ACCENT (Sudut Kiri Atas - Top Left)
    // -------------------------------------------------------------
    doc.setFillColor(220, 38, 38);
    doc.triangle(0, 0, 120, 0, 0, 45, "F");

    doc.setFillColor(180, 20, 20);
    doc.triangle(0, 0, 60, 0, 0, 75, "F");

    // Reset warna stroke & fill ke default (Hitam)
    doc.setFillColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1);
}

/**
 * Kop surat generik: logo dan teks organisasi diatur mepet ke kanan.
 * Logo digambar tepat di sebelah kiri dari blok nama/alamat organisasi.
 */
function drawLetterhead(doc, orgInfo, pageWidth) {
    const { logoDataUrl, logoDrawWidth, logoDrawHeight, name, address, addressLines, phone, email } = orgInfo || {};
    const marginRight = pageWidth - 20;

    // 1. Hitung lebar maksimum teks agar tahu posisi X logo di sebelah kiri teks
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

    // 2. Gambar Logo mepet di sebelah kiri blok teks nama & alamat
    let logoBottom = 15;
    if (logoDataUrl) {
        const w = logoDrawWidth || MAX_LOGO_WIDTH;
        const h = logoDrawHeight || MAX_LOGO_HEIGHT;
        const logoX = marginRight - textBlockMaxWidth + 35 - w;
        doc.addImage(logoDataUrl, "PNG", logoX, 8, w, h);
        logoBottom = 8 + h;
    }

    // 3. Cetak Teks Organisasi (Rata Kanan)
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

/**
 * @param {Object} config
 * @param {string} config.title            - mis. "DAFTAR SALES"
 * @param {Object} [config.orgInfo]        - Hasil dari useOrgInfo()
 * @param {JSX.Element} [config.logo]      - Fallback logo SVG
 * @param {string} [config.logoDataUrl]    - Fallback logo dataURL
 * @param {string} [config.orgName]        - Fallback legacy nama org
 * @param {string} [config.orgAddress]     - Fallback legacy alamat org
 * @param {string} [config.orgPhone]       - Fallback legacy phone
 * @param {string} [config.orgEmail]       - Fallback legacy email
 * @param {string} config.periodLabel      - mis. "PERIODE : 01/01/2026 – 31/01/2026"
 * @param {Array}  config.columns          - Definisi kolom tabel
 * @param {Array}  config.rows             - Data baris tabel
 * @param {string} [config.totalLabel]     - Total label (opsional)
 * @param {string} [config.totalValue]     - Total value (opsional)
 * @param {string} config.filenamePrefix   - Nama prefix file
 */
export async function renderListPDF(config) {
    const {
        title, logo, logoDataUrl: providedLogoDataUrl,
        orgInfo: providedOrgInfo,
        orgName, orgAddress, orgPhone, orgEmail,
        periodLabel,
        columns, rows,
        totalLabel, totalValue,
        filenamePrefix,
    } = config;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 20, marginRight = 20;
    const usableWidth = pageWidth - marginLeft - marginRight;

    // Normalisasi orgInfo (dukung data baru orgInfo maupun opsi legacy individual)
    const orgInfo = {
        name: providedOrgInfo?.name || orgName,
        address: providedOrgInfo?.address || orgAddress,
        addressLines: providedOrgInfo?.addressLines,
        phone: providedOrgInfo?.phone || orgPhone,
        email: providedOrgInfo?.email || orgEmail,
        logoUrl: providedOrgInfo?.logoUrl || providedLogoDataUrl
    };

    let logoDataUrl = orgInfo.logoUrl || null;
    if (!logoDataUrl && logo) {
        const logoSvgString = ReactDOMServer.renderToStaticMarkup(logo);
        logoDataUrl = await svgToPngDataUrl(logoSvgString, 70, 42);
    }

    // Hitung proporsi ukuran logo
    let logoDrawWidth = MAX_LOGO_WIDTH;
    let logoDrawHeight = MAX_LOGO_HEIGHT;
    if (logoDataUrl) {
        try {
            const { width, height } = await getImageNaturalSize(logoDataUrl);
            const scale = Math.min(MAX_LOGO_WIDTH / width, MAX_LOGO_HEIGHT / height);
            logoDrawWidth = width * scale;
            logoDrawHeight = height * scale;
        } catch (err) {
            console.warn('[renderListPDF] Gagal baca dimensi logo:', err.message);
        }
    }

    // Hitung sisa kolom fleksibel ('flex')
    doc.setFontSize(8);
    const autoWidths = {};
    let flexKey = null;
    columns.forEach(col => {
        if (col.width === 'flex') {
            flexKey = col.key;
        } else if (typeof col.width === 'number') {
            autoWidths[col.key] = col.width;
        } else {
            const headerW = doc.getTextWidth(String(col.label));
            const maxBodyW = rows.reduce((m, r) => Math.max(m, doc.getTextWidth(String(r[col.key] ?? ''))), 0);
            autoWidths[col.key] = Math.max(headerW, maxBodyW) + 20;
        }
    });

    const usedByAuto = Object.values(autoWidths).reduce((s, w) => s + w, 0);
    if (flexKey) {
        autoWidths[flexKey] = Math.max(usableWidth - usedByAuto, 60);
    }

    const columnStyles = {};
    columns.forEach((col, idx) => {
        columnStyles[idx] = {
            cellWidth: autoWidths[col.key],
            halign: col.align || 'left',
        };
    });

    const head = [columns.map(c => c.label)];
    const body = rows.map(r => columns.map(c => String(r[c.key] ?? '-')));
    const foot = (totalLabel && totalValue != null)
        ? [[
            { content: totalLabel, colSpan: columns.length - 1, styles: { halign: 'right', fontStyle: 'bold' } },
            { content: String(totalValue), styles: { halign: columns[columns.length - 1].align || 'right', fontStyle: 'bold' } },
        ]]
        : undefined;

    // Fungsi Penggambar Header + Kop Surat + Title Laporan
    const drawFullHeader = () => {
        // 1. Abstract background layer paling dasar
        drawAbstractBackground(doc, pageWidth, pageHeight);

        // 2. Kop Surat (Logo & Info Perusahaan Rata Kanan)
        let headerBottomY = 20;
        if (orgInfo.name || orgInfo.address || orgInfo.phone || orgInfo.email || logoDataUrl) {
            headerBottomY = drawLetterhead(doc, { ...orgInfo, logoDataUrl, logoDrawWidth, logoDrawHeight }, pageWidth);
        }

        // 3. Judul Laporan & Periode
        const headerCenterX = pageWidth / 2;
        doc.setFontSize(13).setFont(undefined, "bold");
        doc.text(title, headerCenterX, headerBottomY + 12, { align: "center" });

        let currentY = headerBottomY + 12;
        if (periodLabel) {
            currentY += 14;
            doc.setFontSize(8.5).setFont(undefined, "italic");
            doc.text(periodLabel, headerCenterX, currentY, { align: "center" });
        }

        // Garis pemisah tegas di bawah header sebelum tabel
        currentY += 10;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.75);
        doc.line(marginLeft, currentY, pageWidth - marginRight, currentY);
        doc.setLineWidth(0.5);

        return currentY + 10; // Mengembalikan offset awal untuk startY AutoTable
    };

    // Hitung posisi awal tabel di halaman pertama
    const startTableY = drawFullHeader();

    autoTable(doc, {
        startY: startTableY,
        head, body, foot,
        theme: "striped",
        styles: { fontSize: 8, cellPadding: 5, lineColor: [0, 0, 0], lineWidth: 0.5 },
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", lineWidth: 0.5, lineColor: [0, 0, 0] },
        footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.5, lineColor: [0, 0, 0] },
        columnStyles,
        margin: { left: marginLeft, right: marginRight, top: startTableY },
        // Header & background otomatis digambar ulang di tiap halaman berikutnya
        didDrawPage: (data) => {
            if (data.pageNumber > 1) {
                drawFullHeader();
            }
        },
    });

    doc.save(`${filenamePrefix}.pdf`);
}