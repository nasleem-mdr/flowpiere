/** Halaman Product Analysis — tools analisis produk untuk pengambilan keputusan:
 *  history requisition/PO/SO/Invoice, KPI harga & margin, tren harga,
 *  volume bulanan, dan keterkaitan Fact_Acct.
*/
import React from 'react';
import { useProductAnalysis } from '../hooks';
import {
  ProductSearchInput, KpiCards, PriceTrendChart,
  MonthlyVolumeChart, DocsTable, FactAcctTable,
} from '../components';
import '@/css/ProductAnalysis.css';

export default function ProductAnalysisContainer() {
  const {
    product, data, kpis, priceSeries, monthlySeries,
    loading, error, findProducts, selectProduct, clear,
  } = useProductAnalysis();

  return (
    <div className="pa-page">
      <header className="pa-page__header">
        <div>
          <h1 className="pa-page__title">Analisis Produk</h1>
          <p className="pa-page__sub">
            History transaksi, tren harga, dan jejak accounting untuk pendukung keputusan
          </p>
        </div>
        {product && (
          <button type="button" className="pa-btn pa-btn--ghost" onClick={clear}>
            ✕ Ganti Produk
          </button>
        )}
      </header>

      <div className="pa-page__search">
        <ProductSearchInput onSearch={findProducts} onSelect={(p) => selectProduct(p)} disabled={loading} />
      </div>

      {error && <div className="pa-banner pa-banner--error">{error}</div>}

      {!product && !loading && (
        <div className="pa-state pa-state--hero">
          🔍 Cari produk untuk melihat analisis lengkapnya.
        </div>
      )}

      {loading && <div className="pa-state">Menganalisis produk…</div>}

      {product && !loading && (
        <>
          <KpiCards product={product} kpis={kpis} />

          <div className="pa-charts">
            <PriceTrendChart data={priceSeries} loading={false} />
            <MonthlyVolumeChart data={monthlySeries} loading={false} />
          </div>

          <DocsTable data={data} loading={false} />
          <FactAcctTable rows={data.factAcct} loading={false} />
        </>
      )}
    </div>
  );
}
