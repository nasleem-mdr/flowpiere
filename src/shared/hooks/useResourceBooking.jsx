import { useState, useCallback } from "react";
import {
  fkId,
  getModelRecords,
  createModelRecord,
  updateModelRecord,
  deleteModelRecord,
} from "@/api/idempiereApi"; // pastikan idempiereApi.additions.js sudah digabung ke file ini

/**
 * useResourceBooking
 * -------------------
 * VERSI FINAL: React app cuma pernah menulis ke S_Booking (dokumen approval-capable).
 * S_ResourceAssignment dibuat/di-link/dihapus otomatis di server oleh
 * MBooking.completeIt() / voidIt() - lihat java/MBooking.java.
 *
 * Timeline menampilkan S_Booking (bukan S_ResourceAssignment) supaya booking yang
 * masih Drafted/In Progress (menunggu approval) tetap kelihatan di kalender dan
 * ikut dihitung di overlap-check - persis seperti keputusan arsitektur yang sudah
 * dibahas (mencegah dua orang submit request bentrok selagi salah satunya masih
 * diproses approval-nya).
 *
 * @param {number} resourceTypeId - S_ResourceType_ID (mis. tipe "Ruang Meeting")
 */

// DocStatus yang dianggap "sudah tidak mengikat" -> diabaikan dari overlap-check
// dan boleh ditampilkan beda (pudar) di timeline. Selaras dengan isOverlap() di MBooking.java.
const INACTIVE_DOC_STATUSES = ["VO", "RE", "??"];

// className vis-timeline per DocStatus, biar booking yang masih pending approval
// kelihatan beda dari yang sudah Completed. Sesuaikan CSS-nya sendiri kalau perlu.
const DOC_STATUS_CLASS = {
  DR: "booking-drafted",
  IP: "booking-inprogress",
  CO: "booking-completed",
  CL: "booking-closed",
  VO: "booking-voided",
  RE: "booking-reversed",
};

