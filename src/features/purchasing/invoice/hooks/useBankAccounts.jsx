// hooks/useBankAccounts.js
import { 
    useState, 
    useEffect, 
} from 'react';

import { idempiereApi, fkId } from '@/api/idempiereApi';

export function useBankAccounts() {
    const [bankAccounts, setBankAccounts] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await idempiereApi(
                    `/models/c_bankaccount?$filter=IsActive eq true&$select=C_BankAccount_ID,Name&$orderby=Name&$top=50`
                );
                const records = Array.isArray(res.records) ? res.records : [];
                setBankAccounts(records.map(ba => ({
                    id:   fkId(ba.C_BankAccount_ID) ?? ba.id,
                    name: ba.Name,
                })).filter(o => o.id));
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
