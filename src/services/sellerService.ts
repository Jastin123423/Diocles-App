import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Receipt,
  Calendar,
  Filter,
  Eye,
  Pencil,
  X,
  CheckCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SalesService, CartItemInput } from '../../services/salesService';
import { CloudflareApi } from '../../services/cloudflareApi';
import { SyncService } from '../../services/syncService';
import { db } from '../../db/storage';
import { Sale } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

type DatePreset = 'TODAY' | 'WEEK' | 'MONTH' | 'CUSTOM';

export const SellerSales: React.FC = () => {
  const { currentUser, showReceipt, dbState, addToast } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('TODAY');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('ALL');

  // Edit Request Modal
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editItems, setEditItems] = useState<CartItemInput[]>([]);
  const [editReason, setEditReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Local cache of sales I just submitted for edit
  const [submittedSaleIds, setSubmittedSaleIds] = useState<Set<string>>(new Set());

  // ---------- Date helpers ----------
  const toYMD = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const computePresetRange = (
    preset: DatePreset
  ): { start: string; end: string } | null => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (preset === 'TODAY') return { start: toYMD(today), end: toYMD(today) };
    if (preset === 'WEEK') {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { start: toYMD(start), end: toYMD(today) };
    }
    if (preset === 'MONTH') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: toYMD(start), end: toYMD(today) };
    }
    return null;
  };

  useEffect(() => {
    if (datePreset === 'CUSTOM') return;
    const range = computePresetRange(datePreset);
    if (range) {
      setStartDate(range.start);
      setEndDate(range.end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datePreset]);

  // ✅ Force pull on mount — this is what was missing
  useEffect(() => {
    const forcePull = async () => {
      try {
        const online = await CloudflareApi.checkConnection();
        if (!online) return;
        console.log('[SellerSales] Force pulling latest sales + edit requests...');
        const pullResult = await CloudflareApi.pullSync();
        if (pullResult.success && pullResult.data) {
          SyncService.applyCloudData(pullResult.data);
          console.log('[SellerSales] Pull complete');
        }
      } catch (err) {
        console.log('[SellerSales] Pull error:', err);
      }
    };
    forcePull();
  }, []);

  // ✅ Manual refresh button handler (optional but useful)
  const refreshFromCloud = async () => {
    setIsRefreshing(true);
    try {
      const online = await CloudflareApi.checkConnection();
      if (!online) {
        addToast({ type: 'error', title: 'Offline', description: 'Cannot refresh now.' });
        return;
      }
      const pullResult = await CloudflareApi.pullSync();
      if (pullResult.success && pullResult.data) {
        SyncService.applyCloudData(pullResult.data);
        addToast({ type: 'success', title: 'Refreshed', description: 'Sales updated.' });
      }
    } catch {
      addToast({ type: 'error', title: 'Refresh Failed', description: 'Try again.' });
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!currentUser) return null;

  const settings = dbState.settings;
  const products = dbState.products || [];

  // All edit requests belonging to me
  const myRequests = useMemo(() => {
    const requests = dbState.saleEditRequests || [];
    return requests.filter(r => r.requestedByUserId === currentUser.id);
  }, [dbState.saleEditRequests, currentUser.id]);

  // Pending edit requests only
  const pendingRequests = useMemo(
    () => myRequests.filter(r => r.status === 'PENDING'),
    [myRequests]
  );

  // ✅ Clean local cache: forget sale IDs whose request is no longer PENDING
  // (i.e., approved or rejected by admin)
  useEffect(() => {
    const stillPending = new Set(pendingRequests.map(r => r.saleId));
    setSubmittedSaleIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => {
        if (stillPending.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [pendingRequests]);

  // Combine local + cloud pending IDs
  const pendingSaleIds = useMemo(() => {
    const ids = new Set(submittedSaleIds);
    pendingRequests.forEach(r => ids.add(r.saleId));
    return ids;
  }, [submittedSaleIds, pendingRequests]);

  const sales = SalesService.getSales(
    {
      search: searchQuery,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      paymentMethod: paymentFilter === 'ALL' ? undefined : (paymentFilter as any),
    },
    currentUser
  );

  const totalVolume = sales.reduce((sum, s) => sum + s.total, 0);

  const openEditRequest = (sale: Sale) => {
    setEditingSale(sale);
    setEditItems(
      sale.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount || 0,
      }))
    );
    setEditReason('');
  };

  const handleSubmitEditRequest = () => {
    if (!editingSale || !currentUser) return;

    if (!editReason.trim()) {
      addToast({
        type: 'warning',
        title: 'Reason Required',
        description: 'Provide a reason for the edit request.',
      });
      return;
    }

    setIsSubmitting(true);
    const result = SalesService.requestSaleEdit(
      editingSale.id,
      editItems,
      editReason,
      currentUser
    );
    setIsSubmitting(false);

    if (result.success) {
      setSubmittedSaleIds(prev => new Set(prev).add(editingSale.id));
      addToast({
        type: 'success',
        title: 'Request Submitted',
        description: 'Your edit request has been sent to admin for approval.',
      });
      setEditingSale(null);
      setEditItems([]);
      setEditReason('');
    } else {
      addToast({
        type: 'error',
        title: 'Submission Failed',
        description: result.error || 'Could not submit edit request.',
      });
    }
  };

  const getPeriodLabel = () => {
    switch (datePreset) {
      case 'TODAY': return 'Today';
      case 'WEEK': return 'Last 7 Days';
      case 'MONTH': return 'This Month';
      case 'CUSTOM': return 'Custom Range';
    }
  };

  const hasActiveFilters =
    searchQuery ||
    paymentFilter !== 'ALL' ||
    datePreset !== 'TODAY' ||
    (datePreset === 'CUSTOM' && (startDate || endDate));

  const presets: { id: DatePreset; label: string; activeClass: string; idleClass: string }[] = [
    { id: 'TODAY', label: 'Today',
      activeClass: 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/30',
      idleClass: 'bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20' },
    { id: 'WEEK', label: 'Week',
      activeClass: 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-500/30',
      idleClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20' },
    { id: 'MONTH', label: 'Month',
      activeClass: 'bg-violet-600 border-violet-500 text-white shadow-md shadow-violet-500/30',
      idleClass: 'bg-violet-500/10 border-violet-500/30 text-violet-300 hover:bg-violet-500/20' },
    { id: 'CUSTOM', label: 'Custom',
      activeClass: 'bg-amber-500 border-amber-400 text-white shadow-md shadow-amber-500/30',
      idleClass: 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20' },
  ];

  return (
    <div id="seller-sales-view" className="flex-1 p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">My Sales History</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Log of sales transactions executed under @{currentUser.username}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={refreshFromCloud}
            disabled={isRefreshing}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition disabled:opacity-50"
            title="Refresh from cloud"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                Volume ({getPeriodLabel()})
              </span>
              <span className="text-base font-bold text-emerald-400 font-mono">
                {formatCurrency(totalVolume, settings.currencySymbol)}
              </span>
            </div>
            <div className="h-7 w-px bg-slate-800"></div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                Transactions
              </span>
              <span className="text-base font-bold text-white font-mono">{sales.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 mb-5 space-y-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search receipt #, items..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <select
            value={paymentFilter}
            onChange={e => setPaymentFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
          >
            <option value="ALL">All Payment Methods</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="MOBILE_MONEY">Mobile Money</option>
            <option value="BANK">Bank</option>
          </select>
        </div>

        <div className="pt-3 border-t border-slate-800/80">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
              Period
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              {presets.map(p => {
                const isActive = datePreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDatePreset(p.id)}
                    className={`px-4 py-2 rounded-lg border text-xs font-semibold transition active:scale-95 ${
                      isActive ? p.activeClass : p.idleClass
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {datePreset === 'CUSTOM' && (
              <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            )}
          </div>
        </div>

        {hasActiveFilters && (
          <div className="pt-2 border-t border-slate-800/80 flex justify-end">
            <button
              onClick={() => {
                setSearchQuery('');
                setPaymentFilter('ALL');
                setDatePreset('TODAY');
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Sales table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                <th className="py-3 px-4 font-semibold">Receipt Number</th>
                <th className="py-3 px-4 font-semibold">Date & Time</th>
                <th className="py-3 px-4 font-semibold">Products Sold</th>
                <th className="py-3 px-4 font-semibold">Payment</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 text-right font-semibold">Amount Paid</th>
                <th className="py-3 px-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>No sales match your search criteria.</p>
                  </td>
                </tr>
              ) : (
                sales.map(sale => {
                  const isVoided = sale.status === 'VOIDED';
                  const hasPendingRequest = pendingSaleIds.has(sale.id);

                  return (
                    <tr key={sale.id} className={`hover:bg-slate-850/60 transition ${isVoided ? 'opacity-65' : ''}`}>
                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        {sale.receiptNumber}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {formatDateTime(sale.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {(sale.items || []).map((item, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/60 text-[11px] text-slate-200"
                            >
                              <span className="font-bold text-blue-400">{item.quantity}x</span>
                              <span className="truncate max-w-[100px]">{item.productName}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-medium uppercase border border-slate-700/60">
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          sale.status === 'COMPLETED'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                        }`}>
                          {sale.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                        {formatCurrency(sale.total, settings.currencySymbol)}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => showReceipt(sale)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white text-[11px] font-semibold transition"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View</span>
                        </button>
                        {!isVoided && (hasPendingRequest ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 text-[11px] font-semibold border border-amber-500/20">
                            <CheckCircle className="w-3 h-3" />
                            <span>Submitted</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => openEditRequest(sale)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/15 hover:bg-amber-600 text-amber-300 hover:text-white text-[11px] font-semibold border border-amber-500/30 transition"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Request Edit</span>
                          </button>
                        ))}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal (unchanged) */}
      {editingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2 text-amber-400">
                <Pencil className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Request Edit - {editingSale.receiptNumber}</h3>
              </div>
              <button onClick={() => setEditingSale(null)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-200 text-xs mb-4">
              <strong>Approval Required:</strong> Your edit request will be sent to admin for review.
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Reason *</label>
                <input
                  type="text"
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                  placeholder="e.g. Wrong quantity entered..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {editItems.map((item, idx) => {
                  const product = products.find(p => p.id === item.productId);
                  return (
                    <div key={idx} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-2">
                      <div className="flex-1">
                        <span className="text-white text-xs font-semibold">{product?.name || 'Unknown'}</span>
                        <span className="text-slate-500 text-[10px] block">{product?.sku || ''}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={item.quantity}
                        onChange={e => {
                          const val = e.target.value;
                          const newItems = [...editItems];
                          newItems[idx] = { ...newItems[idx], quantity: val === '' ? ('' as any) : parseInt(val) || 0 };
                          setEditItems(newItems);
                        }}
                        className="w-16 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono text-center text-xs"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={e => {
                          const val = e.target.value;
                          const newItems = [...editItems];
                          newItems[idx] = { ...newItems[idx], unitPrice: val === '' ? ('' as any) : parseFloat(val) || 0 };
                          setEditItems(newItems);
                        }}
                        className="w-24 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono text-xs"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button onClick={() => setEditingSale(null)} className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs">
                Cancel
              </button>
              <button
                onClick={handleSubmitEditRequest}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Edit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