export function useResourceBooking(resourceTypeId, docTypeTargetId) {
  const [groups, setGroups] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ---------- LOAD ----------

  const loadGroups = useCallback(async () => {
    const params = {
      "$filter": `S_ResourceType_ID eq ${resourceTypeId}`,
      "$select": "S_Resource_ID,Name",
    };
    console.log("[useResourceBooking] GET s_resource ->", params);

    let res;
    try {
      res = await getModelRecords("s_resource", params);
    } catch (e) {
      console.error("[useResourceBooking] GET s_resource GAGAL:", e.message);
      throw e;
    }
    console.log("[useResourceBooking] GET s_resource response:", res);

    const mapped = (res?.records || []).map((r) => ({
      id: String(r.id), // bxservice balikin PK sebagai field flat "id", bukan "S_Resource_ID"
      content: r.Name,
    }));
    console.log(`[useResourceBooking] loadGroups() -> ${mapped.length} group(s):`, mapped);
    return mapped;
  }, [resourceTypeId]);

  const loadItems = useCallback(async (start, end) => {
    // Catatan tanggal: format filter di bawah BELUM diverifikasi ke server kamu -
    // kalau GET ini gagal, cek dulu body error-nya.
    const params = {
      "$filter":
        `AssignDateFrom ge '${start.toISOString()}' and AssignDateFrom le '${end.toISOString()}' and IsActive eq 'Y'`,
      "$orderby": "S_Resource_ID",
    };
    console.log("[useResourceBooking] GET s_booking ->", params);

    let res;
    try {
      res = await getModelRecords("s_booking", params);
    } catch (e) {
      console.error("[useResourceBooking] GET s_booking GAGAL:", e.message);
      throw e;
    }
    console.log("[useResourceBooking] GET s_booking response:", res);

    const mapped = (res?.records || []).map((b) => {
      const docStatus = fkId(b.DocStatus) ?? b.DocStatus;
      return {
        id: String(b.id), // PK flat, sama seperti s_resource
        group: String(fkId(b.S_Resource_ID) ?? b.S_Resource_ID), // FK, kemungkinan nested {id, identifier}
        start: b.AssignDateFrom,
        end: b.AssignDateTo,
        content: b.Name,
        title: `${b.Description || ""} (${fkLabelSafe(b.DocStatus) || docStatus || ""})`,
        editable: docStatus !== "CO" && docStatus !== "CL",
        className: DOC_STATUS_CLASS[docStatus] || "",
        _raw: {
          docStatus,
          sResourceAssignmentId: fkId(b.S_ResourceAssignment_ID) ?? b.S_ResourceAssignment_ID,
        },
      };
    });
    console.log(`[useResourceBooking] loadItems() -> ${mapped.length} item(s):`, mapped);
    return mapped;
  }, []);

  const refresh = useCallback(
    async (rangeStart, rangeEnd) => {
      console.log("[useResourceBooking] refresh() dipanggil, range:", rangeStart, "->", rangeEnd);
      if (!resourceTypeId) {
        console.warn(
          "[useResourceBooking] resourceTypeId kosong/undefined! " +
            "Pastikan <BookingTimeline resourceTypeId={...} /> dikirim propnya."
        );
      }
      setLoading(true);
      setError(null);
      try {
        const g = await loadGroups();
        const i = await loadItems(rangeStart, rangeEnd);
        setGroups(g);
        setItems(i);
        console.log("[useResourceBooking] refresh() selesai:", { groups: g.length, items: i.length });
      } catch (e) {
        console.error("[useResourceBooking] refresh() GAGAL:", e);
        setError(e);
      } finally {
        setLoading(false);
      }
    },
    [loadGroups, loadItems, resourceTypeId]
  );

  // ---------- VALIDASI ----------

  function validateDraft(draft) {
    if (!draft.name || !draft.name.trim()) {
      throw new BookingValidationError("Nama booking wajib diisi.");
    }
    if (!draft.assignFrom || !draft.assignTo) {
      throw new BookingValidationError("Tanggal mulai dan selesai wajib diisi.");
    }
    if (!(new Date(draft.assignFrom) < new Date(draft.assignTo))) {
      throw new BookingValidationError("Waktu mulai harus sebelum waktu selesai.");
    }
    if (draft.isWeekly && !draft.weeklyEndDate) {
      throw new BookingValidationError("Tanggal akhir pengulangan mingguan wajib diisi.");
    }
    if (draft.isWeekly && !(new Date(draft.weeklyEndDate) > new Date(draft.assignTo))) {
      throw new BookingValidationError("Tanggal akhir pengulangan harus setelah waktu selesai booking pertama.");
    }
  }

  // ---------- OVERLAP CHECK ----------
  // Query S_Booking (bukan S_ResourceAssignment) - port persis dari isOverlap() di MBooking.java,
  // mengabaikan status Voided/Reversed/Unknown.
  async function checkOverlap({ resourceId, assignFrom, assignTo, excludeBookingId = 0 }) {
    // Filter status TIDAK dikirim ke server (operator "ne" ditolak server ini dengan
    // 400 "Unsupported operator") - jadi exclude status dilakukan di JS setelah fetch,
    // pakai cuma operator yang sudah terbukti didukung: eq, lt, gt.
    const params = {
      "$filter":
        `S_Resource_ID eq ${resourceId} and IsActive eq 'Y'` +
        ` and AssignDateFrom lt '${new Date(assignTo).toISOString()}'` +
        ` and AssignDateTo gt '${new Date(assignFrom).toISOString()}'`,
      "$select": "S_Booking_ID,DocStatus",
    };
    console.log("[useResourceBooking] checkOverlap ->", params);
    const res = await getModelRecords("s_booking", params);

    const overlapping = (res?.records || []).filter((b) => {
      const docStatus = fkId(b.DocStatus) ?? b.DocStatus;
      if (INACTIVE_DOC_STATUSES.includes(docStatus)) return false; // Voided/Reversed - abaikan
      if (excludeBookingId && b.id === excludeBookingId) return false; // booking yang sedang di-edit sendiri
      return true;
    });

    const isOverlap = overlapping.length > 0;
    console.log("[useResourceBooking] checkOverlap result:", isOverlap, overlapping);
    return isOverlap;
  }

  // ---------- CREATE + langsung Complete (trigger completeIt() di server) ----------
  //
  // Terkonfirmasi dari dokumentasi bxservice/idempiere-rest: field khusus "doc-action"
  // (huruf kecil, pakai tanda hubung) di body PUT yang men-trigger DocumentEngine/processIt()
  // di server - BUKAN nama kolom "DocAction" biasa (itu kolom data biasa, beda mekanisme).
  async function createBooking(draft) {
    validateDraft(draft);

    if (!docTypeTargetId) {
      throw new BookingValidationError(
        "C_DocTypeTarget_ID belum di-setup. Bikin Document Type 'Booking' dulu di Application " +
          "Dictionary (Window > Document Type), lalu kirim ID-nya ke useResourceBooking(resourceTypeId, docTypeTargetId)."
      );
    }

    const occurrences = [{ from: draft.assignFrom, to: draft.assignTo }];

    if (draft.isWeekly) {
      let from = new Date(draft.assignFrom);
      let to = new Date(draft.assignTo);
      const end = new Date(draft.weeklyEndDate);
      while (true) {
        from = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
        to = new Date(to.getTime() + 7 * 24 * 60 * 60 * 1000);
        if (from >= end) break;
        occurrences.push({ from: from.toISOString(), to: to.toISOString() });
      }
    }

    // All-or-nothing: cek overlap dulu di client sebelum insert manapun
    // (proteksi cepat; overlap final tetap divalidasi ulang server-side saat completeIt()).
    for (const occ of occurrences) {
      const overlap = await checkOverlap({
        resourceId: draft.sResourceId,
        assignFrom: occ.from,
        assignTo: occ.to,
      });
      if (overlap) {
        throw new BookingValidationError(
          `Jadwal bentrok pada ${new Date(occ.from).toLocaleString("id-ID")} - ${new Date(
            occ.to
          ).toLocaleString("id-ID")}`
        );
      }
    }

    const created = [];
    for (const occ of occurrences) {
      // 1. Insert draft
      const draftRecord = await createModelRecord("s_booking", {
        Name: draft.name,
        Description: draft.description || "",
        S_Resource_ID: draft.sResourceId,
        C_DocTypeTarget_ID: docTypeTargetId,
        AssignDateFrom: occ.from,
        AssignDateTo: occ.to,
      });
      console.log("[useResourceBooking] createModelRecord s_booking (draft) ->", draftRecord);

      // 2. Trigger Complete (lihat catatan di atas kalau ini tidak berefek)
      const bookingId = draftRecord.id; // sama pola dengan s_resource: PK flat "id", bukan "S_Booking_ID"
      if (!bookingId) {
        console.warn(
          "[useResourceBooking] Response POST s_booking tidak punya field 'id' - " +
            "cek struktur response di atas, mungkin nama field beda lagi.",
          draftRecord
        );
      }
      const completed = await updateModelRecord("s_booking", bookingId, {
        "doc-action": "CO",
      });
      console.log("[useResourceBooking] trigger Complete s_booking ->", completed);

      created.push(completed || draftRecord);
    }
    return created;
  }

  // ---------- UPDATE waktu/resource (drag & drop / resize) ----------
  // Hanya masuk akal untuk booking yang MASIH Drafted/In Progress (item.editable
  // sudah di-set false di loadItems() untuk yang Completed/Closed).
  async function updateBookingTime(bookingId, { resourceId, start, end }) {
    const overlap = await checkOverlap({
      resourceId,
      assignFrom: start,
      assignTo: end,
      excludeBookingId: bookingId,
    });
    if (overlap) {
      throw new BookingValidationError("Jadwal bentrok dengan booking lain di resource ini.");
    }
    return updateModelRecord("s_booking", bookingId, {
      S_Resource_ID: resourceId,
      AssignDateFrom: start,
      AssignDateTo: end,
    });
  }

  // ---------- DELETE / VOID ----------
  // Untuk dokumen yang sudah Completed, delete fisik biasanya TIDAK diizinkan
  // oleh iDempiere (dokumen ter-lock). Yang benar: trigger DocAction=VO (Void),
  // bukan DELETE - itu memanggil voidIt() di server yang otomatis hapus
  // S_ResourceAssignment terkait.
  async function voidBooking(bookingId) {
    return updateModelRecord("s_booking", bookingId, { "doc-action": "VO" });
  }

  // Delete fisik hanya aman untuk booking yang MASIH Drafted (belum pernah Complete).
  async function deleteBooking(bookingId) {
    return deleteModelRecord("s_booking", bookingId);
  }

  return {
    groups,
    items,
    loading,
    error,
    refresh,
    createBooking,
    updateBookingTime,
    voidBooking,
    deleteBooking,
    checkOverlap,
    validateDraft,
  };
}

function fkLabelSafe(field) {
  return field?.identifier || field?.Name || null;
}

export class BookingValidationError extends Error {}