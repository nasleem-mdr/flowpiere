import { useState, useEffect } from "react";
import {
  apiGetRoles,
  apiGetOrganizations,
  apiGetWarehouses,
  apiSetSession,
  normaliseList,
  sortById,
} from "@/api/idempiereAuth";

export function useChangeRole(token) {
  const clientId = localStorage.getItem("AD_Client_ID") || "";

  const [selectedRoleId, setSelectedRoleId] = useState(localStorage.getItem("AD_Role_ID") || "");
  const [selectedOrgId, setSelectedOrgId] = useState(localStorage.getItem("AD_Org_ID") || "");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(localStorage.getItem("M_Warehouse_ID") || "");

  const [roles, setRoles] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Muat daftar role begitu modal dibuka, berdasarkan client yang sedang aktif
  useEffect(() => {
    if (clientId) loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRoles() {
    setLoading(true);
    setError("");
    try {
      const data = await apiGetRoles(token, clientId);
      const roleList = sortById(normaliseList(data, "roles"));
      setRoles(roleList);

      // Kalau role yang lagi aktif ada di daftar, langsung load org untuk role itu
      if (selectedRoleId && roleList.some((r) => String(r.id) === String(selectedRoleId))) {
        await loadOrgs(selectedRoleId);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadOrgs(roleId) {
    setLoading(true);
    setError("");
    try {
      const data = await apiGetOrganizations(token, clientId, roleId);
      const orgList = sortById(normaliseList(data, "organizations"));
      setOrgs(orgList);

      if (selectedOrgId && orgList.some((o) => String(o.id) === String(selectedOrgId))) {
        await loadWarehouses(roleId, selectedOrgId);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadWarehouses(roleId, orgId) {
    setLoading(true);
    setError("");
    try {
      const data = await apiGetWarehouses(token, clientId, roleId, orgId);
      const whList = sortById(normaliseList(data, "warehouses"));
      setWarehouses(whList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleRoleChange(roleId) {
    setSelectedRoleId(roleId);
    setSelectedOrgId("");
    setSelectedWarehouseId("");
    setOrgs([]);
    setWarehouses([]);
    if (roleId) loadOrgs(roleId);
  }

  function handleOrgChange(orgId) {
    setSelectedOrgId(orgId);
    setSelectedWarehouseId("");
    setWarehouses([]);
    if (orgId) loadWarehouses(selectedRoleId, orgId);
  }

  async function submitChangeRole(language) {
    if (!selectedRoleId || !selectedOrgId) {
      setError("Role dan Organisasi wajib dipilih.");
      throw new Error("Role dan Organisasi wajib dipilih.");
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiSetSession(
        token,
        clientId,
        selectedRoleId,
        selectedOrgId,
        selectedWarehouseId || 0,
        language
      );
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return {
    clientId,
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
  };
}