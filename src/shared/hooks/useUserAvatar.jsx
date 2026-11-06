import { useEffect, useState } from 'react';
import { idempiereApi, fkId } from '@/api/idempiereApi';

function base64ToBlob(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes]); // <img> akan mendeteksi tipe gambarnya sendiri
}

// Ambil gambar dari path REST, baik balasannya binary maupun JSON/base64.
async function fetchImageUrl(path) {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const type = res.headers.get('content-type') || '';
  //console.log('[avatar] GET', path, '→', res.status, type);
  if (!res.ok) return null;

  if (type.startsWith('image/')) {
    const blob = await res.blob();
    //console.log('[avatar] blob size', blob.size, blob.type);
    return blob.size ? URL.createObjectURL(blob) : null;
  }

  const text = await res.text();
  //console.log('[avatar] body (200 karakter pertama):', text.slice(0, 200));
  let b64 = text;
  try {
    const j = JSON.parse(text);
    //console.log('[avatar] keys JSON:', Object.keys(j));
    b64 =
      j.BinaryData ?? j.binaryData ?? j.data ??
      Object.values(j).find((v) => typeof v === 'string' && v.length > 100) ?? '';
  } catch (_) {}

  b64 = String(b64).replace(/^"|"$/g, '').replace(/^data:[^,]+,/, '');
  if (!b64) return null;
  try {
    return URL.createObjectURL(base64ToBlob(b64));
  } catch (e) {
    console.warn('[avatar] base64 tidak valid', e.message);
    return null;
  }
}

export function useUserAvatar() {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    const userId = localStorage.getItem('AD_User_ID');
    if (!userId) return;
    let objectUrl = null;
    let cancelled = false;

    (async () => {
      try {
        const user = await idempiereApi(`/models/ad_user/${userId}?$select=AD_Image_ID`);
        const imageId = fkId(user?.AD_Image_ID);
        //console.log('[avatar] AD_Image_ID =', imageId);

        if (imageId) {
          const candidates = [
            `/models/ad_image/${imageId}/BinaryData`,
            `/models/ad_image/${imageId}/binarydata`,
            `/models/ad_image/${imageId}?$select=BinaryData`,
          ];
          for (const p of candidates) {
            objectUrl = await fetchImageUrl(p);
            if (objectUrl) break;
          }
        }

        // Fallback: attachment gambar di record AD_User
        if (!objectUrl) {
          const att = await idempiereApi(`/models/ad_user/${userId}/attachments`);
          const img = (att?.attachments || []).find((a) => a.contentType?.startsWith('image/'));
          if (img) {
            objectUrl = await fetchImageUrl(
              `/models/ad_user/${userId}/attachments/${encodeURIComponent(img.name)}`
            );
          }
        }
      } catch (e) {
        console.warn('[avatar] error', e.message);
      }
      //console.log('[avatar] hasil akhir:', objectUrl);
      if (cancelled) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      } else {
        setUrl(objectUrl);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  return url;
}