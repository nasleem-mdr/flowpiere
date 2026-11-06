// PurchasingView.jsx , ini adalah modul khusus untuk menampilkan status document dengan
// Scan qrcode, ini menggunakan aServlet/WebService custom khusus yang tidak perlu login
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

const STATUS_CONFIG = {
  CO: { label: "Completed",   dot: "#16a34a", pill: { background: "#f0fdf4", color: "#15803d" } },
  CL: { label: "Closed",      dot: "#9ca3af", pill: { background: "#f3f4f6", color: "#4b5563" } },
  DR: { label: "Draft",       dot: "#facc15", pill: { background: "#fefce8", color: "#a16207" } },
  IP: { label: "In Progress", dot: "#3b82f6", pill: { background: "#eff6ff", color: "#1d4ed8" } },
  RE: { label: "Rejected",    dot: "#ef4444", pill: { background: "#fef2f2", color: "#b91c1c" } },
  VO: { label: "Voided",      dot: "#ef4444", pill: { background: "#fef2f2", color: "#b91c1c" } },
};
function getStatus(docStatus, docStatusLabel) {
  return STATUS_CONFIG[docStatus] ?? {
    label: docStatusLabel || docStatus || "Unknown",
    dot: "#9ca3af",
    pill: { background: "#f3f4f6", color: "#4b5563" },
  };
}

export default function PurchasingView() {
  const { uuid } = useParams();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uuid) {
      setError("UUID tidak ditemukan di URL.");
      setLoading(false);
      return;
    }
    fetchDoc();
  }, [uuid]);

  async function fetchDoc() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/public/order/${uuid}`);
      const data = await res.json();

      // DEBUG sementara - hapus setelah warna jalan
      console.log("docStatus:", data.docStatus);
      console.log("docStatusLabel:", data.docStatusLabel);

      if (!res.ok) throw new Error(data.error);
      setDoc(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div style={s.center}>Memuat dokumen…</div>;
  if (error)   return <div style={{ ...s.center, color: "#dc2626" }}>{error}</div>;
  if (!doc)    return null;

  // Sekarang doc sudah pasti ada - aman diakses di dalam component
  const status = getStatus(doc.docStatus, doc.docStatusLabel);

  return (
    <div style={s.page}>
      <div style={s.card}>

        {/* Header */}
        <div style={s.header}>
          <Logo />
          <div style={s.headerText}>
            <p style={s.eyebrow}>Formulir Purchase Order</p>
            <h1 style={s.docNo}>{doc.documentNo}</h1>
          </div>
        </div>

        {/* Status */}
        <div style={s.cell}>
          <p style={s.label}>Status</p>
          <span style={{ ...s.badge, background: status.pill.background, color: status.pill.color }}>
          <span style={{ ...s.dot, background: status.dot }} />
          {status.label}  {/* sudah include label dari STATUS_CONFIG atau fallback */}
        </span>
        </div>

        {/* Tanggal & Organisasi */}
        <div style={s.row}>
          <div style={{ ...s.cell, ...s.cellLeft }}>
            <p style={s.label}>Tanggal Dokumen</p>
            <p style={s.value}>{formatDate(doc.docDate)}</p>
          </div>
          <div style={{ ...s.cell, flex: 1 }}>
            <p style={s.label}>Organisasi</p>
            <p style={s.value}>{doc.orgName || "—"}</p>
          </div>
        </div>

        {/* Deskripsi */}
        <div style={{ ...s.cell, borderBottom: "none" }}>
          <p style={s.label}>Deskripsi</p>
          <p style={s.desc}>{doc.description || "—"}</p>
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <div style={s.footerDivider}>
            <span style={s.footerDividerLine} />
            <ShieldCheckIcon />
            <span style={s.footerDividerLine} />
          </div>
          <p style={s.footerTitle}>Dokumen terverifikasi</p>
          <p style={s.footerText}>
            Hasil pemindaian QR resmi dari sistem SMA&nbsp;App.
            <br />
            Hubungi bagian Purchasing bila ada pertanyaan.
          </p>
        </div>

      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────── */

function Logo() {
  return (
    <svg width="44" height="44" viewBox="0 0 23.812 23.813" xmlns="http://www.w3.org/2000/svg">
      <g transform="matrix(.81511 0 0 .81511 -2.3477 1.9722)">
        <path
          d="m18.405 9.3341c5.7093-4.665 13.135-0.097258 11.077 4.9796-3.1133 7.681-18.099 7.4839-22.117 2.2965 8.6887 3.4129 15.146-0.016114 16.343-2.0055 0.60998-1.0135 2.3813-4.6259-5.3037-5.2705z"
          fill="currentColor"
        />
        <path
          d="m16.569 15.041c-5.7093 4.665-13.135 0.097257-11.077-4.9796 3.1133-7.681 18.099-7.4839 22.117-2.2965-8.6887-3.4129-15.146 0.016111-16.343 2.0055-0.60998 1.0135-2.3813 4.6259 5.3037 5.2705z"
          fill="#ff0000"
        />
      </g>
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9ca3af"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

/* ── Helpers ────────────────────────────────────────────── */

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

/* ── Styles ─────────────────────────────────────────────── */

const BORDER = "1px solid #f3f4f6";

const s = {
  page: {
    minHeight: "100%",
    width: "100%",
    background: "#f9fafb",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "20px 16px",
    boxSizing: "border-box",
  },
  card: {
    width: "100%",
    maxWidth: "380px",
    background: "#fff",
    borderRadius: "0 0 0 0",
    border: "1px solid #e5e7eb",
    overflow: "hidden",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    padding: "28px 20px 22px",
    borderBottom: BORDER,
  },
  headerText: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
  },
  eyebrow: {
    margin: 0,
    fontSize: "10px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.09em",
    color: "#9ca3af",
  },
  docNo: {
    margin: 0,
    fontSize: "15px",
    fontWeight: 600,
    color: "#111827",
    letterSpacing: "-0.01em",
  },
  row: {
    display: "flex",
    borderBottom: BORDER,
  },
  cell: {
    padding: "13px 20px",
    borderBottom: BORDER,
  },
  cellLeft: {
    flex: 1,
    borderRight: BORDER,
    borderBottom: "none",
  },
  label: {
    margin: "0 0 6px",
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#9ca3af",
  },
  value: {
    margin: 0,
    fontSize: "13px",
    fontWeight: 500,
    color: "#1f2937",
  },
  desc: {
    margin: 0,
    fontSize: "13px",
    fontWeight: 400,
    color: "#6b7280",
    lineHeight: 1.5,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    fontWeight: 500,
    padding: "4px 10px",
    borderRadius: "99px",
  },
  dot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  footer: {
    padding: "18px 24px 22px",
    textAlign: "center",
    background: "#fafafa",
  },
  footerDivider: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    marginBottom: "10px",
  },
  footerDividerLine: {
    height: "1px",
    width: "28px",
    background: "#e5e7eb",
    display: "inline-block",
  },
  footerTitle: {
    margin: "0 0 4px",
    fontSize: "11px",
    fontWeight: 600,
    color: "#4b5563",
    letterSpacing: "0.01em",
  },
  footerText: {
    margin: 0,
    fontSize: "10.5px",
    color: "#9ca3af",
    lineHeight: 1.6,
  },
  center: {
    minHeight: "300px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7280",
    fontSize: "14px",
  },
};