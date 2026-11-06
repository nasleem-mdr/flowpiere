import { useState } from "react";
import { useChangeRole } from "@/shared/hooks/useChangeRole";
import { AlertIcon, ArrowIcon } from "@/shared/components/icon";
import "@/css/Login.css"; // reuse styling .field, .btn-primary, dst

export default function ChangeRoleModal({ token, onClose, onSuccess }) {
  const {
    selectedRoleId,
    selectedOrgId,
    selectedWarehouseId,
    roles,
    orgs,
    warehouses,
    loading,
    error,
    handleRoleChange,
    handleOrgChange,
    setSelectedWarehouseId,
    submitChangeRole,
  } = useChangeRole(token);

  const [language, setLanguage] = useState(
    localStorage.getItem("AD_Language") || "en_US"
  );

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const data = await submitChangeRole(language);
      onSuccess({
        token: data.token,
        roleId: parseInt(selectedRoleId, 10),
        roleName: roles.find((r) => String(r.id) === selectedRoleId)?.name || selectedRoleId,
        orgId: parseInt(selectedOrgId, 10),
        orgName: orgs.find((o) => String(o.id) === selectedOrgId)?.name || selectedOrgId,
        warehouseId: selectedWarehouseId ? parseInt(selectedWarehouseId, 10) : null,
        language,
      });
    } catch {
      // error sudah ditangani & ditampilkan lewat state `error` dari hook
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-title">Ganti Role</div>
        <div className="card-sub">Pilih role, organisasi, dan warehouse baru untuk sesi ini.</div>

        {error && (
          <div className="error-box">
            <AlertIcon />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* ROLE */}
          <div className="field">
            <label className="field-label">Role</label>
            <select
              className="field-input"
              value={selectedRoleId}
              onChange={(e) => handleRoleChange(e.target.value)}
              disabled={loading}
            >
              <option value="">— Pilih Role —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* ORGANISASI */}
          <div className="field">
            <label className="field-label">Organisasi</label>
            <select
              className="field-input"
              value={selectedOrgId}
              onChange={(e) => handleOrgChange(e.target.value)}
              disabled={!selectedRoleId || loading}
            >
              <option value="">
                {!selectedRoleId ? "— Pilih Role dulu —" : "— Pilih Organisasi —"}
              </option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          {/* WAREHOUSE */}
          <div className="field">
            <label className="field-label">
              Warehouse{" "}
              <span style={{ color: "#484f58", fontWeight: 300 }}>(opsional)</span>
            </label>
            <select
              className="field-input"
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              disabled={!selectedOrgId || loading}
            >
              <option value="">— Tidak ada / Semua —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* BAHASA */}
          <div className="field">
            <label className="field-label">Bahasa Antarmuka</label>
            <select
              className="field-input"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={loading}
            >
              <option value="en_US">English (US)</option>
              <option value="id_ID">Bahasa Indonesia</option>
              <option value="es_ES">Español</option>
            </select>
          </div>

          <div className="btn-row">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Batal
            </button>
            <button
              className="btn-primary"
              type="submit"
              disabled={loading || !selectedRoleId || !selectedOrgId}
            >
              {loading ? (
                <>
                  <div className="spinner" />
                  Memproses...
                </>
              ) : (
                <>
                  Terapkan <ArrowIcon />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}