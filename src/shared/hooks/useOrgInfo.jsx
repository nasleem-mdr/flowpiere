// src/shared/hooks/useOrgInfo.js
import { useState, useEffect } from 'react';
import { idempiereApi, getModelRecords, fkId } from '@/api/idempiereApi';
import { getLoginInfo } from './useLoginInfo';

const _cache = new Map(); // orgId -> Promise<orgInfo | null>

async function fetchOrgInfoRaw(orgId) {
  const res = await getModelRecords('ad_orginfo', {
    '$filter': `AD_Org_ID eq ${orgId}`,
    // C_Location_ID ditambahkan agar identifier-nya (alamat terformat lengkap
    // dari C_Location, mis. "Jl. ..., Kel. ... Kec. ... - Kota") bisa langsung
    // dipakai di kop surat, tanpa fetch terpisah ke model c_location.
    '$select': 'AD_Org_ID,Phone,Email,Logo_ID,AD_OrgType_ID,C_Location_ID',
    '$top': 1,
  });
  const record = res?.records?.[0];
  if (!record) return null;

  let name = record.AD_Org_ID?.identifier || '';

  // Prefix dari AD_OrgType (mis. "CV.", "PT")
  const orgTypePrefix = record.AD_OrgType_ID?.identifier || '';
  if (orgTypePrefix) {
    name = `${orgTypePrefix} ${name}`;
  }

  let logoUrl = null;
  const logoId = fkId(record.Logo_ID);
  if (logoId) {
    try {
      const img = await idempiereApi(`/models/ad_image/${logoId}?$select=AD_Image_ID,Name,BinaryData`);
      if (img?.BinaryData) {
        logoUrl = `data:image/png;base64,${img.BinaryData}`;
      }
    } catch (err) {
      console.warn('[useOrgInfo] Gagal ambil logo AD_Image:', err.message);
    }
  }

  // Address1/Address2 diambil terpisah dari C_Location (bukan cuma identifier
  // gabungan) supaya kop surat bisa menampilkan 2 baris alamat persis sesuai
  // entri Address 1 / Address 2 di iDempiere.
  let addressLines = [];
  const locId = fkId(record.C_Location_ID);
  if (locId) {
    try {
      const loc = await idempiereApi(`/models/c_location/${locId}?$select=Address1,Address2`);
      addressLines = [loc?.Address1, loc?.Address2].filter(Boolean);
    } catch (err) {
      console.warn('[useOrgInfo] Gagal ambil Address1/Address2:', err.message);
    }
  }
  // Fallback ke identifier gabungan kalau fetch Address1/Address2 gagal/kosong
  if (addressLines.length === 0 && record.C_Location_ID?.identifier) {
    addressLines = [record.C_Location_ID.identifier];
  }
  return {
    orgId,
    name,
    phone: record.Phone || record.phone || '',
    email: record.EMail || record.email || '',
    address: addressLines.join(', '),
    addressLines,
    logoUrl,
  };
}

export function useOrgInfo(orgIdParam) {
  const [orgInfo, setOrgInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const orgId = orgIdParam ?? getLoginInfo()?.orgId;
    if (!orgId) { setLoading(false); return; }

    setLoading(true);
    if (!_cache.has(orgId)) {
      _cache.set(orgId, fetchOrgInfoRaw(orgId));
    }
    _cache.get(orgId)
      .then(info => { if (!cancelled) setOrgInfo(info); })
      .catch(err => {
        console.error('[useOrgInfo]', err.message);
        if (!cancelled) setOrgInfo(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [orgIdParam]);

  return { orgInfo, loading };
}

export function clearOrgInfoCache(orgId) {
  if (orgId) _cache.delete(orgId);
  else _cache.clear();
}