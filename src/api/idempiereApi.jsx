//const API_BASE = '/api/v1';
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
//const API_BASE = `${BASE_URL}/api/v1`;
const API_BASE = '/api/v1';

export async function idempiereApi(url, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: options.signal,
  });

  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('session-expired'));
    }
    let msg = `HTTP ${res.status}`;
    try {
      const d = await res.json();
      msg = d.message || d.Message || d.detail || msg;
    } catch (_) {}
    throw new Error(msg);
  }

  // Sebagian endpoint (mis. POST .../attachments) balas 200/201 dengan body
  // KOSONG — res.json() langsung terhadap body kosong akan melempar
  // "Unexpected end of JSON input". Baca sebagai text dulu, baru di-parse
  // kalau memang ada isinya.
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return text; // body bukan JSON valid — kembalikan apa adanya
  }
}

export const fkId = (field) => field?.id ?? field ?? null;
export const fkLabel = (field) => field?.identifier || field?.Name || null;

// ─────────────────────────────────────────────────────────────────────────────
// Stock / Available Quantity helpers
// M_Storage menyimpan stok per kombinasi Locator + (lot/attribute-set-instance),
// jadi satu produk bisa punya banyak baris untuk locator yang sama. Helper ini
// mengagregasi per locator, lalu hitung total keseluruhan.
//
// "Available" = QtyOnHand - QtyReserved (qty fisik dikurangi yang sudah
// di-reserve untuk order lain) — definisi umum yang dipakai di iDempiere.
// ─────────────────────────────────────────────────────────────────────────────
export async function getProductAvailability(productId) {
  try {
    const res = await idempiereApi(
      `/models/m_storage?$filter=M_Product_ID eq ${productId}&$select=M_Locator_ID,QtyOnHand,QtyReserved,QtyOrdered&$top=500`
    );
    const records = Array.isArray(res.records) ? res.records : [];

    // Agregasi per locator — beberapa baris bisa berbagi locator yang sama
    // (lot/attribute-set-instance berbeda), jadi dijumlahkan, bukan diambil
    // satu per locator.
    const byLocator = new Map();
    records.forEach(r => {
      const locId   = fkId(r.M_Locator_ID);
      const locName = fkLabel(r.M_Locator_ID) || `Locator #${locId}`;
      const onHand  = r.QtyOnHand ?? 0;
      const reserved = r.QtyReserved ?? 0;
      const ordered  = r.QtyOrdered ?? 0;

      if (!byLocator.has(locId)) {
        byLocator.set(locId, { locatorId: locId, locatorName: locName, qtyOnHand: 0, qtyReserved: 0, qtyOrdered: 0 });
      }
      const entry = byLocator.get(locId);
      entry.qtyOnHand   += onHand;
      entry.qtyReserved += reserved;
      entry.qtyOrdered  += ordered;
    });

    const perLocator = Array.from(byLocator.values()).map(l => ({
      ...l,
      qtyAvailable: l.qtyOnHand - l.qtyReserved,
    }));

    const totals = perLocator.reduce((acc, l) => ({
      qtyOnHand:    acc.qtyOnHand + l.qtyOnHand,
      qtyReserved:  acc.qtyReserved + l.qtyReserved,
      qtyOrdered:   acc.qtyOrdered + l.qtyOrdered,
      qtyAvailable: acc.qtyAvailable + l.qtyAvailable,
    }), { qtyOnHand: 0, qtyReserved: 0, qtyOrdered: 0, qtyAvailable: 0 });

    return { perLocator, totals };
  } catch (err) {
    return { perLocator: [], totals: { qtyOnHand: 0, qtyReserved: 0, qtyOrdered: 0, qtyAvailable: 0 } };
  }
}
export async function waitForDocStatus(tableName, id, {
  timeoutMs = 15000,             // total waktu tunggu maksimum
  intervalMs = 700,              // jeda antar polling
  successStatuses = ['CO', 'CL'], // Completed, Closed → dianggap sukses
  pendingStatuses  = ['IP', 'DR'], // In Progress, Draft → masih diproses, lanjut polling
} = {}) {
  const start = Date.now();
  let lastStatus = null;
  let lastRecord = null;

  while (Date.now() - start < timeoutMs) {
    const record = await idempiereApi(`/models/${tableName.toLowerCase()}/${id}`);
    lastRecord = record;
    lastStatus = fkId(record.DocStatus); // DocStatus biasanya { id: 'CO', identifier: 'Completed' }

    if (successStatuses.includes(lastStatus)) {
      return {
        success: true,
        status: lastStatus,
        documentNo: record.DocumentNo,
        grandTotal: record.GrandTotal,
        record,
      };
    }

    if (!pendingStatuses.includes(lastStatus)) {
      // Status final tapi BUKAN status sukses (mis. 'IN' Invalid, 'VO' Voided,
      // 'RE' Reversed, 'NA' Not Approved) — berhenti, jangan polling terus.
      return { success: false, status: lastStatus, documentNo: record.DocumentNo, record };
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  // Timeout — masih pending setelah timeoutMs, kemungkinan approval manual
  // yang lama atau workflow nyangkut. Biarkan caller yang putuskan tindak
  // lanjutnya (biasanya: kasih tahu user dokumennya masih diproses).
  return { success: false, status: lastStatus, documentNo: lastRecord?.DocumentNo, record: lastRecord, timedOut: true };
}
// ─────────────────────────────────────────────────────────────────────────────
// Attachment helpers — untuk produk yang gambarnya disimpan sebagai
// AD_Attachment (file menempel ke record), bukan field kolom URL biasa.
//
// Alur: 1) GET .../attachments → daftar {name, contentType}
//       2) GET .../attachments/{name} → binary file (dipakai langsung sbg <img src>)
// ─────────────────────────────────────────────────────────────────────────────

// Ambil daftar metadata attachment untuk satu record M_Product.
// Return: array [{ name, contentType }, ...] — kosong kalau tidak ada attachment.
export async function getProductAttachments(productId) {
  try {
    const res = await idempiereApi(`/models/m_product/${productId}/attachments`);
    return Array.isArray(res.attachments) ? res.attachments : [];
  } catch (err) {
    // 404/tidak ada attachment bukan error fatal — anggap saja kosong
    return [];
  }
}

// Cari attachment pertama yang content type-nya gambar, lalu bentuk URL
// binary-nya. URL ini memakai token dari localStorage sebagai query param
// karena <img src="..."> tidak bisa mengirim header Authorization secara
// langsung — endpoint REST iDempiere harus mendukung token lewat query
// param untuk ini berfungsi (umum didukung; kalau tidak, perlu fetch+blob,
// lihat getProductImageBlobUrl di bawah sebagai alternatif).
export async function getProductImageUrl(productId) {
  const attachments = await getProductAttachments(productId);
  const image = attachments.find(a => a.contentType?.startsWith('image/'));
  if (!image) return null;

  const token = localStorage.getItem('token');
  return `/api/v1/models/m_product/${productId}/attachments/${encodeURIComponent(image.name)}?token=${encodeURIComponent(token)}`;
}
export async function getFirstProductImageBlobUrl(productId) {
  const attachments = await getProductAttachments(productId);
  const image = attachments.find(a => a.contentType?.startsWith('image/'));
  if (!image) return null;

  const token = localStorage.getItem('token');
  try {
    const res = await fetch(
      `/api/v1/models/m_product/${productId}/attachments/${encodeURIComponent(image.name)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
// Alternatif lebih aman (tidak menaruh token di URL): fetch sebagai blob lalu
// buat object URL lokal. Gunakan ini kalau endpoint tidak mendukung token via
// query param, atau kalau ingin menghindari token tampil di Network tab URL.
// PENTING: pemanggil WAJIB memanggil URL.revokeObjectURL(url) saat selesai
// (mis. di useEffect cleanup) untuk mencegah memory leak.
// export async function getProductImageBlobUrl(productId) {
//   const attachments = await getProductAttachments(productId);
//   const image = attachments.find(a => a.contentType?.startsWith('image/'));
//   if (!image) return null;

//   const token = localStorage.getItem('token');
//   const res = await fetch(`/api/v1/models/m_product/${productId}/attachments/${encodeURIComponent(image.name)}`, {
//     headers: { Authorization: `Bearer ${token}` },
//   });
//   if (!res.ok) return null;

//   const blob = await res.blob();
//   return URL.createObjectURL(blob);
// }
// Fetch SEMUA attachment image sebagai array blob URLs
// Return: [{ url, name, index }, ...]
// PENTING: pemanggil wajib revoke semua URL saat cleanup
export async function getProductImageBlobUrls(productId) {
  const attachments = await getProductAttachments(productId);
  const images = attachments.filter(a => a.contentType?.startsWith('image/'));
  if (images.length === 0) return [];

  const token = localStorage.getItem('token');

  const results = await Promise.all(
    images.map(async (img, index) => {
      try {
        const res = await fetch(
          `/api/v1/models/m_product/${productId}/attachments/${encodeURIComponent(img.name)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return null;
        const blob = await res.blob();
        return { url: URL.createObjectURL(blob), name: img.name, index };
      } catch {
        return null;
      }
    })
  );
  

  return results.filter(Boolean);
}

// Ubah File (dari <input type="file">) jadi string base64 murni (tanpa
// prefix "data:image/png;base64,"), sesuai bentuk yang diminta endpoint
// upload attachment REST API-nya.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = () => reject(new Error("Gagal membaca file."));
    reader.readAsDataURL(file);
  });
}

