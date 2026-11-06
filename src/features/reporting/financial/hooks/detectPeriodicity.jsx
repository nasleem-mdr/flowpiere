// Menentukan apakah suatu PA_ReportLineSet bersifat Periodik (Laba Rugi)
// atau Cutoff (Neraca), berdasarkan AccountType akun-akun yang dipakai.
export async function detectPeriodicity(token, baseUrl, reportLineSetId) {
  const headers = { Authorization: `Bearer ${token}` };

  // 1. Ambil beberapa baris tipe 'S' (Segment) dari report line set ini
  const linesRes = await fetch(
    `${baseUrl}/api/v1/models/PA_ReportLine?$filter=PA_ReportLineSet_ID eq ${reportLineSetId} and IsActive eq true and IsPrinted eq true and LineType eq 'S'&$orderby=SeqNo&$top=5`,
    { headers }
  );
  if (!linesRes.ok) return null;
  const linesJson = await linesRes.json();
  const lines = linesJson.records || linesJson.value || [];
  if (lines.length === 0) return null; // tidak ada baris segment, tidak bisa disimpulkan

  // 2. Ambil PA_ReportSource untuk baris-baris itu (satu per satu, lebih aman
  //    daripada filter OR gabungan yang belum tentu didukung server)
  const sourceLists = await Promise.all(
    lines.map((line) =>
      fetch(
        `${baseUrl}/api/v1/models/PA_ReportSource?$filter=PA_ReportLine_ID eq ${line.id} and ElementType eq 'AC' and IsActive eq true&$top=3`,
        { headers }
      )
        .then((r) => (r.ok ? r.json() : { records: [] }))
        .then((j) => j.records || j.value || [])
    )
  );
  const sources = sourceLists.flat();
  if (sources.length === 0) return null;

  // 3. Ambil ID akun unik yang direferensikan (pakai C_ElementValue_ID sebagai "From")
  const acctIds = [
    ...new Set(
      sources
        .map((s) => s.C_ElementValue_ID?.id ?? s.C_ElementValue_ID)
        .filter(Boolean)
    ),
  ].slice(0, 5); // cukup sample beberapa, tidak perlu semua

  if (acctIds.length === 0) return null;

  // 4. Ambil AccountType tiap akun via GET by id (lebih reliable daripada filter OR)
  const accounts = await Promise.all(
    acctIds.map((id) =>
      fetch(`${baseUrl}/api/v1/models/C_ElementValue/${id}`, { headers })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    )
  );

  // 5. Hitung mayoritas tipe akun
  let flowCount = 0;   // Revenue/Expense -> Periodik
  let balanceCount = 0; // Asset/Liability/Equity -> Cutoff

  for (const acc of accounts) {
    if (!acc) continue;
    const type = acc.AccountType?.id ?? acc.AccountType;
    if (type === 'R' || type === 'E') flowCount++;
    else if (type === 'A' || type === 'L' || type === 'O') balanceCount++;
  }

  if (flowCount === 0 && balanceCount === 0) return null; // tidak bisa disimpulkan
  return flowCount > balanceCount; // true = Periodik, false = Cutoff
}