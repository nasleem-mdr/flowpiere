// src/pages/BusinessPartnerDetail.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AsyncSelect from 'react-select/async';
import { idempiereApi } from '@/api/idempiereApi';
import useBusinessPartnerDetailSubmit, { parseIdempiereError } from '@/features/master/partner/hooks/useBusinessPartnerDetailSubmit';
import SuccessModal from '@/features/master/product/components/SuccessModal';
import ConfirmModal from '@/features/master/product/components/ConfirmModal';
// CSS dipakai bareng dengan ProductDetail — classname-nya generik
// (card-container, detail-grid, modern-table, dst), bukan spesifik Product,
// jadi sengaja dipakai ulang biar tampilan konsisten antar halaman master
// data. Kalau nanti mau dirapikan, tinggal pindah ke @/css/MasterDetail.css.
import '@/css/PartnerDetail.css';

// Helper generik untuk baca id & label dari field referensi iDempiere REST
// (mis. { id: 1000000, identifier: "Jakarta" }). Sama persis polanya dengan
// getId/getLabel di ProductDetail.jsx.
const KNOWN_FK_FIELDS = new Set([
    "C_BPartner_ID", "C_Location_ID", "C_Country_ID", "C_Region_ID", "C_BP_Group_ID",
]);
const getId = (obj) => {
    if (obj === null || obj === undefined) return undefined;
    if (typeof obj !== "object") return obj; // sudah id mentah (angka/string)
    if (obj.id?.id !== undefined) return obj.id.id;
    if (obj.id !== undefined) return obj.id;
    const pkKey = Object.keys(obj).find((k) => /_ID$/i.test(k) && !KNOWN_FK_FIELDS.has(k));
    if (pkKey) return obj[pkKey];
    const anyIdKey = Object.keys(obj).find((k) => /_ID$/i.test(k));
    return anyIdKey ? obj[anyIdKey] : undefined;
};
const getLabel = (field) => (typeof field === "object" ? field?.identifier : field) || "-";

// Key stabil untuk satu baris alamat, dipakai untuk React `key` maupun
// mencocokkan baris saat edit/hapus di state lokal.
const lineKey = (line) => line.id ?? line._localId;

// Ubah 1 record C_BPartner_Location (hasil $expand=C_Location_ID) jadi
// satu bentuk flat yang dipakai form.
const normalizeLocationLine = (raw) => {
    const loc = raw.C_Location_ID || {};
    return {
        id: getId(raw),                    // PK C_BPartner_Location
        locationId: getId(loc) ?? null,    // PK C_Location (dari hasil $expand)
        Name: raw.Name || "",
        Phone: raw.Phone || "",
        IsBillTo: raw.IsBillTo === true || raw.IsBillTo === "Y",
        IsShipTo: raw.IsShipTo === true || raw.IsShipTo === "Y",
        IsPayFrom: raw.IsPayFrom === true || raw.IsPayFrom === "Y",
        IsRemitTo: raw.IsRemitTo === true || raw.IsRemitTo === "Y",
        Address1: loc.Address1 || "",
        Address2: loc.Address2 || "",
        City: loc.City || "",
        Postal: loc.Postal || "",
        C_Country_ID: getId(loc.C_Country_ID) ?? "",
        CountryLabel: getLabel(loc.C_Country_ID),
        _dirty: false,
    };
};

function BusinessPartnerDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const isNew = !id; // Route /business-partner-detail/new tidak punya param :id

    const [bpartner, setBpartner] = useState(null);
    const [isLoading, setIsLoading] = useState(!isNew);
    const [isEditing, setIsEditing] = useState(isNew);

    const { isSaving, saveBPartnerWithLocations } = useBusinessPartnerDetailSubmit(idempiereApi);

    const [successModal, setSuccessModal] = useState({ isOpen: false, message: "" });
    const showSuccess = (message) => setSuccessModal({ isOpen: true, message });

    const [confirmDeleteLine, setConfirmDeleteLine] = useState(null);

    const [form, setForm] = useState({
        Value: "", Name: "", TaxID: "", Description: "",
        IsVendor: false, IsCustomer: false, IsEmployee: false,
        C_BP_Group_ID: "",
        M_PriceList_ID: "", PO_PriceList_ID: "",
    });

    const [salesPriceLists, setSalesPriceLists] = useState([]);
    const [purchasePriceLists, setPurchasePriceLists] = useState([]);

    const [locationLines, setLocationLines] = useState([]);
    const [deletedLocationLineIds, setDeletedLocationLineIds] = useState([]);
    const [isLoadingLocationLines, setIsLoadingLocationLines] = useState(false);

    const [bpGroups, setBpGroups] = useState([]);
    const [countries, setCountries] = useState([]);

    // Format array negara menjadi opsi bertipe { value, label } untuk react-select
    const countryOptions = useMemo(() => {
        return countries.map((c) => ({
            value: String(getId(c)),
            label: c.Name,
        }));
    }, [countries]);
    // Fungsi pencarian dinamis ke iDempiere REST API saat user mengetik
    const loadCountryOptions = useCallback(async (inputValue) => {
        try {
            let filter = "IsActive eq true";
            if (inputValue && inputValue.trim() !== "") {
                // Filter pencarian case-insensitive berdasarkan Nama atau CountryCode
                const searchVal = inputValue.trim().toLowerCase();
                filter += ` and (contains(tolower(Name), '${searchVal}') or contains(tolower(CountryCode), '${searchVal}'))`;
            }

            // Ambil data terbatas (misal 20-50 record teratas sesuai kata kunci)
            const data = await idempiereApi(
                `/models/c_country?$filter=${encodeURIComponent(filter)}&$select=Name,CountryCode&$orderby=Name`
            );

            return (data.records || []).map((c) => ({
                value: String(getId(c)),
                label: c.Name,
            }));
        } catch (err) {
            console.error("Gagal mencari Country:", err);
            return [];
        }
    }, []);
    // ─── FETCH: data utama Business Partner ─────────────────────────────────
    const fetchBpartner = useCallback(async () => {
        if (isNew) return;
        setIsLoading(true);
        try {
            const data = await idempiereApi(
                `/models/c_bpartner/${id}?$select=Value,Name,TaxID,Description,IsVendor,IsCustomer,IsEmployee,C_BP_Group_ID,M_PriceList_ID,PO_PriceList_ID`
            );
            setBpartner(data);
            setForm({
                Value: data.Value || "",
                Name: data.Name || "",
                TaxID: data.TaxID || "",
                Description: data.Description || "",
                IsVendor: data.IsVendor === true || data.IsVendor === "Y",
                IsCustomer: data.IsCustomer === true || data.IsCustomer === "Y",
                IsEmployee: data.IsEmployee === true || data.IsEmployee === "Y",
                C_BP_Group_ID: getId(data.C_BP_Group_ID) ?? "",
                M_PriceList_ID: getId(data.M_PriceList_ID) ?? "",
                PO_PriceList_ID: getId(data.PO_PriceList_ID) ?? "",
            });
        } catch (err) {
            console.error("Gagal mengambil data Business Partner:", err);
        } finally {
            setIsLoading(false);
        }
    }, [id, isNew]);

    // ─── FETCH: baris alamat (C_BPartner_Location, di-$expand ke C_Location) ─
    const fetchLocationLines = useCallback(async () => {
        if (isNew) return;
        setIsLoadingLocationLines(true);
        try {
            const query = `/models/c_bpartner_location?$filter=C_BPartner_ID eq ${id}&$expand=C_Location_ID`;
            const data = await idempiereApi(query);
            setLocationLines((data.records || []).map(normalizeLocationLine));
        } catch (err) {
            console.error("Gagal mengambil alamat (C_BPartner_Location):", err);
            setLocationLines([]);
        } finally {
            setIsLoadingLocationLines(false);
        }
    }, [id, isNew]);
    // ─── FETCH: opsi Price List ───────────────────────────────────────────────
    const fetchPriceLists = useCallback(async () => {
        const q = (isSO) =>
            `/models/m_pricelist?$filter=${encodeURIComponent(
                `IsActive eq true and IsSOPriceList eq ${isSO}`
            )}&$select=Name&$orderby=Name`;
        try {
            const [so, po] = await Promise.all([idempiereApi(q(true)), idempiereApi(q(false))]);
            setSalesPriceLists(so.records || []);
            setPurchasePriceLists(po.records || []);
        } catch (err) {
            console.error("Gagal mengambil Price List:", err);
            setSalesPriceLists([]);
            setPurchasePriceLists([]);
        }
    }, []);
    
    // ─── FETCH: opsi BP Group ───────────────────────────────────────────────
    const fetchBpGroups = useCallback(async () => {
        try {
            const data = await idempiereApi(`/models/c_bp_group?$filter=IsActive eq true&$select=Name,IsDefault`);
            const records = data.records || [];
            setBpGroups(records);
            if (isNew) {
                const def = records.find((g) => g.IsDefault === true || g.IsDefault === "Y") || records[0];
                if (def) setForm((prev) => (prev.C_BP_Group_ID ? prev : { ...prev, C_BP_Group_ID: getId(def) }));
            }
        } catch (err) {
            console.error("Gagal mengambil BP Group:", err);
            setBpGroups([]);
        }
    }, [isNew]);

    // ─── FETCH: opsi Country ($top=500 agar semua negara dari A-Z terangkut) ─
    const fetchCountries = useCallback(async () => {
        try {
            // Coba gunakan limit=500 alih-alih $top=500
            const data = await idempiereApi(
                `/models/c_country?$filter=IsActive eq true&$select=Name,CountryCode&$orderby=Name&limit=500`
            );
            setCountries(data.records || []);
        } catch (err) {
            console.error("Gagal mengambil Country:", err);
            setCountries([]);
        }
    }, []);
    
    useEffect(() => {
        fetchBpartner();
        fetchLocationLines();
        fetchBpGroups();
        fetchPriceLists();
        fetchCountries();
    }, [fetchBpartner, fetchLocationLines, fetchBpGroups, fetchPriceLists, fetchCountries]);

    if (isLoading) return <div className="card-container detail-status">Loading detail...</div>;
    if (!isNew && !bpartner) return <div className="card-container detail-status detail-status-empty">Business Partner tidak ditemukan.</div>;
    
    // ─── Visibilitas Price List berdasarkan flag Customer / Vendor ──────────
    const isYes = (v) => v === true || v === "Y";
    const showSalesPL = isEditing ? form.IsCustomer : isYes(bpartner?.IsCustomer);
    const showPurchasePL = isEditing ? form.IsVendor : isYes(bpartner?.IsVendor);
    
    // ─── Validasi field wajib C_BPartner ────────────────────────────────────
    const validateBpartnerForm = () => {
        const missing = [];
        if (!form.Value?.trim()) missing.push("Search Key");
        if (!form.Name?.trim()) missing.push("Name");
        if (!form.C_BP_Group_ID) missing.push("BP Group");
        // Price List wajib sesuai peran: Customer -> Sales PL, Vendor -> Purchase PL
        // (kalau keduanya dicentang, keduanya wajib; kalau tidak ada yang dicentang, tidak wajib)
        if (form.IsCustomer && !form.M_PriceList_ID) missing.push("Sales Price List (wajib untuk Customer)");
        if (form.IsVendor && !form.PO_PriceList_ID) missing.push("Purchase Price List (wajib untuk Vendor)");
        return missing;
    };

    const validateLocationLines = () => {
        const problems = [];
        locationLines.forEach((l, idx) => {
            if (!String(l.Name || "").trim()) problems.push(`Baris alamat #${idx + 1}: Nama Alamat wajib diisi`);
            if (!l.C_Country_ID) problems.push(`Baris alamat #${idx + 1}: Country wajib dipilih`);
        });
        return problems;
    };

    // ─── SAVE (satu pintu) ──────────────────────────────────────────────────
    const handleSaveAll = async () => {
        const missing = validateBpartnerForm();
        if (missing.length > 0) {
            alert(`Field berikut wajib diisi terlebih dahulu:\n- ${missing.join("\n- ")}`);
            return;
        }

        const lineProblems = validateLocationLines();
        if (lineProblems.length > 0) {
            alert(`Perbaiki dulu baris alamat berikut:\n- ${lineProblems.join("\n- ")}`);
            return;
        }

        const bpartnerPayload = {
            Value: form.Value.trim(),
            Name: form.Name.trim(),
            TaxID: form.TaxID,
            Description: form.Description,
            IsVendor: form.IsVendor,
            IsCustomer: form.IsCustomer,
            IsEmployee: form.IsEmployee,
            C_BP_Group_ID: { id: parseInt(form.C_BP_Group_ID, 10) },
        };

        // Price List hanya dikirim sesuai peran BP. Kalau peran tidak dicentang,
        // field TIDAK dikirim (baik mode baru maupun edit) — bxservice REST API
        // menolak `null` untuk kolom FK ("Could not convert value null for ...").
        // Konsekuensinya: nilai lama pada peran yang sudah dimatikan tetap tersimpan
        // di database, tapi tidak dipakai dan tidak tampil di form.
        if (form.IsCustomer) {
            bpartnerPayload.M_PriceList_ID = { id: parseInt(form.M_PriceList_ID, 10) };
        }
        if (form.IsVendor) {
            bpartnerPayload.PO_PriceList_ID = { id: parseInt(form.PO_PriceList_ID, 10) };
        }

        const locationLinesPayload = locationLines.map((l) => ({
            id: l.id ?? null,
            locationId: l.locationId ?? null,
            Name: l.Name,
            Phone: l.Phone,
            IsBillTo: l.IsBillTo,
            IsShipTo: l.IsShipTo,
            IsPayFrom: l.IsPayFrom,
            IsRemitTo: l.IsRemitTo,
            Address1: l.Address1,
            Address2: l.Address2,
            City: l.City,
            Postal: l.Postal,
            C_Country_ID: l.C_Country_ID,
            _dirty: l._dirty === true,
        }));

        try {
            const newBpId = await saveBPartnerWithLocations({
                isNew,
                bpartnerId: id,
                bpartnerPayload,
                locationLines: locationLinesPayload,
                deletedLocationLineIds,
            });

            setDeletedLocationLineIds([]);

            if (isNew) {
                showSuccess("Business Partner baru berhasil dibuat beserta alamatnya.");
                navigate(`/business-partner/${newBpId}`, { replace: true });
            } else {
                await Promise.all([fetchBpartner(), fetchLocationLines()]);
                setIsEditing(false);
                showSuccess("Data Business Partner beserta alamat berhasil disimpan.");
            }
        } catch (err) {
            console.error("Gagal menyimpan Business Partner:", err);
            let message = parseIdempiereError(err);
            if (err.step) {
                message += `\n\n(Gagal pada tahap: ${err.step})`;
            }
            if (err.partial?.bpartnerId) {
                message += isNew
                    ? `\nBusiness Partner sempat berhasil dibuat (BP ID: ${err.partial.bpartnerId}) sebelum gagal. Buka lagi lewat menu Edit untuk melanjutkan/melengkapi alamatnya.`
                    : `\nData C_BPartner induk sudah tersimpan — hanya sebagian baris alamat yang gagal diproses.`;
            }
            alert(`Gagal menyimpan Business Partner.\n\n${message}`);
        }
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setDeletedLocationLineIds([]);
        fetchBpartner();
        fetchLocationLines();
    };

    // ─── Handler Perubahan Baris Alamat ─────────────────────────────────────
    const handleLocationLineChange = (line, field, value) => {
        setLocationLines((prev) =>
            prev.map((l) => {
                if (lineKey(l) !== lineKey(line)) return l;
                const updated = { ...l, [field]: value };
                if (l.id) updated._dirty = true;
                return updated;
            })
        );
    };

    const handleAddLocationLine = () => {
        const defaultCountry =
            countries.find((c) => c.CountryCode === "ID") ||
            countries.find((c) => c.Name === "Indonesia") ||
            countries[0];
        setLocationLines((prev) => [
            ...prev,
            {
                _localId: `new-loc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                id: null,
                locationId: null,
                Name: "",
                Phone: "",
                IsBillTo: false,
                IsShipTo: false,
                IsPayFrom: false,
                IsRemitTo: false,
                Address1: "",
                Address2: "",
                City: "",
                Postal: "",
                C_Country_ID: defaultCountry ? getId(defaultCountry) : "",
                CountryLabel: defaultCountry?.Name || "",
            },
        ]);
    };

    const handleDeleteLocationLine = (line) => {
        setConfirmDeleteLine(line);
    };

    const confirmDeleteLocationLine = () => {
        const line = confirmDeleteLine;
        if (!line) return;
        if (line.id) {
            setDeletedLocationLineIds((prev) => [...prev, line.id]);
        }
        setLocationLines((prev) => prev.filter((l) => lineKey(l) !== lineKey(line)));
        setConfirmDeleteLine(null);
    };

    const cancelDeleteLocationLine = () => setConfirmDeleteLine(null);

    return (
        <div className="card-container">
            <div className="detail-topbar">
                <button onClick={() => navigate(-1)} className="btn-back">← Back to List</button>
                <span className="product-id-badge">{isNew ? "Business Partner Baru" : `BP ID: ${id}`}</span>
                {isNew ? (
                    <div className="topbar-actions">
                        <button className="btn btn-ghost" onClick={() => navigate(-1)} disabled={isSaving}>Batal</button>
                        <button className="btn btn-primary" onClick={handleSaveAll} disabled={isSaving}>
                            {isSaving ? "Menyimpan..." : "💾 Buat Business Partner"}
                        </button>
                    </div>
                ) : !isEditing ? (
                    <button className="btn btn-secondary" onClick={() => setIsEditing(true)}>✏ Edit</button>
                ) : (
                    <div className="topbar-actions">
                        <button className="btn btn-ghost" onClick={handleCancelEdit} disabled={isSaving}>Batal</button>
                        <button className="btn btn-primary" onClick={handleSaveAll} disabled={isSaving}>
                            {isSaving ? "Menyimpan..." : "💾 Simpan"}
                        </button>
                    </div>
                )}
            </div>

            <div className="detail-grid">
                {/* SECTION 1: INFORMASI UTAMA */}
                <div className="detail-section">
                    <h3>General Information</h3>
                    <div className="info-group">
                        <label>Search Key *</label>
                        {isEditing ? (
                            <input value={form.Value} onChange={(e) => setForm({ ...form, Value: e.target.value })} />
                        ) : <p>{bpartner.Value}</p>}

                        <label>Name *</label>
                        {isEditing ? (
                            <input value={form.Name} onChange={(e) => setForm({ ...form, Name: e.target.value })} />
                        ) : <p>{bpartner.Name}</p>}

                        <label>Tax ID</label>
                        {isEditing ? (
                            <input value={form.TaxID} onChange={(e) => setForm({ ...form, TaxID: e.target.value })} />
                        ) : <p>{bpartner.TaxID || '-'}</p>}

                        <label>Description</label>
                        {isEditing ? (
                            <textarea value={form.Description} onChange={(e) => setForm({ ...form, Description: e.target.value })} />
                        ) : <p>{bpartner.Description || '-'}</p>}
                    </div>
                </div>

                {/* SECTION 2: KLASIFIKASI */}
                <div className="detail-section">
                    <h3>Classification</h3>
                    <div className="info-group">
                        <label>BP Group *</label>
                        {isEditing ? (
                            <select
                                value={form.C_BP_Group_ID}
                                onChange={(e) => setForm({ ...form, C_BP_Group_ID: e.target.value })}
                            >
                                <option value="">-- Pilih BP Group --</option>
                                {bpGroups.map((g, idx) => (
                                    <option key={getId(g) ?? `bpg-${idx}`} value={getId(g)}>{g.Name || getId(g)}</option>
                                ))}
                            </select>
                        ) : <p>{getLabel(bpartner.C_BP_Group_ID)}</p>}

                        <label>Vendor</label>
                        {isEditing ? (
                            <input type="checkbox" checked={form.IsVendor} onChange={(e) => setForm({ ...form, IsVendor: e.target.checked })} />
                        ) : <p>{bpartner.IsVendor ? 'Yes' : 'No'}</p>}

                        <label>Customer</label>
                        {isEditing ? (
                            <input type="checkbox" checked={form.IsCustomer} onChange={(e) => setForm({ ...form, IsCustomer: e.target.checked })} />
                        ) : <p>{bpartner.IsCustomer ? 'Yes' : 'No'}</p>}

                        <label>Employee</label>
                        {isEditing ? (
                            <input type="checkbox" checked={form.IsEmployee} onChange={(e) => setForm({ ...form, IsEmployee: e.target.checked })} />
                        ) : <p>{bpartner.IsEmployee ? 'Yes' : 'No'}</p>}
                        {/* di atas return, setelah early return */}
                       
                        {showSalesPL && (
                            <>
                                <label>Sales Price List{isEditing && " *"}</label>
                                {isEditing ? (
                                    <select
                                        value={form.M_PriceList_ID}
                                        onChange={(e) => setForm({ ...form, M_PriceList_ID: e.target.value })}
                                    >
                                        <option value="">-- Pilih Sales Price List --</option>
                                        {salesPriceLists.map((p) => (
                                            <option key={getId(p)} value={getId(p)}>{p.Name}</option>
                                        ))}
                                    </select>
                                ) : <p>{getLabel(bpartner.M_PriceList_ID)}</p>}
                            </>
                        )}
                        
                        {showPurchasePL && (
                            <>
                                <label>Purchase Price List{isEditing && " *"}</label>
                                {isEditing ? (
                                    <select
                                        value={form.PO_PriceList_ID}
                                        onChange={(e) => setForm({ ...form, PO_PriceList_ID: e.target.value })}
                                    >
                                        <option value="">-- Pilih Purchase Price List --</option>
                                        {purchasePriceLists.map((p) => (
                                            <option key={getId(p)} value={getId(p)}>{p.Name}</option>
                                        ))}
                                    </select>
                                ) : <p>{getLabel(bpartner.PO_PriceList_ID)}</p>}
                            </>
                        )}
                    </div>
                </div>

                {/* SECTION 3: ALAMAT */}
                <div className="detail-section" style={{ gridColumn: '1 / -1' }}>
                    <h3>Addresses / Locations (C_BPartner_Location)</h3>

                    {isLoadingLocationLines ? (
                        <p className="muted-note">Memuat...</p>
                    ) : locationLines.length === 0 ? (
                        <p className="empty-note">Belum ada alamat.</p>
                    ) : (
                        <table className="modern-table">
                            <thead>
                                <tr>
                                    <th>Nama Alamat *</th>
                                    <th>Phone</th>
                                    <th>Address 1</th>
                                    <th>Address 2</th>
                                    <th>City</th>
                                    <th>Postal</th>
                                    <th style={{ width: '200px' }}>Country *</th>
                                    <th style={{ textAlign: 'center' }}>Bill To</th>
                                    <th style={{ textAlign: 'center' }}>Ship To</th>
                                    <th style={{ textAlign: 'center' }}>Pay From</th>
                                    <th style={{ textAlign: 'center' }}>Remit To</th>
                                    {isEditing && <th style={{ width: '60px' }}></th>}
                                </tr>
                            </thead>
                            <tbody>
                                {locationLines.map((line) => {
                                    const key = lineKey(line);
                                    return (
                                        <tr key={key}>
                                            {isEditing ? (
                                                <>
                                                    <td>
                                                        <input
                                                            value={line.Name}
                                                            onChange={(e) => handleLocationLineChange(line, "Name", e.target.value)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            value={line.Phone}
                                                            onChange={(e) => handleLocationLineChange(line, "Phone", e.target.value)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            value={line.Address1}
                                                            onChange={(e) => handleLocationLineChange(line, "Address1", e.target.value)}
                                                            style={{ width: '140px' }}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            value={line.Address2}
                                                            onChange={(e) => handleLocationLineChange(line, "Address2", e.target.value)}
                                                            style={{ width: '140px' }}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            style={{ width: '100px' }}
                                                            value={line.City}
                                                            onChange={(e) => handleLocationLineChange(line, "City", e.target.value)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            style={{ width: '80px' }}
                                                            value={line.Postal}
                                                            onChange={(e) => handleLocationLineChange(line, "Postal", e.target.value)}
                                                        />
                                                    </td>
                                                    <td style={{ minWidth: '180px' }}>
                                                    <AsyncSelect
                                                        cacheOptions
                                                        defaultOptions
                                                        loadOptions={loadCountryOptions}
                                                        placeholder="Cari Negara..."
                                                        isClearable
                                                        // Tampilkan value yang sedang terpilih saat ini
                                                        value={
                                                            line.C_Country_ID
                                                                ? {
                                                                    value: String(line.C_Country_ID),
                                                                    label: line.CountryLabel || "Selected",
                                                                }
                                                                : null
                                                        }
                                                        onChange={(selectedOption) => {
                                                            handleLocationLineChange(
                                                                line,
                                                                "C_Country_ID",
                                                                selectedOption ? selectedOption.value : ""
                                                            );
                                                            handleLocationLineChange(
                                                                line,
                                                                "CountryLabel",
                                                                selectedOption ? selectedOption.label : ""
                                                            );
                                                        }}
                                                        styles={{
                                                            control: (base) => ({
                                                                ...base,
                                                                minHeight: '32px',
                                                                fontSize: '13px',
                                                            }),
                                                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                                                        }}
                                                        menuPortalTarget={document.body}
                                                    />
                                                </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <input type="checkbox" checked={line.IsBillTo} onChange={(e) => handleLocationLineChange(line, "IsBillTo", e.target.checked)} />
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <input type="checkbox" checked={line.IsShipTo} onChange={(e) => handleLocationLineChange(line, "IsShipTo", e.target.checked)} />
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <input type="checkbox" checked={line.IsPayFrom} onChange={(e) => handleLocationLineChange(line, "IsPayFrom", e.target.checked)} />
                                                    </td>
                                                    <td style={{ textAlign: 'center' }}>
                                                        <input type="checkbox" checked={line.IsRemitTo} onChange={(e) => handleLocationLineChange(line, "IsRemitTo", e.target.checked)} />
                                                    </td>
                                                    <td className="row-actions">
                                                        <button className="icon-btn icon-btn-delete" title="Hapus alamat" onClick={() => handleDeleteLocationLine(line)}>🗑️</button>
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td><strong>{line.Name || '-'}</strong></td>
                                                    <td>{line.Phone || '-'}</td>
                                                    <td>{line.Address1 || '-'}</td>
                                                    <td>{line.Address2 || '-'}</td>
                                                    <td>{line.City || '-'}</td>
                                                    <td>{line.Postal || '-'}</td>
                                                    <td>{line.CountryLabel}</td>
                                                    <td style={{ textAlign: 'center' }}>{line.IsBillTo ? '✅' : '—'}</td>
                                                    <td style={{ textAlign: 'center' }}>{line.IsShipTo ? '✅' : '—'}</td>
                                                    <td style={{ textAlign: 'center' }}>{line.IsPayFrom ? '✅' : '—'}</td>
                                                    <td style={{ textAlign: 'center' }}>{line.IsRemitTo ? '✅' : '—'}</td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}

                    {isEditing && (
                        <div className="inline-add-box">
                            <button className="btn btn-secondary" onClick={handleAddLocationLine}>+ Tambah Alamat</button>
                        </div>
                    )}
                </div>
            </div>

            <SuccessModal
                isOpen={successModal.isOpen}
                message={successModal.message}
                onClose={() => setSuccessModal({ isOpen: false, message: "" })}
            />

            <ConfirmModal
                isOpen={!!confirmDeleteLine}
                title="Hapus Alamat"
                message={
                    confirmDeleteLine
                        ? `Yakin ingin menghapus alamat "${confirmDeleteLine.Name || '(tanpa nama)'}"? Perubahan baru permanen setelah disimpan.`
                        : ""
                }
                confirmLabel="Hapus"
                cancelLabel="Batal"
                danger
                onConfirm={confirmDeleteLocationLine}
                onCancel={cancelDeleteLocationLine}
            />
        </div>
    );
}

export default BusinessPartnerDetail;