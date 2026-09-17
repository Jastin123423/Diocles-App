import React, { useState, useMemo } from 'react';
import { Search, Receipt, Calendar, Filter, Eye, Pencil, X, CheckCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SalesService, CartItemInput } from '../../services/salesService';
import { Sale } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

export const SellerSales: React.FC = () => {
  const { currentUser, showReceipt, dbState, addToast } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('ALL');

  // Edit Request Modal
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editItems, setEditItems] = useState<CartItemInput[]>([]);
  const [editReason, setEditReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Track which sales have pending edit requests
  const [submittedSaleIds, setSubmittedSaleIds] = useState<Set<string>>(new Set());

  if (!currentUser) return null;

  const settings = dbState.settings;
  const products = dbState.products || [];

  // Get pending edit requests for this seller
  const pendingRequests = useMemo(() => {
    const requests = dbState.saleEditRequests || [];
    return requests.filter(
      r => r.requestedByUserId === currentUser.id && r.status === 'PENDING'
    );
  }, [dbState.saleEditRequests, currentUser.id]);

  // Combine with local state
  const pendingSaleIds = useMemo(() => {
    const ids = new Set(submittedSaleIds);
    pendingRequests.forEach(r => ids.add(r.saleId));
    return ids;
  }, [submittedSaleIds, pendingRequests]);

  // Query sales restricted to current seller
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

  // Open edit request modal
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

  // Handle submit edit request
  const handleSubmitEditRequest = () => {
    if (!editingSale || !currentUser) return;

    if (!editReason.trim()) {
      addToast({
        type: 'warning',
        title: 'Sababu Inahitajika',
        description: 'Tafadhali toa sababu ya kuomba marekebisho haya.',
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
      // Add sale ID to submitted set
      setSubmittedSaleIds(prev => {
        const newSet = new Set(prev);
        newSet.add(editingSale.id);
        return newSet;
      });
      
      addToast({
        type: 'success',
        title: 'Ombi Limesafirishwa',
        description: 'Ombi lako la marekebisho limesafirishwa kwa admin kwa idhini.',
      });
      setEditingSale(null);
      setEditItems([]);
      setEditReason('');
    } else {
      addToast({
        type: 'error',
        title: 'Ombi Limeshindikana',
        description: result.error || 'Haikuweza kutuma ombi la marekebisho.',
      });
    }
  };

  return (
    <div id="seller-sales-view" className="flex-1 p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">My Sales History</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Log of all sales transactions executed under your account (@{currentUser.username})
          </p>
        </div>

        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              Filtered Volume
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

      {/* Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 mb-5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1">
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
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Payment Methods</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="MOBILE_MONEY">Mobile Money</option>
            <option value="BANK">Bank</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-slate-400">
            <Calendar className="w-3.5 h-3.5" />
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
            />
            <span>to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
            />
          </div>
          {(startDate || endDate || searchQuery || paymentFilter !== 'ALL') && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSearchQuery('');
                setPaymentFilter('ALL');
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 font-medium transition"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Sales List Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                <th className="py-3 px-4 font-semibold">Receipt Number</th>
                <th className="py-3 px-4 font-semibold">Date & Time</th>
                <th className="py-3 px-4 font-semibold">Products Sold</th>
                <th className="py-3 px-4 font-semibold">Payment Method</th>
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
                      <td className="py-3.5 px-4 text-slate-400">{formatDateTime(sale.createdAt)}</td>
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
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            sale.status === 'COMPLETED'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {sale.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                        {formatCurrency(sale.total, settings.currencySymbol)}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1.5">
                        <button
                          onClick={() => showReceipt(sale)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white text-[11px] font-semibold transition"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View</span>
                        </button>
                        {!isVoided && (
                          hasPendingRequest ? (
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
                          )
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

      {/* Edit Request Modal */}
      {editingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 my-auto">
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
              <strong>Approval Required:</strong> Your edit request will be sent to admin for review. Stock will be adjusted after approval.
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Sababu ya Marekebisho *</label>
                <input
                  type="text"
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                  placeholder="Mfano: Kiasi kimewekwa vibaya, mteja amerudisha bidhaa..."
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
                      <div className="w-20">
                        <label className="text-[10px] text-slate-400 block">Idadi</label>
                        <input
                          type="number"
                          min="0"
                          value={item.quantity}
                          onChange={e => {
                            const val = e.target.value;
                            const newItems = [...editItems];
                            newItems[idx] = { 
                              ...newItems[idx], 
                              quantity: val === '' ? '' as any : parseInt(val) || 0 
                            };
                            setEditItems(newItems);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono text-center text-xs"
                        />
                      </div>
                      <div className="w-24">
                        <label className="text-[10px] text-slate-400 block">Unit Price</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={e => {
                            const val = e.target.value;
                            const newItems = [...editItems];
                            newItems[idx] = { 
                              ...newItems[idx], 
                              unitPrice: val === '' ? '' as any : parseFloat(val) || 0 
                            };
                            setEditItems(newItems);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono text-xs"
                        />
                      </div>
                      <div className="w-20">
                        <label className="text-[10px] text-slate-400 block">Discount</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.discount || 0}
                          onChange={e => {
                            const val = e.target.value;
                            const newItems = [...editItems];
                            newItems[idx] = { 
                              ...newItems[idx], 
                              discount: val === '' ? 0 : parseFloat(val) || 0 
                            };
                            setEditItems(newItems);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono text-xs"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setEditingSale(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
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
