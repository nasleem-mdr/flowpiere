import { useState, useEffect, useCallback } from 'react';
/**
 * Helper: Ekstrak ID secara konsisten baik dari:
 * - integer / string primitif (1000001)
 * - object iDempiere { id: 1000001, propertyLabel: "..." }
 */
const getId = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') {
    return val.id !== undefined ? val.id : (val.PA_ReportLine_ID || val.C_ElementValue_ID || null);
  }
  return val;
};

/**
 * Helper: Normalisasi nilai string/enum iDempiere (misal LineType: 'C' atau { id: 'C' })
 */
const getValueStr = (val) => {
  if (!val) return '';
  if (typeof val === 'object') return String(val.id || val.value || '');
  return String(val);
};

// Jumlah request halaman yang boleh jalan bersamaan saat paging
const PAGE_CONCURRENCY = 5;

// Helper: Safety parse angka dari response JSON API
const parseNum = (val) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
};

// Helper: Tentukan saldo normal (Debit = true, Credit = false)
const isDebitNormal = (accountType, accountSign) => {
  const sign = getValueStr(accountSign);
  const type = getValueStr(accountType);

  if (sign === 'D') return true;
  if (sign === 'C') return false;
  // AccountSign 'N' (Natural) -> Fallback ke AccountType
  return type === 'A' || type === 'E' || type === 'M';
};

// PA_ReportLine.PAPeriodType (Period Type di window Report Line):
//   T = Total   -> akumulasi dari awal sampai As Per Date (dateTo)      [Neraca]
//   Y = Year    -> awal tahun fiskal s/d dateTo (year-to-date)
//   P = Period  -> dateFrom s/d dateTo                                  [Laba Rugi]
//   N = Natural -> akun Neraca (A/L/O) = Total, akun Laba Rugi (R/E) = Year
//   kosong      -> default mengikuti `mode` ('neraca' = T, 'labarugi' = P)
const PERIOD_TYPES = ['T', 'Y', 'P', 'N'];
const BUCKET_BY_TYPE = { T: 'total', Y: 'year', P: 'period' };