// Upload gambar baru sebagai AD_Attachment ke record M_Product.
// PENTING (beda dari asumsi versi sebelumnya): endpoint ini menerima JSON
// biasa {name, data(base64)} — BUKAN multipart/form-data — jadi tinggal
// reuse idempiereApi() biasa, tidak perlu fetch()/FormData khusus.
// Endpoint ini sifatnya "add/update by file name": kalau `name` yang
// dikirim SAMA dengan attachment yang sudah ada, isinya akan DITIMPA
// (bukan gagal) — makanya nama file di-prefix timestamp supaya tiap
// upload baru selalu jadi entry baru, tidak menimpa gambar lama.
export async function uploadProductAttachment(productId, file) {
  const base64Data = await fileToBase64(file);
  const uniqueName = `${Date.now()}-${file.name}`;
  return idempiereApi(`/models/m_product/${productId}/attachments`, {
    method: 'POST',
    body: JSON.stringify({ name: uniqueName, data: base64Data }),
  });
}

// Hapus SEMUA attachment/gambar dari record M_Product sekaligus.
// CATATAN: REST API ini TIDAK menyediakan endpoint untuk hapus satu
// attachment tertentu (by nama file) — DELETE di .../attachments selalu
// menghapus seluruh attachment record itu. Kalau butuh hapus satu gambar
// saja, satu-satunya cara lewat REST API publik-nya adalah: hapus semua,
// lalu upload ulang gambar-gambar yang ingin dipertahankan.
export async function deleteAllProductAttachments(productId) {
  return idempiereApi(`/models/m_product/${productId}/attachments`, {
    method: 'DELETE',
  });
}
// ─────────────────────────────────────────────────────────────────────────────
  // TAMBAHKAN BLOK INI KE FILE src/utils/idempiereApi.jsx YANG SUDAH ADA
  // (paste di bagian bawah, setelah fkId/fkLabel — reuse fungsi idempiereApi()
  // yang sudah ada di atas, jadi auth/error-handling-nya otomatis konsisten)
  // ─────────────────────────────────────────────────────────────────────────────

  // Generic model CRUD helper — dipakai untuk modul baru (S_Resource, S_Booking, dst)
  // supaya tidak perlu tulis ulang pola fetch + query string setiap kali.
  // Mengikuti konvensi yang sama seperti getProductAvailability(): query string
  // di-embed langsung di URL, TIDAK di-encode (server/proxy kamu sudah terbukti
  // jalan dengan format ini di modul stock).

  export function buildQuery(params = {}) {
    const parts = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k}=${v}`);
    return parts.length ? `?${parts.join("&")}` : "";
  }

  // GET list. tableName huruf kecil (mis. "s_resource", "s_booking").
  // Return: response asli dari server, yaitu { records: [...] }
  export async function getModelRecords(tableName, params = {}) {
    return idempiereApi(`/models/${tableName.toLowerCase()}${buildQuery(params)}`);
  }

  // GET satu record by ID.
  export async function getModelRecord(tableName, id) {
    return idempiereApi(`/models/${tableName.toLowerCase()}/${id}`);
  }

  // POST create record baru. Return: record yang baru dibuat (termasuk ID-nya).
  export async function createModelRecord(tableName, data) {
    return idempiereApi(`/models/${tableName.toLowerCase()}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // PUT update record.
  export async function updateModelRecord(tableName, id, data) {
    return idempiereApi(`/models/${tableName.toLowerCase()}/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // DELETE record.
  export async function deleteModelRecord(tableName, id) {
    return idempiereApi(`/models/${tableName.toLowerCase()}/${id}`, {
      method: "DELETE",
    });
  }