// Tambahkan ke '@/api/idempiereApi' — sesuaikan BASE URL & cara ambil token
// dengan yang sudah dipakai oleh fungsi idempiereApi() Anda.
export async function idempiereBlob(path) {
  const res = await fetch(`${API_BASE_URL}${path}`, {      // <- base URL yang sama dgn idempiereApi
    headers: { Authorization: `Bearer ${getToken()}` },    // <- token yang sama dgn idempiereApi
  });
  if (!res.ok) throw new Error(`Gagal mengunduh file (${res.status})`);
  return res.blob();
}
