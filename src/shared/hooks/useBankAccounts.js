import { useState, useEffect } from 'react';
import { idempiereApi, fkId } from '@/api/idempiereApi';

export function useBankAccounts() {
    const [bankAccounts, setBankAccounts] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await idempiereApi(
                    `/models/c_bankaccount?$filter=IsActive eq true&$select=C_BankAccount_ID,Name,IsDefault&$orderby=Name&$top=50`
                );
                const records = Array.isArray(res.records) ? res.records : [];
                const mapped = records.map(ba => ({
                    id:   fkId(ba.C_BankAccount_ID) ?? ba.id,
                    name: ba.Name,
                    isDefault: ba.IsDefault === true || ba.IsDefault === 'Y', // ← tambahan
                })).filter(o => o.id);

                // rekening default naik ke urutan paling atas dropdown
                mapped.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
                setBankAccounts(mapped);
            } catch (err) {
                console.error('Gagal fetch bank accounts:', err.message);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    return { bankAccounts, loading };
}