import '@/css/OrgLetterhead.css';

/**
 * Kop surat HTML — padanan visual dari drawLetterhead() di renderDocumentPDF.jsx
 * (jsPDF), dipakai untuk dokumen yang dirender sebagai HTML lalu dicetak /
 * di-screenshot ke PDF (mis. Laporan Keuangan, atau laporan HTML lain).
 *
 * Layout: logo mepet di kiri blok teks, blok (logo + nama + alamat + kontak)
 * rata-kanan sebagai satu kesatuan — sama seperti kop pada dokumen PO/PI/SI.
 * Datanya murni dari orgInfo (hasil useOrgInfo()), tidak ada teks perusahaan
 * yang di-hardcode di sini.
 *
 * @param {Object} props
 * @param {Object} props.orgInfo - hasil useOrgInfo(): { name, address, addressLines, phone, email, logoUrl }
 */
export default function OrgLetterhead({ orgInfo }) {
  if (!orgInfo) return null;
  const { logoUrl, name, address, addressLines, phone, email } = orgInfo;

  const linesToPrint = (addressLines && addressLines.length > 0)
    ? addressLines
    : (address ? [address] : []);

  if (!logoUrl && !name && linesToPrint.length === 0 && !phone && !email) return null;

  return (
    <div className="org-letterhead">
      {logoUrl && (
        <img src={logoUrl} alt={name || 'Logo'} className="org-letterhead-logo" />
      )}
      <div className="org-letterhead-text">
        {name && <p className="org-letterhead-name">{name}</p>}
        {linesToPrint.map((line, i) => (
          <p key={i} className="org-letterhead-address">{line}</p>
        ))}
        {phone && <p className="org-letterhead-line">Telp. {phone}</p>}
        {email && <p className="org-letterhead-line">Email : {email}</p>}
      </div>
    </div>
  );
}