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
  Tag,
  Layers,
  FolderTree,
  Check,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ProductService } from '../../services/productService';
import { CategoryService } from '../../services/categoryService';
import { Product, Category, ProductImage } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { ProductThumbnail } from '../common/ProductThumbnail';
import { ProductImageViewerModal } from '../common/ProductImageViewerModal';
import { ProductImageUpload } from '../common/ProductImageUpload';

export const AdminProducts: React.FC = () => {
  const { currentUser, dbState, addToast, selectedShopId } = useApp();
  const [activeSubTab, setActiveSubTab] = useState<'products' | 'categories'>('products');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [shopFilter, setShopFilter] = useState('ALL');
  const [categoryShopFilter, setCategoryShopFilter] = useState('ALL');

  // Add / Edit Product Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Product Form Fields
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
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [formError, setFormError] = useState('');

  // Image Viewer Modal State
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Category Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catShopIdInput, setCatShopIdInput] = useState('');
  const [catNameInput, setCatNameInput] = useState('');
  const [catColorInput, setCatColorInput] = useState('#3b82f6');
  const [catModalError, setCatModalError] = useState('');

  if (!currentUser || currentUser.role !== 'ADMIN') return null;

  const settings = dbState.settings;
  const categories = dbState.categories || [];
  const shops = dbState.shops || [];

  // Filtered categories for product filtering dropdown based on selected shopFilter
  const availableFilterCategories = shopFilter === 'ALL'
    ? categories
    : categories.filter(c => c.shopId === shopFilter);

  const products = ProductService.getProducts({
    shopId: shopFilter === 'ALL' ? undefined : shopFilter,
    categoryId: categoryFilter === 'ALL' ? undefined : categoryFilter,
    status: statusFilter === 'ALL' ? undefined : (statusFilter as any),
    search: searchQuery,
  });

  const openAddModal = () => {
    setEditingProduct(null);
    const initialShopId = selectedShopId && selectedShopId !== 'ALL' ? selectedShopId : shops[0]?.id || '';
    setProductShopId(initialShopId);
    setName('');
    setSku('');
    setBarcode('');
    const shopCats = categories.filter(c => c.shopId === initialShopId && c.status !== 'INACTIVE');
    setCategoryId(shopCats[0]?.id || categories.find(c => c.status !== 'INACTIVE')?.id || categories[0]?.id || '');
    setPurchasePrice('');
    setSellingPrice('');
    setCurrentStock('0');
    setMinStock('5');
    setUnit('pcs');
    setProductImages([]);
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    const pShopId = p.shopId || shops[0]?.id || '';
    setProductShopId(pShopId);
    setName(p.name);
    setSku(p.sku);
    setBarcode(p.barcode);
    setCategoryId(p.categoryId);
    setPurchasePrice(p.purchasePrice.toString());
    setSellingPrice(p.sellingPrice.toString());
    setCurrentStock(p.currentStock.toString());
    setMinStock(p.minStock.toString());
    setUnit(p.unit);
    setProductImages(p.images || []);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleProductShopChange = (newShopId: string) => {
    setProductShopId(newShopId);
    const shopCats = categories.filter(c => c.shopId === newShopId && c.status !== 'INACTIVE');
    if (shopCats.length > 0 && !shopCats.some(c => c.id === categoryId)) {
      setCategoryId(shopCats[0].id);
    }
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
          images: productImages,
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
          images: productImages,
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
        description: `'${p.name}' is now ${newStatus}. Preserved in history.`,
      });
    }
  };

  // Category Actions
  const openAddCategoryModal = (targetShopId?: string) => {
    setEditingCategory(null);
    const defaultShop = targetShopId || (selectedShopId && selectedShopId !== 'ALL' ? selectedShopId : shops[0]?.id || '');
    setCatShopIdInput(defaultShop);
    setCatNameInput('');
    setCatColorInput('#3b82f6');
    setCatModalError('');
    setIsCategoryModalOpen(true);
  };

  const openEditCategoryModal = (cat: Category) => {
    setEditingCategory(cat);
    setCatShopIdInput(cat.shopId || shops[0]?.id || '');
    setCatNameInput(cat.name);
    setCatColorInput(cat.color || '#3b82f6');
    setCatModalError('');
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    setCatModalError('');

    if (!catNameInput.trim()) {
      setCatModalError('Category name is required.');
      return;
    }

    if (!catShopIdInput) {
      setCatModalError('Please select a specific shop for this category.');
      return;
    }

    if (editingCategory) {
      const res = CategoryService.updateCategory(
        editingCategory.id,
        { name: catNameInput.trim(), shopId: catShopIdInput, color: catColorInput },
        currentUser
      );
      if (res.success) {
        addToast({
          type: 'success',
          title: 'Category Updated',
          description: `Category '${catNameInput}' updated for ${shops.find(s => s.id === catShopIdInput)?.name || 'shop'}.`,
        });
        setIsCategoryModalOpen(false);
      } else {
        setCatModalError(res.error || 'Failed to update category.');
      }
    } else {
      const res = CategoryService.createCategory(
        { name: catNameInput.trim(), shopId: catShopIdInput, color: catColorInput },
        currentUser
      );
      if (res.success) {
        addToast({
          type: 'success',
          title: 'Category Created',
          description: `New category '${catNameInput}' created for ${shops.find(s => s.id === catShopIdInput)?.name || 'shop'}.`,
        });
        setIsCategoryModalOpen(false);
      } else {
        setCatModalError(res.error || 'Failed to create category.');
      }
    }
  };

  const handleToggleCategoryStatus = (cat: Category) => {
    if (cat.name.toLowerCase() === 'hardware' && cat.status !== 'INACTIVE') {
      // Default category can be kept active
    }
    const res = CategoryService.toggleCategoryStatus(cat.id, currentUser);
    if (res.success) {
      addToast({
        type: 'info',
        title: 'Category Status Updated',
        description: `Category '${cat.name}' is now ${cat.status === 'INACTIVE' ? 'Active' : 'Inactive'}.`,
      });
    } else {
      addToast({
        type: 'error',
        title: 'Error',
        description: res.error || 'Failed to toggle category status.',
      });
    }
  };

  return (
    <div id="admin-products-view" className="flex-1 p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header with Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Products & Category Management</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure catalog pricing, active/deactivated items, and product classification categories
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
            <button
              onClick={() => setActiveSubTab('products')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition ${
                activeSubTab === 'products' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Products Directory</span>
            </button>
            <button
              onClick={() => setActiveSubTab('categories')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition ${
                activeSubTab === 'categories' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Category Management</span>
              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-mono">
                {categories.length}
              </span>
            </button>
          </div>

          {activeSubTab === 'products' ? (
            <button
              id="admin-add-product-btn"
              onClick={openAddModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg transition"
            >
              <Plus className="w-4 h-4" />
              <span>New Product</span>
            </button>
          ) : (
            <button
              onClick={openAddCategoryModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg transition"
            >
              <Plus className="w-4 h-4" />
              <span>New Category</span>
            </button>
          )}
        </div>
      </div>

      {activeSubTab === 'products' && (
        <>
          {/* Filter and Search Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 mb-5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 flex-1 min-w-[260px] flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
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
                {availableFilterCategories.map(c => {
                  const s = shops.find(shop => shop.id === c.shopId);
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name} {shopFilter === 'ALL' && s ? `(${s.name})` : ''} {c.status === 'INACTIVE' ? '(Inactive)' : ''}
                    </option>
                  );
                })}
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="INACTIVE">Deactivated / Archived Only</option>
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
                    <th className="py-3 px-4 text-right font-semibold">Purchase Price</th>
                    <th className="py-3 px-4 text-right font-semibold">Proposed Price</th>
                    <th className="py-3 px-4 text-right font-semibold">Est Margin</th>
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
                      const proposedPrice = product.proposedSellingPrice || product.sellingPrice;
                      const marginPct =
                        proposedPrice > 0
                          ? (
                              ((proposedPrice - product.purchasePrice) / proposedPrice) *
                              100
                            ).toFixed(1)
                          : '0';

                      return (
                        <tr
                          key={product.id}
                          className={`hover:bg-slate-850/60 transition ${
                            product.status === 'INACTIVE' ? 'opacity-50 bg-slate-950/40' : ''
                          }`}
                        >
                          <td className="py-3.5 px-4 font-semibold text-white">
                            <div className="flex items-center gap-3">
                              <ProductThumbnail
                                product={product}
                                size="md"
                                onClick={() => {
                                  setViewingProduct(product);
                                  setIsViewerOpen(true);
                                }}
                              />
                              <div className="min-w-0">
                                <div className="truncate font-semibold">{product.name}</div>
                                {product.status === 'INACTIVE' && (
                                  <span className="text-[10px] font-normal text-rose-400 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20">
                                    Deactivated / Hidden from POS
                                  </span>
                                )}
                              </div>
                            </div>
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
                              {cat?.name || 'Hardware'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-400">
                            {formatCurrency(product.purchasePrice, settings.currencySymbol)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                            {formatCurrency(proposedPrice, settings.currencySymbol)}
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
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {product.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right space-x-2">
                            <button
                              onClick={() => openEditModal(product)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                              title="Edit product"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleStatus(product)}
                              className={`p-1.5 rounded-lg transition ${
                                product.status === 'ACTIVE'
                                  ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400'
                                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                              }`}
                              title={product.status === 'ACTIVE' ? 'Deactivate Product' : 'Activate Product'}
                            >
                              <Power className="w-3.5 h-3.5" />
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
        </>
      )}

      {/* Category Management Tab */}
      {activeSubTab === 'categories' && (
        <div className="space-y-6">
          {/* Header & Filter Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-emerald-400" />
                <span>Shop-Specific Categories</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Every category is assigned to a specific shop to keep products neatly classified and isolated.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Filter by Shop Chips */}
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs overflow-x-auto">
                <button
                  onClick={() => setCategoryShopFilter('ALL')}
                  className={`px-3 py-1 rounded-md font-medium transition ${
                    categoryShopFilter === 'ALL'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Shops ({categories.length})
                </button>
                {shops.map(s => {
                  const count = categories.filter(c => c.shopId === s.id).length;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setCategoryShopFilter(s.id)}
                      className={`px-3 py-1 rounded-md font-medium whitespace-nowrap transition ${
                        categoryShopFilter === s.id
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {s.name} ({count})
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => openAddCategoryModal(categoryShopFilter === 'ALL' ? undefined : categoryShopFilter)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Add Category</span>
              </button>
            </div>
          </div>

          {/* Grouped by Shop Sections */}
          <div className="space-y-6">
            {shops
              .filter(shop => categoryShopFilter === 'ALL' || categoryShopFilter === shop.id)
              .map(shop => {
                const shopCats = categories.filter(c => c.shopId === shop.id);
                const totalShopProducts = dbState.products.filter(p => p.shopId === shop.id).length;

                // Format friendly header title like "Clothes Shop Categories" or "Hardware Categories"
                const cleanShopName = shop.name.trim();
                const shopHeaderTitle = cleanShopName.toLowerCase().endsWith('categories')
                  ? cleanShopName
                  : cleanShopName.toLowerCase().endsWith('shop')
                  ? `${cleanShopName} Categories`
                  : `${cleanShopName} Categories`;

                return (
                  <div key={shop.id} className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-5 shadow-lg space-y-4">
                    {/* Shop Header Banner */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                          <Store className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-base font-bold text-white">
                              {shopHeaderTitle}
                            </h4>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                              {shop.code || 'UNIT'}
                            </span>
                            {shop.status === 'INACTIVE' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/20">
                                Shop Inactive
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {shopCats.length} {shopCats.length === 1 ? 'Category' : 'Categories'} • {totalShopProducts} Products in this shop
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => openAddCategoryModal(shop.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 font-medium text-xs border border-slate-700/60 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Category to {shop.name}</span>
                      </button>
                    </div>

                    {/* Category Cards under this Shop */}
                    {shopCats.length === 0 ? (
                      <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-slate-500">
                        <Tag className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                        <p className="text-sm font-medium text-slate-300">No categories created for {shop.name} yet.</p>
                        <p className="text-xs text-slate-500 mt-1">Assign categories to this shop so sellers can organize inventory accurately.</p>
                        <button
                          onClick={() => openAddCategoryModal(shop.id)}
                          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Create First Category for {shop.name}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                        {shopCats.map(cat => {
                          const productCount = dbState.products.filter(p => p.categoryId === cat.id && p.shopId === shop.id).length;
                          const isActive = cat.status !== 'INACTIVE';

                          return (
                            <div
                              key={cat.id}
                              className={`bg-slate-950/70 border rounded-xl p-3.5 flex flex-col justify-between space-y-3 transition ${
                                isActive ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/60 opacity-60 bg-slate-950/40'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 shadow"
                                    style={{ backgroundColor: cat.color || '#3b82f6' }}
                                  >
                                    <Tag className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="min-w-0">
                                    <h5 className="text-xs font-bold text-white truncate" title={cat.name}>
                                      {cat.name}
                                    </h5>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                      {productCount} {productCount === 1 ? 'Product' : 'Products'}
                                    </p>
                                  </div>
                                </div>

                                <span
                                  className={`px-1.5 py-0.2 text-[9px] font-bold rounded-full shrink-0 ${
                                    isActive
                                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                                  }`}
                                >
                                  {isActive ? 'Active' : 'Inactive'}
                                </span>
                              </div>

                              <div className="flex items-center justify-end gap-1.5 pt-2.5 border-t border-slate-800/80">
                                <button
                                  onClick={() => openEditCategoryModal(cat)}
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleToggleCategoryStatus(cat)}
                                  className={`px-2 py-1 rounded text-xs font-medium transition ${
                                    isActive
                                      ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300'
                                      : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300'
                                  }`}
                                >
                                  {isActive ? 'Deactivate' : 'Activate'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">
                  {editingProduct ? 'Edit Product Details' : 'Create New Product'}
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
                  onChange={e => handleProductShopChange(e.target.value)}
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-300 font-medium">Category *</label>
                    <button
                      type="button"
                      onClick={() => openAddCategoryModal(productShopId)}
                      className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>New</span>
                    </button>
                  </div>
                  <select
                    value={categoryId}
                    onChange={e => setCategoryId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {categories
                      .filter(c => c.shopId === productShopId && (c.status !== 'INACTIVE' || c.id === categoryId))
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.status === 'INACTIVE' ? '(Inactive)' : ''}
                        </option>
                      ))}
                  </select>
                  {categories.filter(c => c.shopId === productShopId).length === 0 && (
                    <p className="text-[10px] text-amber-400 mt-1">
                      No categories exist for this shop yet. Click "+ New" above.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Unit of Measure *</label>
                  <select
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="pcs">Pieces (pcs)</option>
                    <option value="meter">Meter / Meters (m)</option>
                    <option value="pack">Pack</option>
                    <option value="box">Box</option>
                    <option value="kg">Kilogram (kg)</option>
                    <option value="pair">Pair</option>
                    <option value="roll">Roll</option>
                    <option value="liter">Liter</option>
                    <option value="set">Set</option>
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
                  <label className="block text-slate-300 font-medium mb-1">Purchase Price</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-slate-500 font-mono">
                      {settings.currencySymbol}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={purchasePrice}
                      onChange={e => setPurchasePrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-6 pr-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Proposed Selling Price *</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-slate-500 font-mono">
                      {settings.currencySymbol}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
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
                  <label className="block text-slate-300 font-medium mb-1">
                    {editingProduct ? 'Current Stock Level' : 'Initial Stock (Defaults to 0)'}
                  </label>
                  <input
                    type="number"
                    min="0"
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

              {/* Product Images (Optional - up to 3 images) */}
              <div className="pt-2 border-t border-slate-800/80">
                <ProductImageUpload
                  images={productImages}
                  onChange={setProductImages}
                  productId={editingProduct?.id}
                />
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

      {/* Add / Edit Category Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <FolderTree className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  {editingCategory ? 'Edit Category' : 'Create New Category'}
                </h3>
              </div>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {catModalError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{catModalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveCategory} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Assign to Shop / Unit *</label>
                <select
                  value={catShopIdInput}
                  onChange={e => setCatShopIdInput(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="" disabled>Select target shop...</option>
                  {shops.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code || 'UNIT'})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Categories are strictly assigned to this specific shop to keep items neatly organized.
                </p>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={catNameInput}
                  onChange={e => setCatNameInput(e.target.value)}
                  placeholder="e.g. Shirts, Pants, Dresses (for Clothes Shop) or Plumbing, Tools (for Hardware)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Color Theme</label>
                <div className="flex items-center gap-2">
                  {['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#64748b'].map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setCatColorInput(color)}
                      className={`w-7 h-7 rounded-full transition flex items-center justify-center ${
                        catColorInput === color ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: color }}
                    >
                      {catColorInput === color && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow transition"
                >
                  {editingCategory ? 'Save Category' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Product Image Gallery / Viewer Modal */}
      <ProductImageViewerModal
        product={viewingProduct}
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        currencySymbol={settings.currencySymbol}
      />
    </div>
  );
};
