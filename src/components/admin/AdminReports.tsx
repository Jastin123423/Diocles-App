import React, { useState, useMemo } from 'react';
import {
  FileText,
  Printer,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Download,
  Users,
  Package,
  Layers,
  PieChart,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ReportService } from '../../services/reportService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

export const AdminReports: React.FC = () => {
  const { currentUser, dbState, addToast } = useApp();
  const [reportPeriod, setReportPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  if (!currentUser || currentUser.role !== 'ADMIN') return null;

  const settings = dbState.settings;

  const dateRange = useMemo(() => {
    const now = new Date();
    if (reportPeriod === 'today') {
      const d = now.toISOString().slice(0, 10);
      return { from: d, to: d };
    }
    if (reportPeriod === 'week') {
      const past = new Date(now.getTime() - 7 * 86400000);
      return { from: past.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
    }
    if (reportPeriod === 'month') {
      const past = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: past.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
    }
    return { from: customStartDate || undefined, to: customEndDate || undefined };
  }, [reportPeriod, customStartDate, customEndDate]);

  const summary = useMemo(() => {
    return ReportService.getFinancialSummary(dateRange, currentUser);
  }, [dateRange, currentUser, dbState]);

  const handlePrintReport = () => {
    window.print();
  };

  const handleExportCSV = () => {
    let csv = `Report: Financial Summary (${reportPeriod.toUpperCase()})\n`;
    csv += `Generated At: ${new Date().toLocaleString()}\n`;
    csv += `Currency: ${settings.currencyCode}\n\n`;
    csv += `Gross Sales,Cost of Goods,Gross Profit,Margin %,Expenses,Net Profit,Net Margin %,Transactions\n`;
    csv += `${summary.totalGrossSales},${summary.totalCostOfGoods},${summary.totalGrossProfit},${summary.profitMarginPercent}%,${summary.totalExpenses},${summary.netProfit},${summary.netMarginPercent}%,${summary.transactionCount}\n\n`;

    csv += `Top Products\n`;
    csv += `Product Name,SKU,Units Sold,Revenue,Profit\n`;
    (summary.topProducts || []).forEach(p => {
      csv += `"${p.name}","${p.sku}",${p.unitsSold},${p.revenue},${p.profit}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `financial_report_${reportPeriod}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    addToast({
      type: 'success',
      title: 'Report Exported',
      description: 'CSV report downloaded successfully.',
    });
  };

  return (
    <div id="admin-reports-view" className="flex-1 p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Financial & Profit/Loss Reports</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit store performance, gross margins, operating expenses, and cash breakdown
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Period Selector */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
            {[
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'Last 7 Days' },
              { id: 'month', label: 'This Month' },
              { id: 'custom', label: 'Custom' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setReportPeriod(p.id as any)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  reportPeriod === p.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold transition"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrintReport}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Custom Date Inputs if active */}
      {reportPeriod === 'custom' && (
        <div className="mb-5 p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3 text-xs">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-slate-400">Custom Date Range:</span>
          <input
            type="date"
            value={customStartDate}
            onChange={e => setCustomStartDate(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
          />
          <span className="text-slate-500">to</span>
          <input
            type="date"
            value={customEndDate}
            onChange={e => setCustomEndDate(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
          />
        </div>
      )}

      {/* Profit & Loss Statement Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl mb-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-bold text-white uppercase tracking-wider">
              Income Statement Summary
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Period: {dateRange.from || 'Start'} to {dateRange.to || 'Present'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Revenue & Gross Margin */}
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-2 border-b border-slate-800/80">
              <span className="text-slate-300 font-medium">Gross Revenue (Completed Sales)</span>
              <span className="font-mono font-bold text-white text-sm">
                {formatCurrency(summary.totalGrossSales, settings.currencySymbol)}
              </span>
            </div>

            <div className="flex justify-between py-2 border-b border-slate-800/80 text-slate-400">
              <span>Less: Cost of Goods Sold (COGS)</span>
              <span className="font-mono text-rose-400">
                -{formatCurrency(summary.totalCostOfGoods, settings.currencySymbol)}
              </span>
            </div>

            <div className="flex justify-between py-2.5 bg-slate-950/80 px-3 rounded-lg border border-slate-800">
              <div>
                <span className="font-bold text-white">Gross Operating Profit</span>
                <span className="text-[10px] text-emerald-400 block font-mono">
                  {summary.profitMarginPercent}% Margin
                </span>
              </div>
              <span className="font-mono font-bold text-emerald-400 text-base">
                {formatCurrency(summary.totalGrossProfit, settings.currencySymbol)}
              </span>
            </div>
          </div>

          {/* Overhead Expenses & Net Bottom Line */}
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-2 border-b border-slate-800/80 text-slate-400">
              <span>Less: Operating Overhead Expenses</span>
              <span className="font-mono text-rose-400">
                -{formatCurrency(summary.totalExpenses, settings.currencySymbol)}
              </span>
            </div>

            <div className="flex justify-between py-2 border-b border-slate-800/80 text-slate-400">
              <span>Average Order Value</span>
              <span className="font-mono text-white">
                {formatCurrency(
                  summary.transactionCount > 0
                    ? summary.totalGrossSales / summary.transactionCount
                    : 0,
                  settings.currencySymbol
                )}
              </span>
            </div>

            <div
              className={`flex justify-between py-2.5 px-3 rounded-lg border ${
                summary.netProfit >= 0
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-rose-500/10 border-rose-500/30'
              }`}
            >
              <div>
                <span className="font-bold text-white">NET PROFIT / (LOSS)</span>
                <span className="text-[10px] text-slate-300 block font-mono">
                  {summary.netMarginPercent}% Net Return
                </span>
              </div>
              <span
                className={`font-mono font-extrabold text-base ${
                  summary.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatCurrency(summary.netProfit, settings.currencySymbol)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2 Columns: Top Selling Products & Sales by Seller */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white">Product Profitability Breakdown</h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2 font-semibold">Product</th>
                  <th className="pb-2 text-center font-semibold">Qty</th>
                  <th className="pb-2 text-right font-semibold">Revenue</th>
                  <th className="pb-2 text-right font-semibold">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(summary.topProducts || []).map(p => (
                  <tr key={p.sku}>
                    <td className="py-2.5 text-white font-medium">
                      <div>{p.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{p.sku}</div>
                    </td>
                    <td className="py-2.5 text-center font-mono text-slate-300">{p.unitsSold}</td>
                    <td className="py-2.5 text-right font-mono font-medium text-white">
                      {formatCurrency(p.revenue, settings.currencySymbol)}
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-emerald-400">
                      +{formatCurrency(p.profit, settings.currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sellers */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold text-white">Seller Performance Contribution</h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2 font-semibold">Seller Name</th>
                  <th className="pb-2 text-center font-semibold">Orders</th>
                  <th className="pb-2 text-right font-semibold">Total Sales</th>
                  <th className="pb-2 text-right font-semibold">Gross Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {(summary.sellerSales || []).map(seller => (
                  <tr key={seller.name}>
                    <td className="py-2.5 text-white font-semibold">{seller.name}</td>
                    <td className="py-2.5 text-center font-mono text-slate-300">{seller.count}</td>
                    <td className="py-2.5 text-right font-mono font-medium text-white">
                      {formatCurrency(seller.total, settings.currencySymbol)}
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-emerald-400">
                      +{formatCurrency(seller.profit, settings.currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
