import { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';

import { 
  LogoIconW, 
  ArrowIcon, 
  EyeIcon, 
  CheckIcon, 
  AlertIcon 
} from '@/shared/components/icon';

import { 
  apiLogin, 
  apiGetRoles, 
  apiGetOrganizations, 
  normaliseList, 
  apiGetWarehouses, 
  apiSetSession, 
  sortById
} from '@/api/idempiereAuth';

import '@/css/Login.css';


// ─── Main Component ───────────────────────────────────────────────────────────
export default function IDempiereAuth({ onLoginSuccess }) {
  const [step, setStep] = useState(1);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionData, setSessionData] = useState(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const navigate = useNavigate();

  // Step 1
  const [form1, setForm1] = useState({ username: "", password: "" });

  // Auth data
  const [token, setToken] = useState("");
  const [clients, setClients] = useState([]);
  const [roles, setRoles] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [language, setLanguage] = useState("en_US");

  // Step 2 selections
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");

  const updateForm1 = (k) => (e) => setForm1((p) => ({ ...p, [k]: e.target.value }));

  // Auto-collapse di mobile
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile) setLeftOpen(false);
  }, []);

  // Auto-select client pertama (urut AD_Client_ID) begitu data clients tersedia
  // setelah login, lalu cascade otomatis ke role → organisasi → warehouse.
  useEffect(() => {
    if (clients.length > 0 && !selectedClientId) {
      const sorted = sortById(clients);
      setClients(sorted);
      handleClientChange(String(sorted[0].id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients]);

  // ── Step 1: Login ─────────────────────────────────────────────────────────
  async function handleStep1(e) {
    e.preventDefault();
    if (!form1.username || !form1.password) {
      setError("Username dan password wajib diisi.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await apiLogin(form1.username, form1.password);
      setToken(data.token);
      setClients(normaliseList(data.clients || data, "clients"));
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Client dipilih (manual atau otomatis) → GET roles ───────────────────────
  // Auto-select role pertama (urut AD_Role_ID), lalu cascade ke organisasi.
  async function handleClientChange(clientId) {
    setSelectedClientId(clientId);
    setSelectedRoleId("");
    setSelectedOrgId("");
    setSelectedWarehouseId("");
    setRoles([]);
    setOrgs([]);
    setWarehouses([]);
    if (!clientId) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiGetRoles(token, clientId);
      const roleList = sortById(normaliseList(data, "roles"));
      setRoles(roleList);
      if (roleList.length > 0) {
        await handleRoleChange(String(roleList[0].id), clientId);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Role dipilih (manual atau otomatis) → GET organizations ─────────────────
  // Auto-select organisasi pertama (urut AD_Org_ID), lalu cascade ke warehouse.
  async function handleRoleChange(roleId, clientIdOverride) {
    const clientId = clientIdOverride || selectedClientId;
    setSelectedRoleId(roleId);
    setSelectedOrgId("");
    setSelectedWarehouseId("");
    setOrgs([]);
    setWarehouses([]);
    if (!roleId || !clientId) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiGetOrganizations(token, clientId, roleId);
      const orgList = sortById(normaliseList(data, "organizations"));
      setOrgs(orgList);
      if (orgList.length > 0) {
        await handleOrgChange(String(orgList[0].id), clientId, roleId);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Org dipilih (manual atau otomatis) → GET warehouses ──────────────────────
  // Auto-select warehouse pertama (urut M_Warehouse_ID). Tetap opsional untuk user.
  async function handleOrgChange(orgId, clientIdOverride, roleIdOverride) {
    const clientId = clientIdOverride || selectedClientId;
    const roleId   = roleIdOverride   || selectedRoleId;
    setSelectedOrgId(orgId);
    setSelectedWarehouseId("");
    setWarehouses([]);
    if (!orgId || !clientId || !roleId) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiGetWarehouses(token, clientId, roleId, orgId);
      const whList = sortById(normaliseList(data, "warehouses"));
      setWarehouses(whList);
      if (whList.length > 0) {
        setSelectedWarehouseId(String(whList[0].id));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: Finalize → PUT /auth/tokens ───────────────────────────────────
  async function handleStep2(e) {
    e.preventDefault();
    if (!selectedClientId || !selectedRoleId || !selectedOrgId) {
      setError("Client, Role, dan Organisasi wajib dipilih.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await apiSetSession(
        token,
        parseInt(selectedClientId, 10),
        parseInt(selectedRoleId, 10),
        parseInt(selectedOrgId, 10),
        selectedWarehouseId ? parseInt(selectedWarehouseId, 10) : 0,
        language,
      );
      onLoginSuccess({
        token: data.token,
        username: form1.username,
        clientId: parseInt(selectedClientId, 10),
        clientName: clients.find((c) => String(c.id) === selectedClientId)?.name || selectedClientId,
        roleId: parseInt(selectedRoleId, 10),
        roleName: roles.find((r) => String(r.id) === selectedRoleId)?.name || selectedRoleId,
        orgId: parseInt(selectedOrgId, 10),
        orgName: orgs.find((o) => String(o.id) === selectedOrgId)?.name || selectedOrgId,
        acctSchemaId: data.acctSchemaId,   // ← baris baru
        language,
      });
      // onLoginSuccess({
      //   token: data.token,
      //   username: form1.username,
      //   clientId: parseInt(selectedClientId, 10),
      //   clientName: clients.find((c) => String(c.id) === selectedClientId)?.name || selectedClientId,
      //   roleId: parseInt(selectedRoleId, 10),
      //   roleName: roles.find((r) => String(r.id) === selectedRoleId)?.name || selectedRoleId,
      //   orgId: parseInt(selectedOrgId, 10),
      //   orgName: orgs.find((o) => String(o.id) === selectedOrgId)?.name || selectedOrgId,
      //   language,
      // });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  function handleBack() {
    setStep(1);
    setError("");
    setToken("");
    setClients([]);
    setRoles([]);
    setOrgs([]);
    setWarehouses([]);
    setSelectedClientId("");
    setSelectedRoleId("");
    setSelectedOrgId("");
    setSelectedWarehouseId("");
    setSessionData(null);
  }

  const stepConfig = [
    { num: 1, label: "Credential", desc: "Username & password" },
    { num: 2, label: "Role Acces", desc: "Client, role & organization" },
    { num: 3, label: "Success", desc: "Active session & ready to use" },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="auth-root">
      {/* LEFT PANEL */}
      <div className="login-panel-left">
        <div className={`auth-left ${leftOpen ? '' : 'collapsed'}`}>
          <div className="left-content">
            {/* Brand / Logo */}
            <div className="brand">
              <div className="logo-container"><LogoIconW size={40} /></div>
              <div className="brand-text">
                <div className="brand-name">Procure<em>Grid</em></div>
                <div className="brand-sub">Part of IDempiere</div>
              </div>
              <button className="hamburger-btn" onClick={() => setLeftOpen(!leftOpen)}>
                {leftOpen ? '☰' : '☰'}
              </button>
            </div>
            
            {/* Navigation Steps */}
            <div className="steps-nav">
              {stepConfig.map((s) => {
                const isDone = step > s.num;
                const isActive = step === s.num;
                return (
                  <div key={s.num} className="step-item">
                    <div className={`step-dot ${isDone ? "done" : isActive ? "active" : ""}`}>
                      {isDone ? <CheckIcon /> : s.num}
                    </div>
                    {/* Hanya step-info yang disembunyikan saat collapsed */}
                    <div className="step-info">
                      <div className={`step-label ${isDone ? "done" : isActive ? "active" : ""}`}>{s.label}</div>
                      <div className={`step-desc ${isActive ? "active" : ""}`}>{s.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Left */}
          <div className="auth-footer">
            <div className="footer-text">
              REST API IDempiere v13+.<br />
            </div>
          </div>
        </div>
      </div>
      {/* RIGHT PANEL */}
      <div className="auth-right">

        {/* ── Step 1 ── */}
        {step === 1 && (
          <div className="card slide-enter">
            <div className="brand">
              <div><LogoIconW size={40}/></div>
              <div>
                <div className="brand-name">Procure<em>Grid</em></div>
                <div className="brand-sub">Procurement Application</div>
              </div>
            </div>
            <div className="card-sub"><em>Enter your username and passwoer to continue.</em></div>

            {error && <div className="error-box"><AlertIcon />{error}</div>}

            <form onSubmit={handleStep1} noValidate>
              <div className="field">
                <label className="field-label">Username</label>
                <input
                  className="field-input"
                  type="text"
                  placeholder="Username"
                  value={form1.username}
                  onChange={updateForm1("username")}
                  autoComplete="username"
                  autoFocus
                />
              </div>

              <div className="field">
                <label className="field-label">Password</label>
                <div className="input-wrapper">
                  <input
                    className="field-input"
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    value={form1.password}
                    onChange={updateForm1("password")}
                    autoComplete="current-password"
                    style={{ paddingRight: 44 }}
                  />
                  <span
                    className="input-icon"
                    onClick={() => setShowPass((p) => !p)}
                    title={showPass ? "Hide" : "Show"}
                  >
                    <EyeIcon show={showPass} />
                  </span>
                </div>
              </div>

              <button className="btn-primary" type="submit" disabled={loading}>
                {loading
                  ? <><div className="spinner" />Memverifikasi...</>
                  : <>Continue <ArrowIcon /></>}
              </button>
            </form>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <div className="card slide-enter">
            <div className="card-title">Choose <em>Acces Role</em></div>
            <div className="card-sub">Your Role Acces.</div>
            {/*
            <div className="info-box">
              <InfoIcon />
              <span>Masuk sebagai <strong>{form1.username}</strong> — pilih lingkungan kerja Anda.</span>
            </div>
            */}
            {error && <div className="error-box"><AlertIcon />{error}</div>}

            <form onSubmit={handleStep2} noValidate>

              {/* CLIENT */}
              <div className="field">
                <label className="field-label">Client</label>
                <select
                  className="field-input"
                  value={selectedClientId}
                  onChange={(e) => handleClientChange(e.target.value)}
                  disabled={loading || clients.length === 1}
                >
                  <option value="">— Pilih Client —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* ROLE */}
              <div className="field">
                <label className="field-label">Role</label>
                <select
                  className="field-input"
                  value={selectedRoleId}
                  onChange={(e) => handleRoleChange(e.target.value)}
                  disabled={!selectedClientId || loading || roles.length === 1}
                >
                  <option value="">
                    {!selectedClientId ? "— Pilih Client dulu —" : "— Pilih Role —"}
                  </option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              {/* ORGANISASI */}
              <div className="field">
                <label className="field-label">Organization</label>
                <select
                  className="field-input"
                  value={selectedOrgId}
                  onChange={(e) => handleOrgChange(e.target.value)}
                  disabled={!selectedRoleId || loading || orgs.length === 1}
                >
                  <option value="">
                    {!selectedRoleId ? "— Choose Role first —" : "— Choose Organization —"}
                  </option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              {/* WAREHOUSE */}
              <div className="field">
                <label className="field-label">
                  Warehouse{" "}
                  <span style={{ color: "#484f58", fontWeight: 300, textTransform: "none", letterSpacing: 0 }}>
                    (opsional)
                  </span>
                </label>
                <select
                  className="field-input"
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  disabled={!selectedOrgId || loading || warehouses.length === 1}
                >
                  <option value="">— Not Available / All —</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              {/* BAHASA */}
              <div className="field">
                <label className="field-label">FrontEnd Language</label>
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
                <button type="button" className="btn-secondary" onClick={handleBack} disabled={loading}>
                  <ArrowIcon left /> Back
                </button>
                <button
                  className="btn-primary"
                  type="submit"
                  disabled={loading || !selectedClientId || !selectedRoleId || !selectedOrgId}
                >
                  {loading
                    ? <><div className="spinner" />Processing...</>
                    : <>Enter <ArrowIcon /></>}
                </button>
              </div>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}