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
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setIsSaving(true);

    if (!name.trim()) {
      setFormError('Product title is required.');
      setIsSaving(false);
      return;
    }

    if (!productShopId) {
      setFormError('Please select a shop/business unit for this product.');
      setIsSaving(false);
      return;
    }

    const sPrice = parseFloat(sellingPrice);
    const pPrice = parseFloat(purchasePrice) || 0;

    if (isNaN(sPrice) || sPrice < 0) {
      setFormError('Please enter a valid selling price.');
      setIsSaving(false);
      return;
    }

    try {
      if (editingProduct) {
        const res = await ProductService.updateProduct(
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
        const res = await ProductService.createProduct(
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
    } catch (error: any) {
      setFormError(error.message || 'An error occurred while saving product.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (p: Product) => {
    const newStatus = p.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const res = await ProductService.toggleProductStatus(p.id, newStatus, currentUser);
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

      {/* ... rest of the component remains the same ... */}

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
