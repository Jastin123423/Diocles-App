import React, { useState } from 'react';
import {
  Truck,
  Plus,
  Trash2,
  Calendar,
  DollarSign,
  Search,
  CheckCircle,
  X,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PurchaseService } from '../../services/purchaseService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

interface PurchaseItemInput {
  productId: string;
  quantity: number | string; // Allow empty string
  unitCost: number | string; // Allow empty string
}

export const AdminPurchases: React.FC = () => {
  const { currentUser, dbState, addToast, selectedShopId, currentShop } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Purchase Form state
  const [purchaseShopId, setPurchaseShopId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'PARTIAL' | 'UNPAID'>('PAID');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseItemInput[]>([]);
  const [formError, setFormError] = useState('');

  if (!currentUser) return null;

  const settings = dbState.settings;
  const isSeller = currentUser.role === 'SELLER';
  
  // Available shops for this user
  const availableShops = dbState.shops.filter(s => {
    if (currentUser.role === 'ADMIN') return true;
    const assigned = currentUser.assignedShopIds || [];
    return assigned.length === 0 || assigned.includes(s.id);
  });

  const activeShopId = purchaseShopId || currentShop?.id || (selectedShopId !== 'ALL' ? selectedShopId : '') || availableShops[0]?.id || '';

  // Available products for the selected purchase shop
  const shopProducts = dbState.products.filter(p => !purchaseShopId || purchaseShopId === 'ALL' || p.shopId === purchaseShopId);

  const purchases = PurchaseService.getPurchases(
    {
      shopId: isSeller ? (currentShop?.id || selectedShopId) : (selectedShopId === 'ALL' ? undefined : selectedShopId),
      search: searchQuery,
    },
    currentUser
  );

  const openNewPurchaseModal = () => {
    const targetShop = currentShop?.id || (selectedShopId !== 'ALL' ? selectedShopId : availableShops[0]?.id) || '';
    setPurchaseShopId(targetShop);
    setSupplierName('');
    setInvoiceNumber('');
    setPaymentStatus('PAID');
    setNotes('');
    
    const prodList = dbState.products.filter(p => p.shopId === targetShop);
    const initialProd = prodList[0] || dbState.products[0];
    
    setItems([
      {
        productId: initialProd?.id || '',
        quantity: '', // Empty string instead of 0
        unitCost: '', // Empty string instead of 0
      },
    ]);
    setFormError('');
    setIsModalOpen(true);
  };

  const addItemRow = () => {
    const prodList = dbState.products.filter(p => !purchaseShopId || p.shopId === purchaseShopId);
    const prod = prodList[0] || dbState.products[0];
    setItems(prev => [
      ...prev,
      {
        productId: prod?.id || '',
        quantity: '', // Empty string
        unitCost: '', // Empty string
      },
    ]);
  };

  const removeItemRow = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateItemRow = (idx: number, field: keyof PurchaseItemInput, value: any) => {
    setItems(prev =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        if (field === 'productId') {
          const matched = dbState.products.find(p => p.id === value);
          return {
            ...item,
            productId: value,
            unitCost: matched?.purchasePrice || '',
          };
        }
        return { ...item, [field]: value };
      })
    );
  };

  const calculatedTotal = items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity as string) || 0;
    const cost = parseFloat(item.unitCost as string) || 0;
    return sum + qty * cost;
  }, 0);

  const handleSavePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Supplier name is now OPTIONAL - if empty, use "Walk-in Supplier" or "Unknown Supplier"
    const finalSupplierName = supplierName.trim() || 'Walk-in Supplier';

    if (items.length === 0) {
      setFormError('Please add at least one line item.');
      return;
    }

    // Convert items and validate
    const finalItems = items.map(item => ({
      productId: item.productId,
      quantity: parseFloat(item.quantity as string) || 0,
      unitCost: parseFloat(item.unitCost as string) || 0,
    }));

    for (const item of finalItems) {
      if (item.quantity <= 0) {
        setFormError('Quantity must be greater than 0 for all items.');
        return;
      }
      if (item.unitCost <= 0) {
        setFormError('Unit cost must be greater than 0 for all items.');
        return;
      }
      if (!item.productId) {
        setFormError('Please select a product for all items.');
        return;
      }
    }

    const res = PurchaseService.createPurchase(
      {
        shopId: purchaseShopId || availableShops[0]?.id || '',
        supplierName: finalSupplierName,
        invoiceNumber: invoiceNumber.trim() || undefined,
        items: finalItems,
        paymentStatus,
        notes,
      },
      currentUser
    );

    if (res.success) {
      addToast({
        type: 'success',
        title: 'Purchase Recorded & Stock Ingested',
        description: `Order from ${finalSupplierName} recorded. Product inventories were automatically restocked.`,
      });
      setIsModalOpen(false);
    } else {
      setFormError(res.error || 'Failed to record purchase.');
    }
  };

  return (
    <div id="admin-purchases-view" className="flex-1 p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Supplier Purchases & Stock In</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Log procurement orders, record cost of goods, and automatically increase inventory counts
          </p>
        </div>

        <button
          id="new-purchase-btn"
          onClick={openNewPurchaseModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg transition"
        >
          <Plus className="w-4 h-4" />
          <span>Record Supplier Purchase</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 mb-5 flex items-center justify-between gap-3 text-xs">
        <div className="relative max-w-md flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search supplier, reference #..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="text-slate-400 font-medium">
          Total Purchase Orders: <span className="text-white font-bold">{purchases.length}</span>
        </div>
      </div>

      {/* Purchases Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                <th className="py-3 px-4 font-semibold">Date</th>
                <th className="py-3 px-4 font-semibold">Supplier Name</th>
                <th className="py-3 px-4 font-semibold">Invoice / Ref #</th>
                <th className="py-3 px-4 font-semibold">Items Received</th>
                <th className="py-3 px-4 font-semibold">Payment Status</th>
                <th className="py-3 px-4 text-right font-semibold">Total Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    <Truck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>No supplier purchases recorded yet.</p>
                  </td>
                </tr>
              ) : (
                purchases.map(purchase => (
                  <tr key={purchase.id} className="hover:bg-slate-850/60 transition">
                    <td className="py-3.5 px-4 text-slate-400 font-mono">
                      {formatDateTime(purchase.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white">{purchase.supplierName}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {purchase.invoiceNumber || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      <div>{(purchase.items || []).length} items</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-xs">
                        {(purchase.items || []).map(i => `${i.quantity}x ${i.productName}`).join(', ')}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          purchase.paymentStatus === 'PAID'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {purchase.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-white text-sm">
                      {formatCurrency(purchase.totalAmount, settings.currencySymbol)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: New Purchase */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Record Stock In / Purchase</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleSavePurchase} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Target Shop / Unit *</label>
                <select
                  value={purchaseShopId}
                  onChange={e => setPurchaseShopId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {availableShops.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code || 'UNIT'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Supplier / Vendor Name (Optional)</label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={e => setSupplierName(e.target.value)}
                    placeholder="e.g. Apex Hardware Distro (or leave blank)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Vendor Invoice # (Optional)</label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    placeholder="e.g. INV-98442"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Line Items Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                    Received Inventory Items
                  </label>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {items.map((item, idx) => {
                    const selectedProduct = dbState.products.find(p => p.id === item.productId);
                    
                    return (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-2"
                      >
                        <div className="flex-1">
                          <select
                            value={item.productId}
                            onChange={e => updateItemRow(idx, 'productId', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-white"
                          >
                            {(shopProducts.length > 0 ? shopProducts : dbState.products).map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.sku}) - Stock: {p.currentStock} {p.unit}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="w-20">
                          <input
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={e => {
                              updateItemRow(idx, 'quantity', e.target.value);
                            }}
                            placeholder="Qty"
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-white font-mono text-center"
                          />
                        </div>

                        <div className="w-28">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unitCost}
                            onChange={e => {
                              updateItemRow(idx, 'unitCost', e.target.value);
                            }}
                            placeholder="Cost"
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-white font-mono"
                          />
                        </div>

                        <div className="w-24 text-right font-mono font-bold text-white text-xs">
                          {formatCurrency(
                            (parseFloat(item.quantity as string) || 0) * (parseFloat(item.unitCost as string) || 0),
                            settings.currencySymbol
                          )}
                        </div>

                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItemRow(idx)}
                            className="text-slate-500 hover:text-rose-400 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Payment Status</label>
                  <select
                    value={paymentStatus}
                    onChange={e => setPaymentStatus(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="PAID">Paid in Full</option>
                    <option value="PARTIAL">Partially Paid</option>
                    <option value="UNPAID">Pending / On Credit</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Notes</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Delivered by freight truck"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Total & Action */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <div className="text-xs">
                  <span className="text-slate-400">Total Purchase Cost: </span>
                  <span className="text-base font-bold font-mono text-white">
                    {formatCurrency(calculatedTotal, settings.currencySymbol)}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow transition"
                  >
                    Record & Ingest Stock
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