export function useFinancialReport({
  reportLineSetId,
  acctSchemaId,
  dateFrom,
  dateTo,
  mode = 'neraca',
  token,
  baseUrl = '',
}) {
  const [reportLines, setReportLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Helper fetch all pages (pagination OData REST iDempiere).
  //
  // PENTING: bxservice membatasi respons maksimal 100 baris per request
  // meski $top=1000/2000 (terkonfirmasi di useWindowAccess: row-count 337,
  // fetched 100). Karena itu:
  //   - JANGAN berhenti dengan `rows.length < pageSize` (100 < 1000 -> berhenti
  //     di halaman pertama, data terpotong diam-diam).
  //   - Acuan total = `row-count` dari server; langkah $skip = jumlah baris
  //     yang BENAR-BENAR diterima di halaman pertama.
  //   - Wajib pakai $orderby (PK) di path supaya urutan paging stabil.
  // Halaman ke-2 dst. diambil paralel per batch agar Fact_Acct (ribuan baris)
  // tidak terlalu lambat.
  const fetchAllPages = useCallback(
    async (path, pageSize = 100, signal = null) => {
      const sep = path.includes('?') ? '&' : '?';

      const fetchPage = async (skip) => {
        const res = await fetch(`${baseUrl}${path}${sep}$top=${pageSize}&$skip=${skip}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });

        if (res.status === 401 || res.status === 403) {
          throw new Error(`Sesi login kadaluarsa (HTTP ${res.status}). Silakan login ulang.`);
        }
        if (!res.ok) {
          throw new Error(`Gagal fetch ${path}: HTTP ${res.status}`);
        }

        const json = await res.json();
        return {
          rows: json.records || json.value || [],
          total: typeof json['row-count'] === 'number' ? json['row-count'] : null,
        };
      };

      const first = await fetchPage(0);
      const allRows = [];
      for (let i = 0; i < first.rows.length; i++) allRows.push(first.rows[i]);
      if (first.rows.length === 0) return allRows;

      // Jalur utama: total diketahui -> hitung semua skip, ambil paralel per batch
      if (first.total !== null) {
        const step = first.rows.length; // ukuran halaman riil dari server
        const skips = [];
        for (let s = step; s < first.total; s += step) skips.push(s);

        for (let i = 0; i < skips.length; i += PAGE_CONCURRENCY) {
          const batch = await Promise.all(
            skips.slice(i, i + PAGE_CONCURRENCY).map((sk) => fetchPage(sk))
          );
          for (const b of batch) {
            for (let j = 0; j < b.rows.length; j++) allRows.push(b.rows[j]);
          }
        }
        return allRows;
      }

      // Fallback: server tidak mengirim row-count -> lanjut sampai halaman kosong
      let skip = first.rows.length;
      while (true) {
        const page = await fetchPage(skip);
        if (page.rows.length === 0) break;
        for (let j = 0; j < page.rows.length; j++) allRows.push(page.rows[j]);
        skip += page.rows.length;
      }
      return allRows;
    },
    [baseUrl, token]
  );

  // Evaluator rekursif untuk LineType === 'C' (Calculation)
  // Mendukung:
  //   - CalculationType 'R' (Row Range) ATAU kosong -> jumlahkan semua baris
  //     laporan di antara SeqNo Op1..Op2 (dipakai untuk subtotal/total group)
  //   - CalculationType '+' -> nilai(Op1) + nilai(Op2)  (DUA baris spesifik,
  //     BUKAN range SeqNo)
  //   - CalculationType '-' -> nilai(Op1) - nilai(Op2)  (DUA baris spesifik,
  //     BUKAN range SeqNo)
  //   - '*', '/', 'P' -> operasi dua baris spesifik seperti sebelumnya
  const evaluateLine = useCallback((lineId, linesById, segmentAmounts, cache, visiting, depth = 0) => {
    if (!lineId) return 0;
    if (cache.has(lineId)) return cache.get(lineId);

    if (visiting.has(lineId) || depth > 50) {
      console.warn(`[useFinancialReport] Circular reference atau max depth pada lineId: ${lineId}`);
      return 0;
    }

    const line = linesById.get(lineId);
    if (!line) return 0;

    const lineType = getValueStr(line.LineType);

    // Jika bukan Calculation ('C'), ambil langsung dari saldo segment (LineType 'S')
    if (lineType !== 'C') {
      const val = segmentAmounts.get(lineId) || 0;
      cache.set(lineId, val);
      return val;
    }

    visiting.add(lineId);

    const op1Id = getId(line.Oper_1_ID);
    const op2Id = getId(line.Oper_2_ID);
    const calcType = getValueStr(line.CalculationType);

    let result = 0;

    // KASUS 1: Oper_1 DAN Oper_2 terisi
        // KASUS 1: Oper_1 DAN Oper_2 terisi
    if (op1Id && op2Id) {
      if (calcType === 'A') {
        // Add — jumlahkan nilai DUA baris spesifik ini saja (bukan range SeqNo)
        const a = evaluateLine(op1Id, linesById, segmentAmounts, cache, visiting, depth + 1);
        const b = evaluateLine(op2Id, linesById, segmentAmounts, cache, visiting, depth + 1);
        result = a + b;
      } else if (calcType === 'S') {
        // Subtract — kurangkan nilai DUA baris spesifik ini saja (bukan range SeqNo)
        const a = evaluateLine(op1Id, linesById, segmentAmounts, cache, visiting, depth + 1);
        const b = evaluateLine(op2Id, linesById, segmentAmounts, cache, visiting, depth + 1);
        result = a - b;
      } else if (calcType === '*') {
        const a = evaluateLine(op1Id, linesById, segmentAmounts, cache, visiting, depth + 1);
        const b = evaluateLine(op2Id, linesById, segmentAmounts, cache, visiting, depth + 1);
        result = a * b;
      } else if (calcType === '/') {
        const a = evaluateLine(op1Id, linesById, segmentAmounts, cache, visiting, depth + 1);
        const b = evaluateLine(op2Id, linesById, segmentAmounts, cache, visiting, depth + 1);
        result = b !== 0 ? a / b : 0;
      } else if (calcType === 'P') {
        // Percentage — Op1 of Op2
        const a = evaluateLine(op1Id, linesById, segmentAmounts, cache, visiting, depth + 1);
        const b = evaluateLine(op2Id, linesById, segmentAmounts, cache, visiting, depth + 1);
        result = b !== 0 ? (a / b) * 100 : 0;
      } else {
        // calcType === 'R' (Add Range) atau kosong -> Range Baris Laporan
        // dari SeqNo Op1 s/d Op2 (subtotal/total group)
        const op1Line = linesById.get(op1Id);
        const op2Line = linesById.get(op2Id);

        if (op1Line && op2Line) {
          const seqFrom = Math.min(op1Line.SeqNo, op2Line.SeqNo);
          const seqTo = Math.max(op1Line.SeqNo, op2Line.SeqNo);

          const allLines = Array.from(linesById.values());
          const targetLines = allLines.filter(
            (l) => l.SeqNo >= seqFrom && l.SeqNo <= seqTo && l.id !== lineId
          );

          let sum = 0;
          for (const targetLine of targetLines) {
            sum += evaluateLine(targetLine.id, linesById, segmentAmounts, cache, visiting, depth + 1);
          }
          result = sum;
        }
      }
    }
    // KASUS 2: Hanya Oper_1_ID yang terisi (Pass-through / Tunggal)
    else if (op1Id) {
      const a = evaluateLine(op1Id, linesById, segmentAmounts, cache, visiting, depth + 1);
      result = calcType === '-' ? -a : a;
    }

    visiting.delete(lineId);
    cache.set(lineId, result);
    return result;
  }, []);
  
  const buildReport = useCallback(
    async (signal = null) => {
      if (!reportLineSetId || !acctSchemaId || !dateTo || !token) return;

      setLoading(true);
      setError(null);

      try {
        // 1. Fetch metadata secara paralel
        const [linesRaw, allSources, allAccounts] = await Promise.all([
          fetchAllPages(
            `/api/v1/models/PA_ReportLine?$filter=PA_ReportLineSet_ID eq ${reportLineSetId} and IsActive eq true&$orderby=PA_ReportLine_ID`,
            100,
            signal
          ),
          fetchAllPages(
            `/api/v1/models/PA_ReportSource?$filter=ElementType eq 'AC' and IsActive eq true&$orderby=PA_ReportSource_ID`,
            100,
            signal
          ),
          fetchAllPages(
            `/api/v1/models/C_ElementValue?$filter=IsActive eq true&$select=C_ElementValue_ID,Name,Value,AccountType,AccountSign,IsSummary&$orderby=C_ElementValue_ID`,
            100,
            signal
          ),
        ]);

        if (linesRaw.length === 0) {
          setReportLines([]);
          setLoading(false);
          return;
        }

        // Standardisasi ID pada `lines`
        const lines = linesRaw.map((l) => ({
          ...l,
          id: getId(l) || getId(l.PA_ReportLine_ID),
        }));

        // Map pencarian cepat Akun berdasarkan ID
        const accountMap = new Map();
        for (const acc of allAccounts) {
          const accId = getId(acc) || getId(acc.C_ElementValue_ID);
          if (accId) {
            accountMap.set(accId, { ...acc, id: accId });
          }
        }

        // Urutkan akun secara Natural Sorting berdasarkan kode akun (Value)
        const accountsByValue = Array.from(accountMap.values()).sort((a, b) =>
          String(a.Value || '').localeCompare(String(b.Value || ''), undefined, { numeric: true })
        );

        // Pre-grouping PA_ReportSource berdasarkan PA_ReportLine_ID
        const sourcesByLineId = new Map();
        for (const source of allSources) {
          const lineId = getId(source.PA_ReportLine_ID);
          if (lineId) {
            if (!sourcesByLineId.has(lineId)) {
              sourcesByLineId.set(lineId, []);
            }
            sourcesByLineId.get(lineId).push(source);
          }
        }

        // Helper: Resolusi PA_ReportSource ke daftar Account_ID (Posting / Non-Summary)
        const isSummary = (acc) => acc?.IsSummary === true || acc?.IsSummary === 'Y';

        const resolveAccountIds = (source) => {
          const fromId = getId(source.C_ElementValue_ID);
          const toId = getId(source.C_ElementValue_To_ID);
          if (!fromId) return [];

          const fromAcc = accountMap.get(fromId);
          if (!fromAcc) return [];

          const fromVal = String(fromAcc.Value || '');
          const toAcc = toId ? accountMap.get(toId) : null;
          const toVal = toAcc ? String(toAcc.Value || '') : null;

          // KASUS 1: Single Summary Account tanpa To_ID (misal akun 1000)
          // Menjangkau akun 1010, 1100, dst. yang memiliki prefiks kelompok utama sama
          if ((!toId || toId === fromId) && isSummary(fromAcc)) {
            // Ambil awalan digit utama (misal "1" dari "1000", atau "11" dari "1100")
            const matchPrefix = fromVal.replace(/0+$/, ''); // '1000' -> '1', '1200' -> '12'
            const prefix = matchPrefix.length > 0 ? matchPrefix : fromVal;

            return accountsByValue
              .filter(
                (acc) =>
                  !isSummary(acc) &&
                  String(acc.Value || '').startsWith(prefix)
              )
              .map((acc) => acc.id);
          }

          // KASUS 2: Single Posting Account (Non-Summary)
          if (!toId || toId === fromId) {
            return !isSummary(fromAcc) ? [fromAcc.id] : [];
          }

          // KASUS 3: Range Akun Eksplisit (From .. To)
          if (toVal) {
            const matchedIds = [];
            for (let i = 0; i < accountsByValue.length; i++) {
              const acc = accountsByValue[i];
              const accVal = String(acc.Value || '');

              // Cek apakah accVal berada di antara dari `fromVal` hingga `toVal`
              if (accVal >= fromVal && (accVal <= toVal || accVal.startsWith(toVal))) {
                if (!isSummary(acc)) {
                  matchedIds.push(acc.id);
                }
              }
            }
            return matchedIds;
          }

          return [];
        };

        // 2. Period Type efektif tiap baris Segment ('S')
        //    Satu laporan boleh campur: baris Total (As Per Date), Year (YTD),
        //    Period (dateFrom..dateTo) — mis. Neraca yang memuat Laba Berjalan.
        const effectiveTypeOf = (line) => {
          const t = getValueStr(line.PAPeriodType).toUpperCase();
          if (PERIOD_TYPES.includes(t)) return t;
          return mode === 'neraca' ? 'T' : 'P';
        };

        const segmentLines = lines.filter((l) => getValueStr(l.LineType) === 'S');
        const usedTypes = new Set(segmentLines.map(effectiveTypeOf));
        console.debug('[useFinancialReport] Period Type per baris S:', segmentLines.map((l) => ({
          seq: l.SeqNo, name: l.Name, raw: l.PAPeriodType, effective: effectiveTypeOf(l),
        })));

        const needTotal = usedTypes.has('T') || usedTypes.has('N');
        const needYear = usedTypes.has('Y') || usedTypes.has('N') || (usedTypes.has('P') && !dateFrom);

        // Awal tahun fiskal dari C_Period (fallback 1 Januari tahun dateTo)
        const resolveFiscalYearStart = async () => {
          try {
            const cur = await fetchAllPages(
              `/api/v1/models/C_Period?$filter=StartDate le '${dateTo}' and EndDate ge '${dateTo}' and PeriodType eq 'S' and IsActive eq true&$select=C_Year_ID,StartDate&$orderby=C_Period_ID`,
              100,
              signal
            );
            const yearId = getId(cur[0]?.C_Year_ID);
            if (yearId) {
              const periods = await fetchAllPages(
                `/api/v1/models/C_Period?$filter=C_Year_ID eq ${yearId} and PeriodType eq 'S' and IsActive eq true&$select=StartDate&$orderby=StartDate`,
                100,
                signal
              );
              const first = String(periods[0]?.StartDate || '').slice(0, 10);
              if (first) return first;
            }
          } catch (err) {
            if (err.name === 'AbortError') throw err;
            console.warn('[useFinancialReport] Gagal baca C_Period, pakai 1 Januari:', err.message);
          }
          return `${String(dateTo).slice(0, 4)}-01-01`;
        };

        const yearStart = needYear ? await resolveFiscalYearStart() : null;
        const periodStart = dateFrom || yearStart || null;

        // Batas bawah Fact_Acct: kalau ada baris Total/Natural harus dari awal
        // (null = tanpa batas bawah). Kalau hanya Year/Period, cukup mulai dari
        // tanggal paling awal yang dibutuhkan -> data yang ditarik jauh lebih kecil.
        let lowerBound = null;
        if (!needTotal) {
          const starts = [];
          if (usedTypes.has('Y')) starts.push(yearStart);
          if (usedTypes.has('P')) starts.push(periodStart);
          lowerBound = starts.filter(Boolean).sort()[0] ?? null;
        }

        // 3. Fetch Data Transaksi (Fact_Acct)
        const dateFilter = lowerBound
          ? `DateAcct ge '${lowerBound}' and DateAcct le '${dateTo}'`
          : `DateAcct le '${dateTo}'`;

        const factRows = await fetchAllPages(
          `/api/v1/models/Fact_Acct?$filter=C_AcctSchema_ID eq ${acctSchemaId} and PostingType eq 'A' and ${dateFilter}&$select=Account_ID,AmtAcctDr,AmtAcctCr,DateAcct&$orderby=Fact_Acct_ID`,
          100,
          signal
        );

        // 4. Agregasi Saldo per Akun — 3 bucket sekaligus dalam satu pass:
        //    total (semua s/d dateTo), year (>= awal tahun), period (>= periodStart)
        const emptyBucket = () => ({ dr: 0, cr: 0 });
        const balanceByAccount = new Map();
        for (let i = 0; i < factRows.length; i++) {
          const row = factRows[i];
          const accId = getId(row.Account_ID);
          if (!accId) continue;

          const dr = parseNum(row.AmtAcctDr);
          const cr = parseNum(row.AmtAcctCr);
          const d = String(row.DateAcct || '').slice(0, 10); // 'YYYY-MM-DD'

          let entry = balanceByAccount.get(accId);
          if (!entry) {
            entry = { total: emptyBucket(), year: emptyBucket(), period: emptyBucket() };
            balanceByAccount.set(accId, entry);
          }

          entry.total.dr += dr;
          entry.total.cr += cr;
          if (yearStart && d >= yearStart) {
            entry.year.dr += dr;
            entry.year.cr += cr;
          }
          if (periodStart && d >= periodStart) {
            entry.period.dr += dr;
            entry.period.cr += cr;
          }
        }

        const getAccountBalance = (accId, periodType) => {
          const entry = balanceByAccount.get(accId);
          if (!entry) return 0;
          const acc = accountMap.get(accId);

          let bucketKey = BUCKET_BY_TYPE[periodType] || 'total';
          if (periodType === 'N') {
            const accType = getValueStr(acc?.AccountType);
            bucketKey = accType === 'R' || accType === 'E' ? 'year' : 'total';
          }
          const bal = entry[bucketKey];

          const debitNormal = acc ? isDebitNormal(acc.AccountType, acc.AccountSign) : true;
          return debitNormal ? bal.dr - bal.cr : bal.cr - bal.dr;
        };

        // 4b. Kalkulasi Nilai Baris Segment ('S') sesuai Period Type barisnya
        const segmentAmounts = new Map();
        for (let i = 0; i < segmentLines.length; i++) {
          const line = segmentLines[i];
          const periodType = effectiveTypeOf(line);

          const sources = sourcesByLineId.get(line.id) || [];
          let lineTotal = 0;

          for (let j = 0; j < sources.length; j++) {
            const accIds = resolveAccountIds(sources[j]);
            for (let k = 0; k < accIds.length; k++) {
              lineTotal += getAccountBalance(accIds[k], periodType);
            }
          }

          segmentAmounts.set(line.id, lineTotal);
        }

        // 5. Evaluasi Nilai Baris Kalkulasi ('C')
        const linesById = new Map();
        for (let i = 0; i < lines.length; i++) {
          linesById.set(lines[i].id, lines[i]);
        }

        const cache = new Map();
        const finalAmounts = new Map();

        for (let i = 0; i < lines.length; i++) {
          const lineId = lines[i].id;
          finalAmounts.set(
            lineId,
            evaluateLine(lineId, linesById, segmentAmounts, cache, new Set())
          );
        }

        // 6. Menyusun Hasil Akhir
        // Baris dengan IsPrinted=false hanya dipakai sebagai helper kalkulasi
        // (mis. referensi Oper_1/Oper_2 pada formula '+'/'-'/Range) — TIDAK
        // ikut ditampilkan/dicetak. Filter ini SENGAJA dilakukan di sini
        // (setelah finalAmounts dihitung dari `lines` yang lengkap/tidak
        // difilter), bukan lewat $filter di query PA_ReportLine — supaya
        // baris kalkulasi lain yang me-reference baris non-print ini tetap
        // bisa resolve nilainya dengan benar.
        const result = lines
          .filter((line) => line.IsPrinted !== false && line.IsPrinted !== 'N')
          .map((line) => ({
            id: line.id,
            name: line.Name,
            description: line.Description,
            seqNo: line.SeqNo,
            lineType: getValueStr(line.LineType),
            isDetail: line.IsDetail === true || line.IsDetail === 'Y',
            isPageBreak: line.IsPageBreak === true || line.IsPageBreak === 'Y',
            // Kode stroke (SD/DS/DT/DSD/DDS/DDT) — lihat shared/utils/reportLineStroke.js
            // untuk mapping ke CSS border-style (HTML) atau vector jsPDF.
            overlineStroke: getValueStr(line.OverlineStrokeType) || null,
            underlineStroke: getValueStr(line.UnderlineStrokeType) || null,
            amount: finalAmounts.get(line.id) || 0,
          }));

        setReportLines(result);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Gagal memuat laporan keuangan');
      } finally {
        setLoading(false);
      }
    },
    [reportLineSetId, acctSchemaId, dateFrom, dateTo, mode, token, fetchAllPages, evaluateLine]
  );

  useEffect(() => {
    const controller = new AbortController();
    buildReport(controller.signal);

    return () => {
      controller.abort();
    };
  }, [buildReport]);

  return {
    reportLines,
    loading,
    error,
    refetch: () => buildReport(),
  };
}

export default useFinancialReport;