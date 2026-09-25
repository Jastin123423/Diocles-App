import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, Package, Check, ChevronDown } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

interface Product {
  id: string;
  name: string;
  sku: string;
  currentStock: number;
  unit: string;
  purchasePrice?: number;
  sellingPrice?: number;
}

interface ProductSearchSelectProps {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  currencySymbol?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const ProductSearchSelect: React.FC<ProductSearchSelectProps> = ({
  products,
  value,
  onChange,
  currencySymbol = 'TSh',
  placeholder = 'Search product by name or SKU...',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedProduct = useMemo(
    () => products.find(p => p.id === value),
    [products, value]
  );

  // Filter products — case-insensitive substring on name + SKU
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 50); // show first 50 when nothing typed
    const tokens = q.split(/\s+/);
    return products
      .filter(p => {
        const hay = `${p.name} ${p.sku}`.toLowerCase();
        return tokens.every(t => hay.includes(t));
      })
      .slice(0, 100); // cap results for perf
  }, [products, query]);

  // Reset highlight when list changes
  useEffect(() => {
    setHighlightIdx(0);
  }, [query, isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlightIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  const handleSelect = (productId: string) => {
    onChange(productId);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlightIdx]) handleSelect(filtered[highlightIdx].id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 bg-slate-900 border rounded-lg px-2.5 py-2 text-left text-xs transition ${
          isOpen
            ? 'border-blue-500 ring-1 ring-blue-500/30'
            : 'border-slate-800 hover:border-slate-700'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className="flex items-center gap-2 min-w-0 flex-1">
          <Package className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          {selectedProduct ? (
            <span className="min-w-0">
              <span className="block text-white font-medium truncate leading-tight">
                {selectedProduct.name}
              </span>
              <span className="block text-[10px] text-slate-500 font-mono leading-tight mt-0.5">
                {selectedProduct.sku} • Stock: {selectedProduct.currentStock} {selectedProduct.unit}
              </span>
            </span>
          ) : (
            <span className="text-slate-500 truncate">Select a product...</span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown / Bottom-sheet */}
      {isOpen && (
        <>
          {/* Backdrop for mobile bottom-sheet feel */}
          <div
            className="fixed inset-0 z-40 sm:hidden bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          <div
            className="
              fixed sm:absolute z-50
              inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-auto sm:left-0
              sm:mt-1
              bg-slate-900 border border-slate-800
              rounded-t-2xl sm:rounded-xl
              shadow-2xl
              w-full sm:w-[420px]
              max-h-[70vh] sm:max-h-80
              flex flex-col
              animate-in fade-in slide-in-from-bottom-4 sm:slide-in-from-top-1
            "
          >
            {/* Mobile drag handle */}
            <div className="sm:hidden flex justify-center pt-2 pb-1">
              <span className="w-10 h-1 rounded-full bg-slate-700" />
            </div>

            {/* Header w/ search */}
            <div className="p-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="sm:hidden text-slate-400 hover:text-white p-1.5 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">
                {query
                  ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'}`
                  : `Showing first ${filtered.length} of ${products.length} products — type to search`}
              </p>
            </div>

            {/* Results list */}
            <div ref={listRef} className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <div className="p-6 text-center">
                  <Package className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                  <p className="text-xs text-slate-500">No products match "{query}"</p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Try a shorter search or check the SKU
                  </p>
                </div>
              ) : (
                filtered.map((p, idx) => {
                  const isSelected = p.id === value;
                  const isHighlighted = idx === highlightIdx;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-idx={idx}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      onClick={() => handleSelect(p.id)}
                      className={`w-full text-left px-3 py-2.5 border-b border-slate-800/40 transition flex items-center gap-2 ${
                        isHighlighted ? 'bg-slate-800/60' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-white truncate">
                            {p.name}
                          </span>
                          {isSelected && (
                            <Check className="w-3 h-3 text-blue-400 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-500 font-mono">
                          <span>{p.sku}</span>
                          <span className={p.currentStock <= 0 ? 'text-rose-400' : 'text-slate-500'}>
                            Stock: {p.currentStock} {p.unit}
                          </span>
                          {p.purchasePrice !== undefined && p.purchasePrice !== null && (
                            <span className="text-amber-400/80">
                              Cost: {formatCurrency(p.purchasePrice, currencySymbol)}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer hint (desktop only) */}
            <div className="hidden sm:flex items-center justify-between px-3 py-1.5 border-t border-slate-800 bg-slate-950/60 text-[10px] text-slate-500">
              <span>↑↓ navigate • Enter select • Esc close</span>
              <span>{products.length} products</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
