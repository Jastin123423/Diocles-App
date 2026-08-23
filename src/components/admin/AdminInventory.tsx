import React, { useState } from 'react';
import {
  Boxes,
  AlertTriangle,
  PackageX,
  DollarSign,
  Plus,
  ArrowUpDown,
  History,
  X,
  Search,
  Filter,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { InventoryService } from '../../services/inventoryService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

export const AdminInventory: React.FC = () => {
  const { currentUser, dbState, addToast, selectedShopId } = useApp();
  const [activeTab, setActiveTabState] = useState<'stock' | 'movements'>('stock');
  const [searchQuery, setSearchQuery] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('ALL');

  // Stock Adjustment Modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [adjustmentCategory, setAdjustmentCategory] = useState<'DAMAGED' | 'BROKEN' | 'EXPIRED' | 'LOST' | 'CORRECTION' | 'RESTOCK'>('CORRECTION');
  const [adjustmentType, setAdjustmentType] = useState<'IN' | 'OUT' | 'SET'>('OUT');
  const [quantityInput, setQuantityInput] = useState('5');
  const [reasonInput, setReasonInput] = useState('');
  const [modalError, setModalError] = useState('');

  if (!currentUser || currentUser.role !== 'ADMIN') return null;

  const settings = dbState.settings;
  const valuation = InventoryService.getInventoryValuation(selectedShopId, currentUser);
  const allMovements = InventoryService.getMovementHistory(
    {
      shopId: selectedShopId === 'ALL' ? undefined : selectedShopId,
      search: searchQuery,
    },
    currentUser
  );

  const movements = allMovements.filter(m => {
    if (movementTypeFilter === 'ALL') return true;
    return m.type === movementTypeFilter;
  });

  const products = dbState.products.filter(p => {
    const matchesShop = selectedShopId === 'ALL' || p.shopId === selectedShopId;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    return matchesShop && matchesSearch;
  });

  const selectedProduct = dbState.products.find(p => p.id === selectedProductId);
  const inputQty = parseInt(quantityInput, 10) || 0;
  const calculatedLossValue = selectedProduct ? (inputQty * (selectedProduct.purchasePrice || 0)) : 0;

  const handleAdjustStock = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    const targetProduct = dbState.products.find(p => p.id === selectedProductId);
    if (!targetProduct) {
      setModalError('Please select a valid product.');
      return;
    }

    const qty = parseInt(quantityInput, 10);
    if (isNaN(qty) || qty <= 0) {
      setModalError('Quantity must be a positive number.');
      return;
    }

    let delta = 0;
    if (adjustmentType === 'IN') {
      delta = qty;
    } else if (adjustmentType === 'OUT') {
      delta = -qty;
    } else if (adjustmentType === 'SET') {
      delta = qty - targetProduct.currentStock;
    }

    const finalReason = reasonInput.trim() 
      ? `[${adjustmentCategory}] ${reasonInput.trim()}`
      : `[${adjustmentCategory}] Stock adjustment`;

    const res = InventoryService.adjustStock(
      selectedProductId,
      targetProduct.currentStock + delta,
      finalReason,
      currentUser,
      adjustmentCategory
    );

    if (res.success) {
      addToast({
        type: 'success',
        title: 'Stock Adjustment Logged',
        description: `Inventory for '${targetProduct.name}' updated (${delta > 0 ? '+' : ''}${delta} ${targetProduct.unit}). Loss/Cost valuation recorded.`,
      });
      setIsAdjustModalOpen(false);
      setSelectedProductId('');
      setReasonInput('');
      setQuantityInput('5');
    } else {
      setModalError(res.error || 'Failed to adjust stock.');
    }
  };

  return (
    <div id="admin-inventory-view" className="flex-1 p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Inventory & Stock Control</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitor real-time warehouse stock, track COGS inventory valuation, and perform stock adjustments
          </p>
        </div>

        <button
          id="stock-adjust-btn"
          onClick={() => {
            setSelectedProductId(dbState.products[0]?.id || '');
            setIsAdjustModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg transition"
        >
          <ArrowUpDown className="w-4 h-4" />
          <span>Manual Stock Adjustment</span>
        </button>
      </div>

      {/* Valuation & Stock Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total SKUs</span>
            <Boxes className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{valuation.totalProducts}</div>
          <p className="text-[11px] text-slate-400 mt-1">{valuation.totalUnitsInStock} total units in stock</p>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Low / Out of Stock</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-300 font-mono">
            {valuation.lowStockCount}{' '}
            <span className="text-sm font-normal text-rose-400">({valuation.outOfStockCount} zero)</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Requires procurement restock</p>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Stock Valuation (Cost)</span>
            <DollarSign className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-300 font-mono">
            {formatCurrency(valuation.totalCostValue, settings.currencySymbol)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Total invested capital at purchase</p>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Retail Valuation</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">
            {formatCurrency(valuation.totalRetailValue, settings.currencySymbol)}
          </div>
          <p className="text-[11px] text-emerald-400/80 mt-1">
            Potential margin: +{formatCurrency(valuation.potentialProfit, settings.currencySymbol)}
          </p>
        </div>
      </div>

      {/* Sub-view Switcher Tabs */}
      <div className="flex items-center gap-2 mb-5 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTabState('stock')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'stock'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Live Stock Table</span>
        </button>

        <button
          onClick={() => setActiveTabState('movements')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'movements'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Inventory Movement Log ({movements.length})</span>
        </button>
      </div>

      {/* Tab 1: Live Stock Table */}
      {activeTab === 'stock' && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search product stock..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                  <th className="py-3 px-4 font-semibold">SKU</th>
                  <th className="py-3 px-4 font-semibold">Product Name</th>
                  <th className="py-3 px-4 text-center font-semibold">Current Stock</th>
                  <th className="py-3 px-4 text-center font-semibold">Min Threshold</th>
                  <th className="py-3 px-4 text-right font-semibold">Cost / Unit</th>
                  <th className="py-3 px-4 text-right font-semibold">Total Cost Value</th>
                  <th className="py-3 px-4 text-right font-semibold">Retail Value</th>
                  <th className="py-3 px-4 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {products.map(p => {
                  const isLow = p.currentStock <= p.minStock;
                  const isOut = p.currentStock <= 0;

                  return (
                    <tr key={p.id} className="hover:bg-slate-850/60 transition">
                      <td className="py-3 px-4 font-mono text-slate-400">{p.sku}</td>
                      <td className="py-3 px-4 font-semibold text-white">{p.name}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                            isOut
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : isLow
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          {p.currentStock} {p.unit}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-400">
                        {p.minStock} {p.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400">
                        {formatCurrency(p.purchasePrice, settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-purple-300 font-medium">
                        {formatCurrency(p.currentStock * p.purchasePrice, settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-400 font-bold">
                        {formatCurrency(p.currentStock * p.sellingPrice, settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedProductId(p.id);
                            setIsAdjustModalOpen(true);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition"
                        >
                          Adjust
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Movement Log */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={movementTypeFilter}
              onChange={e => setMovementTypeFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Movement Types</option>
              <option value="DAMAGED">💥 Damaged Stock</option>
              <option value="BROKEN">🔨 Broken Stock</option>
              <option value="EXPIRED">⏳ Expired Items</option>
              <option value="LOST">🔍 Lost / Missing</option>
              <option value="CORRECTION">⚖️ Count Corrections</option>
              <option value="RESTOCK">📦 Restock Adjustments</option>
              <option value="SALE">🛒 Sales (Decrements)</option>
              <option value="PURCHASE">🚚 Purchases / Stock In</option>
              <option value="RETURN">↩️ Returns / Restocks</option>
            </select>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                  <th className="py-3 px-4 font-semibold">Timestamp</th>
                  <th className="py-3 px-4 font-semibold">Product</th>
                  <th className="py-3 px-4 font-semibold">Type</th>
                  <th className="py-3 px-4 text-center font-semibold">Quantity Delta</th>
                  <th className="py-3 px-4 text-center font-semibold">Stock Before</th>
                  <th className="py-3 px-4 text-center font-semibold">Stock After</th>
                  <th className="py-3 px-4 text-right font-semibold">Cost / Loss Value</th>
                  <th className="py-3 px-4 font-semibold">Reason / Reference</th>
                  <th className="py-3 px-4 font-semibold">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {movements.map(m => {
                  const isPositive = m.changeQty > 0;
                  const isLossType = ['DAMAGED', 'BROKEN', 'EXPIRED', 'LOST'].includes(m.type);

                  return (
                    <tr key={m.id} className="hover:bg-slate-850/60 transition">
                      <td className="py-3 px-4 text-slate-400 font-mono">{formatDateTime(m.createdAt)}</td>
                      <td className="py-3 px-4 font-medium text-white">{m.productName}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isLossType
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}>
                          {m.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold">
                        <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                          {isPositive ? `+${m.changeQty}` : m.changeQty}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-400">{m.previousQty}</td>
                      <td className="py-3 px-4 text-center font-mono text-white font-semibold">{m.newQty}</td>
                      <td className="py-3 px-4 text-right font-mono font-medium">
                        {m.costValue !== undefined ? (
                          <span className={isLossType ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                            {formatCurrency(m.costValue, settings.currencySymbol)}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-300 max-w-[200px] truncate">{m.reason}</td>
                      <td className="py-3 px-4 text-slate-400">{m.userName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual Stock Adjustment Modal */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Stock Adjustment & Loss Tracking</h3>
              </div>
              <button
                onClick={() => setIsAdjustModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleAdjustStock} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Select Product *</label>
                <select
                  value={selectedProductId}
                  onChange={e => setSelectedProductId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Choose Product --</option>
                  {dbState.products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current: {p.currentStock} {p.unit}, Cost: {formatCurrency(p.purchasePrice, settings.currencySymbol)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Adjustment Reason Category *</label>
                <select
                  value={adjustmentCategory}
                  onChange={e => {
                    const cat = e.target.value as any;
                    setAdjustmentCategory(cat);
                    if (['DAMAGED', 'BROKEN', 'EXPIRED', 'LOST'].includes(cat)) {
                      setAdjustmentType('OUT');
                    } else if (cat === 'RESTOCK') {
                      setAdjustmentType('IN');
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="DAMAGED">💥 Damaged Goods (Broken in handling)</option>
                  <option value="BROKEN">🔨 Broken Items (Defective / Unusable)</option>
                  <option value="EXPIRED">⏳ Expired Products</option>
                  <option value="LOST">🔍 Lost / Missing Stock</option>
                  <option value="CORRECTION">⚖️ Inventory Count Correction</option>
                  <option value="RESTOCK">📦 Restock / Found Stock</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Adjustment Action</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustmentType('IN')}
                    className={`py-2 rounded-lg font-semibold transition ${
                      adjustmentType === 'IN'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                    }`}
                  >
                    + Add Stock
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustmentType('OUT')}
                    className={`py-2 rounded-lg font-semibold transition ${
                      adjustmentType === 'OUT'
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                    }`}
                  >
                    - Deduct Stock
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustmentType('SET')}
                    className={`py-2 rounded-lg font-semibold transition ${
                      adjustmentType === 'SET'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                    }`}
                  >
                    = Set Exact
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {adjustmentType === 'SET' ? 'New Exact Stock Level' : 'Quantity Units'}
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={quantityInput}
                  onChange={e => setQuantityInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Financial Cost / Loss Impact Preview */}
              {selectedProduct && adjustmentType === 'OUT' && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs space-y-1">
                  <div className="flex justify-between text-rose-300 font-medium">
                    <span>Estimated Loss (at purchase cost):</span>
                    <span className="font-bold font-mono">
                      {formatCurrency(calculatedLossValue, settings.currencySymbol)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Calculated based on unit purchase cost ({formatCurrency(selectedProduct.purchasePrice, settings.currencySymbol)}/unit).
                  </p>
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-medium mb-1">Notes / Explanation (Optional)</label>
                <textarea
                  rows={2}
                  value={reasonInput}
                  onChange={e => setReasonInput(e.target.value)}
                  placeholder="e.g. Broken in shipment transit, water leak damage..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow transition"
                >
                  Apply Stock Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
