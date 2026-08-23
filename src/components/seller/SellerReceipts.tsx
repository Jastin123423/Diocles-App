import React, { useState } from 'react';
import { Search, Receipt, Printer, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SalesService } from '../../services/salesService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

export const SellerReceipts: React.FC = () => {
  const { currentUser, showReceipt, dbState } = useApp();
  const [receiptNumberInput, setReceiptNumberInput] = useState('');
  const [searchedSale, setSearchedSale] = useState<any>(null);
  const [searchError, setSearchError] = useState('');

  if (!currentUser) return null;
  const settings = dbState.settings;

  // Recent sales for quick lookup
  const recentSales = SalesService.getSales({}, currentUser).slice(0, 8);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    setSearchedSale(null);

    const cleanInput = receiptNumberInput.trim();
    if (!cleanInput) return;

    const sale = SalesService.getSaleByReceipt(cleanInput, currentUser);
    if (sale) {
      setSearchedSale(sale);
    } else {
      setSearchError(`No receipt found with number '${cleanInput}' under your account.`);
    }
  };

  return (
    <div id="seller-receipts-view" className="flex-1 p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      <div className="mb-6 pb-4 border-b border-slate-800">
        <h2 className="text-xl font-bold text-white tracking-tight">Receipt Lookup & Reprint</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Search receipt by unique transaction number or select recent sales to view/reprint thermal slips
        </p>
      </div>

      {/* Search Box */}
      <div className="max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-8 shadow-xl">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Receipt className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={receiptNumberInput}
              onChange={e => setReceiptNumberInput(e.target.value)}
              placeholder="e.g. REC-20260822-4821"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition shadow"
          >
            Find Receipt
          </button>
        </form>

        {searchError && (
          <p className="text-xs text-rose-400 mt-2.5 font-medium">{searchError}</p>
        )}

        {searchedSale && (
          <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between animate-in fade-in">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-white text-xs">{searchedSale.receiptNumber}</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                  {searchedSale.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {formatDateTime(searchedSale.createdAt)} • {(searchedSale.items || []).length} items • {searchedSale.paymentMethod}
              </p>
              <p className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                {formatCurrency(searchedSale.total, settings.currencySymbol)}
              </p>
            </div>

            <button
              onClick={() => showReceipt(searchedSale)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow transition"
            >
              <Printer className="w-4 h-4" />
              <span>Preview & Print</span>
            </button>
          </div>
        )}
      </div>

      {/* Quick Access List */}
      <div>
        <h3 className="text-sm font-bold text-white mb-3">Recent Receipts Available for Reprint</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {recentSales.map(sale => (
            <div
              key={sale.id}
              className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between hover:border-slate-700 transition"
            >
              <div>
                <div className="font-mono font-bold text-xs text-white">{sale.receiptNumber}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {formatDateTime(sale.createdAt)} • {(sale.items || []).length} items
                </div>
                <div className="font-mono font-bold text-xs text-emerald-400 mt-1">
                  {formatCurrency(sale.total, settings.currencySymbol)} ({sale.paymentMethod})
                </div>
              </div>

              <button
                onClick={() => showReceipt(sale)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Reprint</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
