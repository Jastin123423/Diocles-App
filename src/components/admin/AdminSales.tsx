import React, { useState } from 'react';
import {
  Search,
  Receipt,
  Filter,
  Calendar,
  Eye,
  Ban,
  X,
  AlertTriangle,
  RotateCcw,
  CheckCircle,
  Printer,
  Download,
  Store,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SalesService } from '../../services/salesService';
import { Sale } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

export const AdminSales: React.FC = () => {
  const { currentUser, showReceipt, dbState, addToast } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [sellerFilter, setSellerFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [shopFilter, setShopFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);

  // Void Sale Dialog
  const [voidingSale, setVoidingSale] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  if (!currentUser || currentUser.role !== 'ADMIN') return null;

  const settings = dbState.settings;
  const sellers = dbState.users.filter(u => u.role === 'SELLER');
  const shops = dbState.shops || [];

  const sales = SalesService.getSales(
    {
      search: searchQuery,
      sellerId: sellerFilter === 'ALL' ? undefined : sellerFilter,
      paymentMethod: paymentFilter === 'ALL' ? undefined : (paymentFilter as any),
      status: statusFilter === 'ALL' ? undefined : (statusFilter as any),
      shopId: shopFilter === 'ALL' ? undefined : shopFilter,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    },
    currentUser
  );

  const totalVolume = sales.reduce((sum, s) => (s.status === 'COMPLETED' ? sum + s.total : sum), 0);
  const totalProfit = sales.reduce((sum, s) => (s.status === 'COMPLETED' ? sum + s.grossProfit : sum), 0);

  const selectedShopName = shopFilter === 'ALL' ? 'All Shops' : (shops.find(s => s.id === shopFilter)?.name || 'Unknown Shop');

  const handleExecuteVoid = () => {
    if (!voidingSale || !currentUser) return;
    if (!voidReason.trim()) {
      addToast({
        type: 'warning',
        title: 'Reason Required',
        description: 'Please provide a reason for cancelling this sale.',
      });
      return;
    }

    setIsVoiding(true);
    const res = SalesService.voidSale(voidingSale.id, voidReason, currentUser);
    setIsVoiding(false);

    if (res.success) {
      addToast({
        type: 'success',
        title: 'Sale Voided & Inventory Restored',
        description: `Receipt #${voidingSale.receiptNumber} marked voided. All product quantities were returned to stock.`,
      });
      setVoidingSale(null);
      setVoidReason('');
    } else {
      addToast({
        type: 'error',
        title: 'Void Failed',
        description: res.error || 'Could not void transaction.',
      });
    }
  };

  // Print Sales Report
  const handlePrint = () => {
    setIsPrinting(true);
    
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) {
      addToast({ type: 'error', title: 'Popup Blocked', description: 'Please allow popups to print.' });
      setIsPrinting(false);
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sales Report - ${selectedShopName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: #fff; color: #1e293b; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 3px double #3b82f6; padding-bottom: 15px; }
          .header h1 { font-size: 24px; color: #1e40af; font-weight: bold; }
          .header .company { font-size: 16px; color: #475569; margin-top: 5px; }
          .header .meta { font-size: 12px; color: #64748b; margin-top: 8px; }
          .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; }
          .summary-card { padding: 15px; border-radius: 8px; text-align: center; }
          .summary-card.total { background: #eff6ff; border: 2px solid #3b82f6; }
          .summary-card.profit { background: #f0fdf4; border: 2px solid #22c55e; }
          .summary-card.count { background: #fef3c7; border: 2px solid #f59e0b; }
          .summary-card .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }
          .summary-card .value { font-size: 22px; font-weight: bold; margin-top: 5px; }
          .summary-card.total .value { color: #1e40af; }
          .summary-card.profit .value { color: #16a34a; }
          .summary-card.count .value { color: #d97706; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          thead { background: #1e293b; color: #fff; }
          th { padding: 10px 8px; text-align: left; font-weight: 600; }
          td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
          tr:nth-child(even) { background: #f8fafc; }
          tr:hover { background: #e0f2fe; }
          .status-completed { color: #16a34a; font-weight: bold; }
          .status-voided { color: #dc2626; font-weight: bold; }
          .amount { text-align: right; font-family: 'Courier New', monospace; font-weight: bold; }
          .items-list { max-width: 250px; }
          .item-tag { display: inline-block; background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px; margin: 2px; font-size: 11px; }
          .footer { text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          .shop-badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${settings.businessName}</h1>
          <div class="company">${settings.tagline || ''}</div>
          <div class="meta">
            <strong>Sales History Report</strong><br>
            Shop: ${selectedShopName} | Period: ${startDate || 'Beginning'} to ${endDate || 'Present'}<br>
            Generated: ${new Date().toLocaleString()}
          </div>
          <div class="shop-badge">🏪 ${selectedShopName}</div>
        </div>

        <div class="summary">
          <div class="summary-card total">
            <div class="label">Total Revenue</div>
            <div class="value">${settings.currencySymbol} ${totalVolume.toLocaleString()}</div>
          </div>
          <div class="summary-card profit">
            <div class="label">Gross Profit</div>
            <div class="value">${settings.currencySymbol} ${totalProfit.toLocaleString()}</div>
          </div>
          <div class="summary-card count">
            <div class="label">Transactions</div>
            <div class="value">${sales.length}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Receipt #</th>
              <th>Date & Time</th>
              <th>Shop</th>
              <th>Seller</th>
              <th>Products Sold</th>
              <th>Payment</th>
              <th>Status</th>
              <th class="amount">Total</th>
              <th class="amount">Profit</th>
            </tr>
          </thead>
          <tbody>
            ${sales.map(sale => `
              <tr>
                <td><strong>${sale.receiptNumber}</strong></td>
                <td>${formatDateTime(sale.createdAt)}</td>
                <td>${sale.shopName || 'N/A'}</td>
                <td>${sale.sellerName}</td>
                <td class="items-list">
                  ${(sale.items || []).map(item => 
                    `<span class="item-tag">${item.quantity}x ${item.productName}</span>`
                  ).join('')}
                </td>
                <td>${sale.paymentMethod}</td>
                <td class="${sale.status === 'COMPLETED' ? 'status-completed' : 'status-voided'}">${sale.status}</td>
                <td class="amount">${settings.currencySymbol} ${sale.total.toLocaleString()}</td>
                <td class="amount">${sale.status === 'COMPLETED' ? `${settings.currencySymbol} ${sale.grossProfit.toLocaleString()}` : `${settings.currencySymbol} 0`}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          ${settings.businessName} - ${settings.address || ''} | Phone: ${settings.phone || 'N/A'}<br>
          ${settings.receiptFooterNote || 'Thank you for your business!'}
        </div>

        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    
    setTimeout(() => setIsPrinting(false), 2000);
  };

  // Export CSV
  const handleExportCSV = () => {
    let csv = `Sales Report - ${selectedShopName}\n`;
    csv += `Generated: ${new Date().toLocaleString()}\n\n`;
    csv += `Receipt #,Date,Shop,Seller,Products,Payment,Status,Total,Profit\n`;
    
    sales.forEach(sale => {
      const products = (sale.items || []).map(i => `${i.quantity}x ${i.productName}`).join('; ');
      csv += `"${sale.receiptNumber}","${formatDateTime(sale.createdAt)}","${sale.shopName || ''}","${sale.sellerName}","${products}","${sale.paymentMethod}","${sale.status}",${sale.total},${sale.status === 'COMPLETED' ? sale.grossProfit : 0}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales_report_${selectedShopName.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div id="admin-sales-view" className="flex-1 p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Sales & Transaction Management</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit store sales, filter by cashier or payment gateway, and manage voiding/cancellations
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-right">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              Completed Revenue
            </span>
            <span className="text-base font-bold text-emerald-400 font-mono">
              {formatCurrency(totalVolume, settings.currencySymbol)}
            </span>
          </div>

          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-right">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              Gross Profit
            </span>
            <span className="text-base font-bold text-blue-400 font-mono">
              {formatCurrency(totalProfit, settings.currencySymbol)}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span>Print Report</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 mb-5 space-y-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search receipt #, seller name, or product item..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <select
            value={shopFilter}
            onChange={e => setShopFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">🏪 All Shops</option>
            {shops.map(s => (
              <option key={s.id} value={s.id}>🏪 {s.name}</option>
            ))}
          </select>

          <select
            value={sellerFilter}
            onChange={e => setSellerFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Sellers / Cashiers</option>
            {sellers.map(s => (
              <option key={s.id} value={s.id}>{s.name} (@{s.username})</option>
            ))}
          </select>

          <select
            value={paymentFilter}
            onChange={e => setPaymentFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Payment Methods</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="MOBILE_MONEY">Mobile Money</option>
            <option value="BANK">Bank</option>
            <option value="OTHER">Other</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="VOIDED">Voided / Cancelled</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Date Range:</span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
            />
          </div>

          {(searchQuery || sellerFilter !== 'ALL' || paymentFilter !== 'ALL' || statusFilter !== 'ALL' || shopFilter !== 'ALL' || startDate || endDate) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSellerFilter('ALL');
                setPaymentFilter('ALL');
                setStatusFilter('ALL');
                setShopFilter('ALL');
                setStartDate('');
                setEndDate('');
              }}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                <th className="py-3 px-4 font-semibold">Receipt Number</th>
                <th className="py-3 px-4 font-semibold">Date & Time</th>
                <th className="py-3 px-4 font-semibold">Shop</th>
                <th className="py-3 px-4 font-semibold">Seller</th>
                <th className="py-3 px-4 font-semibold">Products Sold</th>
                <th className="py-3 px-4 font-semibold">Payment</th>
                <th className="py-3 px-4 text-right font-semibold">Total Revenue</th>
                <th className="py-3 px-4 text-right font-semibold">Profit</th>
                <th className="py-3 px-4 text-center font-semibold">Status</th>
                <th className="py-3 px-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-500">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>No transaction records found matching the filter criteria.</p>
                  </td>
                </tr>
              ) : (
                sales.map(sale => {
                  const isVoided = sale.status === 'VOIDED';

                  return (
                    <tr key={sale.id} className={`hover:bg-slate-850/60 transition ${isVoided ? 'opacity-65' : ''}`}>
                      <td className="py-3 px-4 font-mono font-bold text-white">{sale.receiptNumber}</td>
                      <td className="py-3 px-4 text-slate-400">{formatDateTime(sale.createdAt)}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-blue-950/70 text-blue-300 border border-blue-800/50 text-[10px] font-semibold">
                          🏪 {sale.shopName || 'N/A'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-medium">{sale.sellerName}</td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {(sale.items || []).map((item, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/60 text-[11px] text-slate-200"
                            >
                              <span className="font-bold text-blue-400">{item.quantity}x</span>
                              <span className="truncate max-w-[120px]">{item.productName}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] uppercase font-medium">
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-white">
                        {formatCurrency(sale.total, settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                        {isVoided ? formatCurrency(0, settings.currencySymbol) : `+${formatCurrency(sale.grossProfit, settings.currencySymbol)}`}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            !isVoided
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {sale.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <button
                          onClick={() => showReceipt(sale)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition"
                        >
                          Receipt
                        </button>
                        {!isVoided && (
                          <button
                            onClick={() => {
                              setVoidingSale(sale);
                              setVoidReason('');
                            }}
                            className="px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-600 hover:text-white text-rose-300 text-[11px] font-semibold border border-rose-500/30 transition"
                          >
                            Void Sale
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Void Modal */}
      {voidingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2 text-rose-400">
                <Ban className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Void Sale {voidingSale.receiptNumber}</h3>
              </div>
              <button onClick={() => setVoidingSale(null)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-xs mb-4 flex items-start gap-2">
              <RotateCcw className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong>Automatic Stock Restoration:</strong> Voiding this transaction will preserve the historical record and automatically restock all{' '}
                <strong>{voidingSale.items.reduce((s, i) => s + i.quantity, 0)} units</strong> back into inventory.
              </div>
            </div>

            <div className="space-y-3 text-xs mb-5">
              <label className="block text-slate-300 font-semibold mb-1">Cancellation Reason *</label>
              <textarea
                required
                rows={3}
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                placeholder="e.g. Customer returned items..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button onClick={() => setVoidingSale(null)} className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs">Cancel</button>
              <button onClick={handleExecuteVoid} disabled={isVoiding} className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-bold">
                {isVoiding ? 'Processing...' : 'Confirm Void & Restock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
