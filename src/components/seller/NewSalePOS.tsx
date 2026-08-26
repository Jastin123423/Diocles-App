import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Barcode,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  CreditCard,
  Smartphone,
  Landmark,
  Layers,
  CheckCircle,
  AlertCircle,
  Percent,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SalesService } from '../../services/salesService';
import { Product, PaymentMethod } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { ProductThumbnail } from '../common/ProductThumbnail';
import { ProductImageViewerModal } from '../common/ProductImageViewerModal';

interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  discount: number;
}

export const NewSalePOS: React.FC = () => {
  const { currentUser, dbState, addToast, showReceipt, sellerColor, selectedShopId, currentShop } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [overallDiscount, setOverallDiscount] = useState<number>(0);
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [saleNotes, setSaleNotes] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const settings = dbState.settings;

  const targetShopId = currentShop?.id || (selectedShopId !== 'ALL' ? selectedShopId : '') || (dbState.shops[0]?.id || '');

  // Active products in currently selected shop
  const products = useMemo(() => {
    return dbState.products.filter(
      p => p.status === 'ACTIVE' && (!targetShopId || p.shopId === targetShopId || !p.shopId)
    );
  }, [dbState.products, targetShopId]);

  // Categories for the current shop
  const categories = useMemo(() => {
    const all = dbState.categories || [];
    if (targetShopId === 'ALL') return all;
    return all.filter(c => c.shopId === targetShopId);
  }, [dbState.categories, targetShopId]);

  // Filter products by search and category
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCategory = selectedCategory === 'ALL' || p.categoryId === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Cart Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity * item.unitPrice - item.discount, 0);
  }, [cart]);

  // Tax removed per requirement
  const totalAmount = useMemo(() => {
    const discounted = Math.max(0, subtotal - overallDiscount);
    return Number(discounted.toFixed(2));
  }, [subtotal, overallDiscount]);

  const tenderValue = parseFloat(amountReceived) || 0;
  const changeAmount = paymentMethod === 'CASH' ? Math.max(0, tenderValue - totalAmount) : 0;

  // Auto-fill amount tendered with total when total changes
  useEffect(() => {
    if (paymentMethod === 'CASH') {
      setAmountReceived(totalAmount.toFixed(2));
    }
  }, [totalAmount, paymentMethod]);

  // Add Product to Cart
  const addToCart = (product: Product) => {
    if (product.currentStock <= 0) {
      addToast({
        type: 'warning',
        title: 'Out of Stock',
        description: `${product.name} is currently out of stock.`,
      });
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.currentStock) {
          addToast({
            type: 'warning',
            title: 'Stock Limit Reached',
            description: `Only ${product.currentStock} ${product.unit} available in inventory.`,
          });
          return prev;
        }
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          product,
          quantity: 1,
          unitPrice: product.sellingPrice,
          discount: 0,
        },
      ];
    });
  };

  const updateUnitPrice = (productId: string, newPrice: number) => {
    setCart(prev =>
      prev.map(i => (i.product.id === productId ? { ...i, unitPrice: Math.max(0, newPrice) } : i))
    );
  };

  const updateQuantity = (productId: string, newQty: number) => {
    const item = cart.find(i => i.product.id === productId);
    if (!item) return;

    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }

    if (newQty > item.product.currentStock) {
      addToast({
        type: 'warning',
        title: 'Stock Exceeded',
        description: `Max stock for this item is ${item.product.currentStock}.`,
      });
      setCart(prev =>
        prev.map(i => (i.product.id === productId ? { ...i, quantity: item.product.currentStock } : i))
      );
      return;
    }

    setCart(prev =>
      prev.map(i => (i.product.id === productId ? { ...i, quantity: newQty } : i))
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(i => i.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setOverallDiscount(0);
    setAmountReceived('');
    setSaleNotes('');
  };

  // Handle Barcode Scan
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const scanned = products.find(
      p =>
        p.barcode === barcodeInput.trim() ||
        p.sku.toLowerCase() === barcodeInput.trim().toLowerCase()
    );

    if (scanned) {
      addToCart(scanned);
      setBarcodeInput('');
      addToast({
        type: 'info',
        title: 'Item Added',
        description: `${scanned.name} added to cart.`,
      });
    } else {
      addToast({
        type: 'error',
        title: 'Barcode Not Found',
        description: `No active product found for barcode '${barcodeInput}'.`,
      });
    }
  };

  // Complete Sale
  const handleCompleteSale = () => {
    if (!currentUser) return;

    if (cart.length === 0) {
      addToast({
        type: 'warning',
        title: 'Cart is Empty',
        description: 'Please add items to cart before completing sale.',
      });
      return;
    }

    const tender = paymentMethod === 'CASH' ? (parseFloat(amountReceived) || 0) : totalAmount;

    if (paymentMethod === 'CASH' && tender < totalAmount) {
      addToast({
        type: 'error',
        title: 'Insufficient Payment',
        description: `Tendered cash (${formatCurrency(tender, settings.currencySymbol)}) is less than total due (${formatCurrency(totalAmount, settings.currencySymbol)}).`,
      });
      return;
    }

    setIsProcessing(true);

    const result = SalesService.createSale(
      {
        shopId: targetShopId === 'ALL' ? (dbState.shops[0]?.id || '') : (targetShopId || dbState.shops[0]?.id || ''),
        items: cart.map(i => ({
          productId: i.product.id,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount,
        })),
        paymentMethod,
        discount: overallDiscount,
        amountReceived: tender,
        notes: saleNotes,
      },
      currentUser
    );

    setIsProcessing(false);

    if (result.success && result.sale) {
      addToast({
        type: 'success',
        title: 'Sale Completed Successfully',
        description: `Receipt #${result.sale.receiptNumber} generated. Inventory updated.`,
      });
      showReceipt(result.sale);
      clearCart();
    } else {
      addToast({
        type: 'error',
        title: 'Sale Failed',
        description: result.error || 'Could not complete transaction.',
      });
    }
  };

  return (
    <div id="pos-terminal" className="flex-1 flex overflow-hidden bg-slate-950 text-slate-100 select-none">
      {/* Left: Product Catalog & Search (60%) */}
      <div className="flex-1 flex flex-col border-r border-slate-800 overflow-hidden">
        {/* Search & Barcode Scan Bar */}
        <div className="p-3.5 bg-slate-900 border-b border-slate-800 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="pos-search-input"
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search products by name, SKU or keyword..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <form onSubmit={handleBarcodeSubmit} className="relative w-48">
              <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                ref={barcodeInputRef}
                id="pos-barcode-input"
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                placeholder="Scan barcode [Enter]"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </form>
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3 py-1 rounded-full whitespace-nowrap text-xs font-medium transition ${
                selectedCategory === 'ALL'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              All Categories ({products.length})
            </button>
            {categories.map(cat => {
              const count = products.filter(p => p.categoryId === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1 rounded-full whitespace-nowrap text-xs font-medium transition ${
                    selectedCategory === cat.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 p-4 overflow-y-auto">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
              <Layers className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-sm font-medium text-slate-400">No products match your search</p>
              <p className="text-xs text-slate-600 mt-1">Try another category or scan a barcode.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map(product => {
                const isOutOfStock = product.currentStock <= 0;
                const isLowStock = product.currentStock > 0 && product.currentStock <= product.minStock;

                return (
                  <div
                    key={product.id}
                    id={`pos-product-${product.id}`}
                    className={`p-2.5 rounded-xl border transition-all flex flex-col justify-between h-36 relative overflow-hidden group ${
                      isOutOfStock
                        ? 'bg-slate-900/40 border-slate-800/60 opacity-50'
                        : 'bg-slate-900 border-slate-800 hover:border-blue-500/50 hover:bg-slate-850 hover:shadow-lg'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1 mb-1.5">
                        <span className="text-[10px] font-mono text-slate-400">{product.sku}</span>
                        {isOutOfStock ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            Out of Stock
                          </span>
                        ) : isLowStock ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold">
                            {product.currentStock} {product.unit}
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {product.currentStock} {product.unit}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <ProductThumbnail
                          product={product}
                          size="sm"
                          onClick={() => {
                            setViewingProduct(product);
                            setIsViewerOpen(true);
                          }}
                        />
                        <h4
                          onClick={() => !isOutOfStock && addToCart(product)}
                          className={`text-xs font-semibold text-white line-clamp-2 transition flex-1 min-w-0 ${
                            !isOutOfStock ? 'cursor-pointer group-hover:text-blue-300' : ''
                          }`}
                          title={product.name}
                        >
                          {product.name}
                        </h4>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
                      <span className="text-xs font-bold text-emerald-400 font-mono">
                        {formatCurrency(product.sellingPrice, settings.currencySymbol)}
                      </span>
                      <button
                        type="button"
                        disabled={isOutOfStock}
                        onClick={() => addToCart(product)}
                        className="w-6 h-6 rounded-md bg-blue-600/20 hover:bg-blue-600 group-hover:bg-blue-600 text-blue-300 group-hover:text-white flex items-center justify-center transition disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Add to cart"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart, Tender & Checkout (40%) */}
      <div className="w-[420px] bg-slate-900 flex flex-col justify-between shrink-0 overflow-hidden">
        {/* Cart Header */}
        <div className="p-3.5 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Active Sale Cart ({cart.reduce((s, i) => s + i.quantity, 0)} Items)
            </h3>
          </div>
          {cart.length > 0 && (
            <button
              id="clear-cart-btn"
              onClick={clearCart}
              className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium transition"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Cart Items List */}
        <div className="flex-1 p-3 overflow-y-auto space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <ShoppingCart className="w-12 h-12 mb-3 text-slate-700" />
              <p className="text-sm font-semibold text-slate-400">Cart is Empty</p>
              <p className="text-xs text-slate-600 mt-1">
                Click products on the left or scan barcodes to begin sale.
              </p>
            </div>
          ) : (
            cart.map(item => {
              const proposed = item.product.proposedSellingPrice || item.product.sellingPrice;
              const cost = item.product.purchasePrice || 0;
              const isBelowCost = item.unitPrice < cost && cost > 0;
              const isBelowProposed = !isBelowCost && item.unitPrice < proposed && proposed > 0;
              const itemProfit = (item.unitPrice - cost) * item.quantity - item.discount;

              return (
                <div
                  key={item.product.id}
                  className={`bg-slate-950 border rounded-lg p-2.5 space-y-2 transition ${
                    isBelowCost
                      ? 'border-rose-500/60 bg-rose-950/20'
                      : isBelowProposed
                      ? 'border-amber-500/50 bg-amber-950/10'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <ProductThumbnail
                        product={item.product}
                        size="sm"
                        onClick={() => {
                          setViewingProduct(item.product);
                          setIsViewerOpen(true);
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h5 className="text-xs font-semibold text-white truncate">{item.product.name}</h5>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                            {item.product.sku}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 flex-wrap">
                          <span className="font-semibold text-emerald-400 font-mono">
                            Total: {formatCurrency(item.quantity * item.unitPrice - item.discount, settings.currencySymbol)}
                          </span>
                          {cost > 0 && (
                            <>
                              <span>•</span>
                              <span className={`text-[10px] font-medium font-mono ${itemProfit >= 0 ? 'text-slate-400' : 'text-rose-400 font-bold'}`}>
                                Est Profit: {formatCurrency(itemProfit, settings.currencySymbol)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-slate-500 hover:text-rose-400 p-1 shrink-0"
                      title="Remove item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Warning Alerts */}
                  {isBelowCost && (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>Below purchase cost</span>
                    </div>
                  )}
                  {isBelowProposed && (
                    <div className="flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>Below proposed price</span>
                    </div>
                  )}

                  {/* Price & Quantity Controls */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-900">
                    <div className="flex items-center gap-1.5">
                      <label className="text-[10px] text-slate-400">Price:</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={item.unitPrice}
                        onChange={e => updateUnitPrice(item.product.id, parseFloat(e.target.value) || 0)}
                        className="w-20 bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center gap-1">
                      <label className="text-[10px] text-slate-400">Qty:</label>
                      <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded p-0.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={item.product.currentStock}
                          value={item.quantity}
                          onChange={e => updateQuantity(item.product.id, parseInt(e.target.value, 10) || 0)}
                          className="w-10 bg-slate-950 border border-slate-700 rounded text-center text-xs font-bold text-white font-mono py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Checkout Panel */}
        <div className="p-3.5 bg-slate-950 border-t border-slate-800 space-y-3">
          {/* Payment Method Selector */}
          <div>
            <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Payment Method
            </span>
            <div className="grid grid-cols-4 gap-1">
              {[
                { id: 'CASH', label: 'Cash', icon: DollarSign },
                { id: 'MOBILE_MONEY', label: 'Mobile', icon: Smartphone },
                { id: 'CARD', label: 'Card', icon: CreditCard },
                { id: 'BANK', label: 'Bank', icon: Landmark },
              ].map(m => {
                const Icon = m.icon;
                const active = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    id={`pay-method-${m.id}`}
                    type="button"
                    onClick={() => setPaymentMethod(m.id as PaymentMethod)}
                    className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[10px] font-semibold border transition ${
                      active
                        ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 mb-0.5" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cash Tender - Simplified, auto-filled, no quick buttons, no currency symbol */}
          {paymentMethod === 'CASH' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Amount Tendered</span>
                <span className="text-slate-500 text-[10px]">Auto-filled with total</span>
              </div>

              <input
                id="tender-amount-input"
                type="number"
                step="0.01"
                min="0"
                value={amountReceived}
                onChange={e => setAmountReceived(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2.5 text-base font-mono font-bold text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              {changeAmount > 0 && (
                <div className="flex justify-between items-center px-2.5 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs">
                  <span className="text-emerald-400 font-medium">Change to Return:</span>
                  <span className="text-emerald-300 font-bold font-mono text-sm">
                    {formatCurrency(changeAmount, settings.currencySymbol)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Pricing Totals Summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 space-y-1 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal</span>
              <span className="font-mono">{formatCurrency(subtotal, settings.currencySymbol)}</span>
            </div>
            {overallDiscount > 0 && (
              <div className="flex justify-between text-amber-400">
                <span>Discount</span>
                <span className="font-mono">-{formatCurrency(overallDiscount, settings.currencySymbol)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-extrabold text-white pt-1.5 border-t border-slate-800">
              <span>TOTAL DUE</span>
              <span className="text-emerald-400 font-mono">
                {formatCurrency(totalAmount, settings.currencySymbol)}
              </span>
            </div>
          </div>

          {/* Complete Sale Button */}
          <button
            id="complete-sale-btn"
            onClick={handleCompleteSale}
            disabled={cart.length === 0 || isProcessing}
            className="w-full py-3 rounded-xl font-bold text-sm text-white shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: sellerColor.primary }}
          >
            <CheckCircle className="w-5 h-5" />
            <span>Complete Sale ({formatCurrency(totalAmount, settings.currencySymbol)})</span>
          </button>
        </div>
      </div>

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
