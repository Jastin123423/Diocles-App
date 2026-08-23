import React, { useState } from 'react';
import {
  Search,
  Plus,
  Package,
  Edit,
  Power,
  X,
  AlertCircle,
  Filter,
  CheckCircle,
  TrendingUp,
  Store,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ProductService } from '../../services/productService';
import { Product } from '../../types';
import { formatCurrency } from '../../utils/formatters';

export const AdminProducts: React.FC = () => {
  const { currentUser, dbState, addToast, selectedShopId } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [shopFilter, setShopFilter] = useState('ALL');

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form Fields
  const [productShopId, setProductShopId] = useState('');
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [currentStock, setCurrentStock] = useState('0');
  const [minStock, setMinStock] = useState('5');
  const [unit, setUnit] = useState('pcs');
  const [formError, setFormError] = useState('');

  if (!currentUser || currentUser.role !== 'ADMIN') return null;

  const settings = dbState.settings;
  const categories = dbState.categories;
  const shops = dbState.shops;

  const products = ProductService.getProducts({
    shopId: shopFilter === 'ALL' ? undefined : shopFilter,
    categoryId: categoryFilter === 'ALL' ? undefined : categoryFilter,
    status: statusFilter === 'ALL' ? undefined : (statusFilter as any),
    search: searchQuery,
  });

  const openAddModal = () => {
    setEditingProduct(null);
    setProductShopId(selectedShopId && selectedShopId !== 'ALL' ? selectedShopId : shops[0]?.id || 'shop-1');
    setName('');
    setSku('');
    setBarcode('');
    setCategoryId(categories[0]?.id || 'cat-supplies');
    setPurchasePrice('');
    setSellingPrice('');
    setCurrentStock('10');
    setMinStock('5');
    setUnit('pcs');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setProductShopId(p.shopId || shops[0]?.id || 'shop-1');
    setName(p.name);
    setSku(p.sku);
    setBarcode(p.barcode);
    setCategoryId(p.categoryId);
    setPurchasePrice(p.purchasePrice.toString());
    setSellingPrice(p.sellingPrice.toString());
    setCurrentStock(p.currentStock.toString());
    setMinStock(p.minStock.toString());
    setUnit(p.unit);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Product title is required.');
      return;
    }

    if (!productShopId) {
      setFormError('Please select a shop/business unit for this product.');
      return;
    }

    const sPrice = parseFloat(sellingPrice);
    const pPrice = parseFloat(purchasePrice) || 0;

    if (isNaN(sPrice) || sPrice < 0) {
      setFormError('Please enter a valid selling price.');
      return;
    }

    if (editingProduct) {
      const res = ProductService.updateProduct(
        editingProduct.id,
        {
          shopId: productShopId,
          name,
          sku: sku.trim(),
          barcode: barcode.trim(),
          categoryId,
          purchasePrice: pPrice,
          sellingPrice: sPrice,
          currentStock: parseInt(currentStock, 10) || 0,
          minStock: parseInt(minStock, 10) || 5,
          unit,
        },
        currentUser
      );

      if (res.success) {
        addToast({
          type: 'success',
          title: 'Product Updated',
          description: `'${name}' details updated in local database.`,
        });
        setIsModalOpen(false);
      } else {
        setFormError(res.error || 'Failed to update product.');
      }
    } else {
      const res = ProductService.createProduct(
        {
          shopId: productShopId,
          name,
          sku: sku.trim() || undefined,
          barcode: barcode.trim() || undefined,
          categoryId,
          purchasePrice: pPrice,
          sellingPrice: sPrice,
          currentStock: parseInt(currentStock, 10) || 0,
          minStock: parseInt(minStock, 10) || 5,
          unit,
        },
        currentUser
      );

      if (res.success) {
        addToast({
          type: 'success',
          title: 'Product Created',
          description: `'${name}' added to inventory catalog.`,
        });
        setIsModalOpen(false);
      } else {
        setFormError(res.error || 'Failed to create product.');
      }
    }
  };

  const handleToggleStatus = (p: Product) => {
    const newStatus = p.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const res = ProductService.toggleProductStatus(p.id, newStatus, currentUser);
    if (res.success) {
      addToast({
        type: 'info',
        title: `Product ${newStatus === 'ACTIVE' ? 'Activated' : 'Deactivated'}`,
        description: `'${p.name}' is now ${newStatus}.`,
      });
    }
  };

  return (
    <div id="admin-products-view" className="flex-1 p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Product Catalog Management</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage cost prices, retail prices, barcodes, categories, and inventory parameters across all business units
          </p>
        </div>

        <button
          id="admin-add-product-btn"
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg transition"
        >
          <Plus className="w-4 h-4" />
          <span>New Product</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 mb-5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search product name, SKU, or barcode..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <select
            value={shopFilter}
            onChange={e => setShopFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Shops</option>
            {shops.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code || 'UNIT'})
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>

        <div className="text-slate-400 font-medium">
          Total Products: <span className="text-white font-bold">{products.length}</span>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                <th className="py-3 px-4 font-semibold">Product Name</th>
                <th className="py-3 px-4 font-semibold">Shop / Unit</th>
                <th className="py-3 px-4 font-semibold">SKU / Barcode</th>
                <th className="py-3 px-4 font-semibold">Category</th>
                <th className="py-3 px-4 text-right font-semibold">Cost Price</th>
                <th className="py-3 px-4 text-right font-semibold">Retail Price</th>
                <th className="py-3 px-4 text-right font-semibold">Margin</th>
                <th className="py-3 px-4 text-center font-semibold">Stock</th>
                <th className="py-3 px-4 text-center font-semibold">Status</th>
                <th className="py-3 px-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-500">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>No products match your criteria.</p>
                  </td>
                </tr>
              ) : (
                products.map(product => {
                  const cat = categories.find(c => c.id === product.categoryId);
                  const shop = shops.find(s => s.id === product.shopId);
                  const isLow = product.currentStock <= product.minStock;
                  const marginPct =
                    product.sellingPrice > 0
                      ? (
                          ((product.sellingPrice - product.purchasePrice) / product.sellingPrice) *
                          100
                        ).toFixed(1)
                      : '0';

                  return (
                    <tr
                      key={product.id}
                      className={`hover:bg-slate-850/60 transition ${
                        product.status === 'INACTIVE' ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 font-semibold text-white">
                        {product.name}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        <span className="px-2 py-0.5 rounded bg-blue-950/70 text-blue-300 border border-blue-800/50 text-[10px] font-semibold">
                          {shop?.name || 'Main Shop'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        <div>{product.sku}</div>
                        <div className="text-[10px] text-slate-500">{product.barcode}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-medium border border-slate-700/60">
                          {cat?.name || 'General'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-400">
                        {formatCurrency(product.purchasePrice, settings.currencySymbol)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                        {formatCurrency(product.sellingPrice, settings.currencySymbol)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-400 font-semibold">
                        {marginPct}%
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                            product.currentStock <= 0
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : isLow
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          {product.currentStock} {product.unit}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            product.status === 'ACTIVE'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {product.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1.5">
                        <button
                          onClick={() => openEditModal(product)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleStatus(product)}
                          title={product.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                            product.status === 'ACTIVE'
                              ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {product.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">
                  {editingProduct ? 'Edit Product' : 'Add New Product'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Assigned Shop / Unit *</label>
                <select
                  value={productShopId}
                  onChange={e => setProductShopId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {shops.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code || 'UNIT'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Product Title *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Bosch Hammer Drill 650W"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Category</label>
                  <select
                    value={categoryId}
                    onChange={e => setCategoryId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Unit of Measure</label>
                  <select
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="pcs">Pieces (pcs)</option>
                    <option value="pack">Pack</option>
                    <option value="box">Box</option>
                    <option value="kg">Kilogram (kg)</option>
                    <option value="pair">Pair</option>
                    <option value="roll">Roll</option>
                    <option value="liter">Liter</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">SKU / Code</label>
                  <input
                    type="text"
                    value={sku}
                    onChange={e => setSku(e.target.value)}
                    placeholder="Auto-generated if empty"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Barcode</label>
                  <input
                    type="text"
                    value={barcode}
                    onChange={e => setBarcode(e.target.value)}
                    placeholder="Scan or enter code"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Cost / Purchase Price</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-slate-500 font-mono">
                      {settings.currencySymbol}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={purchasePrice}
                      onChange={e => setPurchasePrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-6 pr-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Selling / Retail Price *</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-slate-500 font-mono">
                      {settings.currencySymbol}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={sellingPrice}
                      onChange={e => setSellingPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-6 pr-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Current Stock Level</label>
                  <input
                    type="number"
                    value={currentStock}
                    onChange={e => setCurrentStock(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Low-Stock Alert Threshold</label>
                  <input
                    type="number"
                    value={minStock}
                    onChange={e => setMinStock(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
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
                  {editingProduct ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
