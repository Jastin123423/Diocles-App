import React, { useState, useMemo } from 'react';
import {
  FileText,
  Printer,
  Calendar,
  Download,
  Users,
  Package,
  Store,
  Search,
  TrendingDown,
  TrendingUp,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ReportService } from '../../services/reportService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type ReportPeriod = 'today' | 'week' | 'month' | 'custom';

interface DeviationRow {
  saleId: string;
  receiptNumber: string;
  createdAt: string;
  shopId: string;
  shopName: string;
  sellerId: string;
  sellerName: string;
  productId: string;
  productName: string;
  sku: string;
  referencePrice: number;
  soldPrice: number;
  quantity: number;
  diff: number;
  totalImpact: number;
  direction: 'ABOVE' | 'BELOW';
  usedSnapshot: boolean;   // 🆕 true = snapshot from sale time; false = fell back to current product price
}

type DeviationDirection = 'ALL' | 'ABOVE' | 'BELOW';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function computeRange(period: ReportPeriod, customFrom: string, customTo: string) {
  const now = new Date();
  if (period === 'today') {
    const d = now.toISOString().slice(0, 10);
    return { from: d, to: d };
  }
  if (period === 'week') {
    const past = new Date(now.getTime() - 7 * 86400000);
    return { from: past.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
  }
  if (period === 'month') {
    const past = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: past.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
  }
  return { from: customFrom || undefined, to: customTo || undefined };
}

// ─────────────────────────────────────────────────────────────
// Section Header (reusable: collapse + date filter)
// ─────────────────────────────────────────────────────────────
const SectionHeader: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  period: ReportPeriod;
  onPeriodChange: (p: ReportPeriod) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  actions?: React.ReactNode;
  accent?: 'blue' | 'rose' | 'purple' | 'amber';
}> = ({
  title,
  subtitle,
  icon,
  period,
  onPeriodChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  collapsed,
  onToggleCollapsed,
  actions,
  accent = 'blue',
}) => {
  const accentClasses: Record<string, string> = {
    blue: 'from-blue-950/20 via-slate-900 to-slate-900',
    rose: 'from-rose-950/20 via-slate-900 to-slate-900',
    purple: 'from-purple-950/20 via-slate-900 to-slate-900',
    amber: 'from-amber-950/20 via-slate-900 to-slate-900',
  };

  const pillActive: Record<string, string> = {
    blue: 'bg-blue-600 text-white shadow-sm',
    rose: 'bg-rose-600 text-white shadow-sm',
    purple: 'bg-purple-600 text-white shadow-sm',
    amber: 'bg-amber-600 text-white shadow-sm',
  };

  return (
    <div className={`border-b border-slate-800 bg-gradient-to-r ${accentClasses[accent]} ${
      collapsed ? '' : 'pb-3'
    }`}>
      <div className="flex items-center justify-between gap-3 p-4 pb-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex items-center gap-3 flex-1 min-w-0 text-left group"
        >
          <span className="text-slate-500 group-hover:text-slate-300 transition shrink-0">
            {collapsed
              ? <ChevronRight className="w-4 h-4" />
              : <ChevronDown className="w-4 h-4" />}
          </span>
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-white truncate">{title}</span>
            {subtitle && (
              <span className="block text-xs text-slate-400 mt-0.5 truncate">{subtitle}</span>
            )}
          </span>
        </button>

        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
          {/* Period pills */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px] font-semibold">
            {[
              { id: 'today', label: 'Day' },
              { id: 'week', label: 'Week' },
              { id: 'month', label: 'Month' },
              { id: 'custom', label: 'Custom' },
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPeriodChange(p.id as ReportPeriod)}
                className={`px-2.5 py-1 rounded-md transition ${
                  period === p.id
                    ? pillActive[accent]
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {actions}
        </div>
      </div>

      {/* Inline custom range — only when Custom is picked and not collapsed */}
      {period === 'custom' && !collapsed && (
        <div className="px-4 pb-1 flex items-center gap-2 text-[11px]">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">Range:</span>
          <input
            type="date"
            value={customStart}
            onChange={e => onCustomStartChange(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white"
          />
          <span className="text-slate-500">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => onCustomEndChange(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white"
          />
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export const AdminReports: React.FC = () => {
  const { currentUser, dbState, addToast } = useApp();

  // Global income-statement period (unchanged)
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Per-section periods (default Day)
  const [deviationPeriod, setDeviationPeriod] = useState<ReportPeriod>('today');
  const [deviationStart, setDeviationStart] = useState('');
  const [deviationEnd, setDeviationEnd] = useState('');

  const [shopPeriod, setShopPeriod] = useState<ReportPeriod>('today');
  const [shopStart, setShopStart] = useState('');
  const [shopEnd, setShopEnd] = useState('');

  const [productPeriod, setProductPeriod] = useState<ReportPeriod>('today');
  const [productStart, setProductStart] = useState('');
  const [productEnd, setProductEnd] = useState('');

  const [sellerPeriod, setSellerPeriod] = useState<ReportPeriod>('today');
  const [sellerStart, setSellerStart] = useState('');
  const [sellerEnd, setSellerEnd] = useState('');

  // Collapse state per section (all expanded by default)
  const [incomeCollapsed, setIncomeCollapsed] = useState(false);
  const [deviationCollapsed, setDeviationCollapsed] = useState(false);
  const [shopsCollapsed, setShopsCollapsed] = useState(false);
  const [productsCollapsed, setProductsCollapsed] = useState(false);
  const [sellersCollapsed, setSellersCollapsed] = useState(false);

  // Filters
  const [shopFilter, setShopFilter] = useState('ALL');
  const [productSearch, setProductSearch] = useState('');
  const [sellerSearch, setSellerSearch] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  const [deviationDirection, setDeviationDirection] = useState<DeviationDirection>('ALL');

  if (!currentUser) return null;
  if (currentUser.role !== 'ADMIN' && !currentUser.permissions?.canViewReports) return null;

  const settings = dbState.settings;
  const shops = dbState.shops || [];
  const products = dbState.products || [];

  // Ranges per section
  const incomeRange = useMemo(
    () => computeRange(reportPeriod, customStartDate, customEndDate),
    [reportPeriod, customStartDate, customEndDate]
  );
  const deviationRange = useMemo(
    () => computeRange(deviationPeriod, deviationStart, deviationEnd),
    [deviationPeriod, deviationStart, deviationEnd]
  );
  const shopRange = useMemo(
    () => computeRange(shopPeriod, shopStart, shopEnd),
    [shopPeriod, shopStart, shopEnd]
  );
  const productRange = useMemo(
    () => computeRange(productPeriod, productStart, productEnd),
    [productPeriod, productStart, productEnd]
  );
  const sellerRange = useMemo(
    () => computeRange(sellerPeriod, sellerStart, sellerEnd),
    [sellerPeriod, sellerStart, sellerEnd]
  );

  // One summary per section scope
  const incomeSummary = useMemo(() => {
    return ReportService.getFinancialSummary(incomeRange, { shopId: shopFilter }, currentUser) || {};
  }, [incomeRange, currentUser, dbState, shopFilter]);

  const shopSummary = useMemo(() => {
    return ReportService.getFinancialSummary(shopRange, { shopId: shopFilter }, currentUser) || {};
  }, [shopRange, currentUser, dbState, shopFilter]);

  const productSummary = useMemo(() => {
    return ReportService.getFinancialSummary(productRange, { shopId: shopFilter }, currentUser) || {};
  }, [productRange, currentUser, dbState, shopFilter]);

  const sellerSummary = useMemo(() => {
    return ReportService.getFinancialSummary(sellerRange, { shopId: shopFilter }, currentUser) || {};
  }, [sellerRange, currentUser, dbState, shopFilter]);

  // Deviations use their own summary (their own date range)
  const deviationSummary = useMemo(() => {
    return ReportService.getFinancialSummary(deviationRange, { shopId: shopFilter }, currentUser) || {};
  }, [deviationRange, currentUser, dbState, shopFilter]);

  // Filter products
  const filteredProducts = useMemo(() => {
    const list = productSummary.topProducts || [];
    if (!productSearch.trim()) return list;
    const q = productSearch.trim().toLowerCase();
    return list.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }, [productSummary.topProducts, productSearch]);

  // Filter sellers
  const filteredSellers = useMemo(() => {
    const list = sellerSummary.sellerSales || [];
    if (!sellerSearch.trim()) return list;
    const q = sellerSearch.trim().toLowerCase();
    return list.filter(s => s.name.toLowerCase().includes(q));
  }, [sellerSummary.sellerSales, sellerSearch]);

  const selectedShopName =
    shopFilter === 'ALL' ? 'All Shops' : (shops.find(s => s.id === shopFilter)?.name || 'Unknown');

  // ─────────────────────────────────────────────────────────────
  // Deviations computed from deviationRange
  //   🔒 Prefers the immutable snapshot stored on the sale item.
  //      Falls back to current product price for legacy sales
  //      recorded before the snapshot existed.
  // ─────────────────────────────────────────────────────────────
  const allDeviations = useMemo<DeviationRow[]>(() => {
    const sales = deviationSummary.filteredSales || [];
    const productMap = new Map(products.map(p => [p.id, p]));
    const rows: DeviationRow[] = [];

    for (const sale of sales) {
      if (sale.status === 'VOIDED') continue;

      for (const item of sale.items || []) {
        const product = productMap.get(item.productId);
        if (!product) continue;

        // 🔒 Prefer the sale-time snapshot
        const hasSnapshot =
          item.referencePrice !== undefined &&
          item.referencePrice !== null &&
          item.referencePrice > 0;

        const referencePrice = hasSnapshot
          ? (item.referencePrice as number)
          : (product.proposedSellingPrice && product.proposedSellingPrice > 0
              ? product.proposedSellingPrice
              : product.sellingPrice || 0);

        if (referencePrice <= 0) continue;

        const soldPrice = item.unitPrice || 0;
        const qty = item.quantity || 0;
        if (soldPrice === referencePrice) continue;

        const diff = Number((soldPrice - referencePrice).toFixed(2));
        const totalImpact = Number((diff * qty).toFixed(2));

        rows.push({
          saleId: sale.id,
          receiptNumber: sale.receiptNumber,
          createdAt: sale.createdAt,
          shopId: sale.shopId,
          shopName: sale.shopName || '',
          sellerId: sale.sellerId,
          sellerName: sale.sellerName,
          productId: item.productId,
          productName: item.productName,
          sku: item.sku || product.sku || '',
          referencePrice,
          soldPrice,
          quantity: qty,
          diff,
          totalImpact,
          direction: diff > 0 ? 'ABOVE' : 'BELOW',
          usedSnapshot: hasSnapshot,
        });
      }
    }

    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return rows;
  }, [deviationSummary.filteredSales, products]);

  const deviations = useMemo(() => {
    if (deviationDirection === 'ALL') return allDeviations;
    return allDeviations.filter(d => d.direction === deviationDirection);
  }, [allDeviations, deviationDirection]);

  const deviationStats = useMemo(() => {
    const belowRows = allDeviations.filter(d => d.direction === 'BELOW');
    const aboveRows = allDeviations.filter(d => d.direction === 'ABOVE');
    const belowImpact = belowRows.reduce((s, r) => s + r.totalImpact, 0);
    const aboveImpact = aboveRows.reduce((s, r) => s + r.totalImpact, 0);
    return {
      belowCount: belowRows.length,
      aboveCount: aboveRows.length,
      belowSalesCount: new Set(belowRows.map(r => r.saleId)).size,
      aboveSalesCount: new Set(aboveRows.map(r => r.saleId)).size,
      belowImpact: Number(belowImpact.toFixed(2)),
      aboveImpact: Number(aboveImpact.toFixed(2)),
      netImpact: Number((belowImpact + aboveImpact).toFixed(2)),
    };
  }, [allDeviations]);

  const DEVIATION_DISPLAY_CAP = 200;
  const visibleDeviations = deviations.slice(0, DEVIATION_DISPLAY_CAP);
  const hiddenDeviationCount = Math.max(0, deviations.length - DEVIATION_DISPLAY_CAP);

  // ─────────────────────────────────────────────────────────────
  // Print Main Report (uses incomeRange)
  // ─────────────────────────────────────────────────────────────
  const handlePrintReport = () => {
    setIsPrinting(true);
    const printWindow = window.open('', '_blank', 'width=1400,height=900');
    if (!printWindow) {
      addToast({ type: 'error', title: 'Popup Blocked', description: 'Please allow popups to print.' });
      setIsPrinting(false);
      return;
    }

    const s = incomeSummary;
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Financial Report - ${selectedShopName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; background: #fff; color: #1e293b; }
          .header { text-align: center; margin-bottom: 25px; border-bottom: 3px double #3b82f6; padding-bottom: 20px; }
          .header h1 { font-size: 28px; color: #1e40af; font-weight: bold; }
          .header .company { font-size: 16px; color: #475569; margin-top: 5px; }
          .header .meta { font-size: 12px; color: #64748b; margin-top: 10px; line-height: 1.6; }
          .badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-top: 10px; }
          .section-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; padding: 10px 15px; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
          thead { background: #1e293b; color: #fff; }
          th { padding: 12px 10px; text-align: left; font-weight: 600; }
          td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
          .amount { text-align: right; font-family: 'Courier New', monospace; font-weight: bold; }
          .positive { color: #16a34a; }
          .negative { color: #dc2626; }
          .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #94a3b8; border-top: 2px solid #e2e8f0; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${settings.businessName}</h1>
          <div class="company">${settings.tagline || ''}</div>
          <div class="meta">
            <strong>Financial Report</strong><br>
            Period: ${incomeRange.from || 'Beginning'} to ${incomeRange.to || 'Present'}<br>
            Generated: ${new Date().toLocaleString()}
          </div>
          <div class="badge">🏪 ${selectedShopName}</div>
        </div>

        <div class="section-title">📊 Income Statement</div>
        <table>
          <tbody>
            <tr><td><strong>Gross Revenue</strong></td><td class="amount">${settings.currencySymbol} ${(s.totalGrossSales || 0).toLocaleString()}</td></tr>
            <tr><td>Less: Cost of Goods Sold</td><td class="amount negative">-${settings.currencySymbol} ${(s.totalCostOfGoods || 0).toLocaleString()}</td></tr>
            <tr><td><strong>Gross Profit</strong></td><td class="amount positive">${settings.currencySymbol} ${(s.totalGrossProfit || 0).toLocaleString()} (${s.profitMarginPercent || 0}%)</td></tr>
            <tr><td>Less: Expenses</td><td class="amount negative">-${settings.currencySymbol} ${(s.totalExpenses || 0).toLocaleString()}</td></tr>
            <tr style="background:#f0fdf4;"><td><strong>NET PROFIT</strong></td><td class="amount ${(s.netProfit || 0) >= 0 ? 'positive' : 'negative'}">${settings.currencySymbol} ${(s.netProfit || 0).toLocaleString()} (${s.netMarginPercent || 0}%)</td></tr>
          </tbody>
        </table>

        <div class="section-title">🏪 Shop Performance</div>
        <table>
          <thead><tr><th>Shop</th><th class="amount">Sales</th><th class="amount">Revenue</th><th class="amount">Profit</th></tr></thead>
          <tbody>
            ${(s.shopSalesBreakdown || []).map(sh => `
              <tr><td>${sh.name}</td><td class="amount">${sh.salesCount}</td><td class="amount">${settings.currencySymbol} ${sh.totalSales.toLocaleString()}</td><td class="amount positive">${settings.currencySymbol} ${sh.grossProfit.toLocaleString()}</td></tr>
            `).join('')}
          </tbody>
        </table>

        <div class="section-title">📦 Product Profitability</div>
        <table>
          <thead><tr><th>Product</th><th>SKU</th><th class="amount">Units</th><th class="amount">Revenue</th><th class="amount">Profit</th></tr></thead>
          <tbody>
            ${(s.topProducts || []).map(p => `
              <tr><td>${p.name}</td><td style="font-family:monospace;">${p.sku}</td><td class="amount">${p.unitsSold}</td><td class="amount">${settings.currencySymbol} ${p.revenue.toLocaleString()}</td><td class="amount positive">${settings.currencySymbol} ${p.profit.toLocaleString()}</td></tr>
            `).join('')}
          </tbody>
        </table>

        <div class="section-title">👥 Seller Performance</div>
        <table>
          <thead><tr><th>Seller</th><th class="amount">Orders</th><th class="amount">Revenue</th><th class="amount">Profit</th></tr></thead>
          <tbody>
            ${(s.sellerSales || []).map(se => `
              <tr><td>${se.name}</td><td class="amount">${se.count}</td><td class="amount">${settings.currencySymbol} ${se.total.toLocaleString()}</td><td class="amount positive">${settings.currencySymbol} ${se.profit.toLocaleString()}</td></tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          ${settings.businessName} - ${settings.address || ''} | Phone: ${settings.phone || 'N/A'}
        </div>

        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    setTimeout(() => setIsPrinting(false), 2000);
  };

  // ─────────────────────────────────────────────────────────────
  // Print Deviations (uses deviationRange)
  // ─────────────────────────────────────────────────────────────
  const handlePrintDeviations = () => {
    if (deviations.length === 0) {
      addToast({ type: 'info', title: 'No Deviations', description: 'There are no price deviations in the current filter.' });
      return;
    }

    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) {
      addToast({ type: 'error', title: 'Popup Blocked', description: 'Please allow popups to print.' });
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Price Deviation Audit</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: #fff; color: #1e293b; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 3px double #dc2626; padding-bottom: 15px; }
          .header h1 { font-size: 24px; color: #991b1b; font-weight: bold; }
          .header .meta { font-size: 12px; color: #64748b; margin-top: 8px; }
          .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
          .card { padding: 14px; border-radius: 8px; text-align: center; }
          .card.below { background: #fef2f2; border: 2px solid #dc2626; }
          .card.above { background: #f0fdf4; border: 2px solid #16a34a; }
          .card.gained { background: #eff6ff; border: 2px solid #3b82f6; }
          .card.discount { background: #fff7ed; border: 2px solid #f97316; }
          .card .label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 600; }
          .card .value { font-size: 20px; font-weight: bold; margin-top: 5px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          thead { background: #1e293b; color: #fff; }
          th { padding: 9px 7px; text-align: left; font-weight: 600; }
          td { padding: 7px; border-bottom: 1px solid #e2e8f0; }
          tr.below td { background: #fef2f2; }
          tr.above td { background: #f0fdf4; }
          .amount { text-align: right; font-family: 'Courier New', monospace; font-weight: bold; }
          .diff-below { color: #dc2626; text-align: right; font-weight: bold; }
          .diff-above { color: #16a34a; text-align: right; font-weight: bold; }
          .est { color: #94a3b8; font-size: 9px; font-weight: normal; margin-left: 4px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Price Deviation Audit</h1>
          <div class="meta">
            Shop: ${selectedShopName} | Period: ${deviationRange.from || 'Beginning'} to ${deviationRange.to || 'Present'}<br>
            Direction: ${deviationDirection} | Generated: ${new Date().toLocaleString()}
          </div>
        </div>

        <div class="summary">
          <div class="card below"><div class="label">Below Reference</div><div class="value">${deviationStats.belowCount}</div></div>
          <div class="card above"><div class="label">Above Reference</div><div class="value">${deviationStats.aboveCount}</div></div>
          <div class="card gained"><div class="label">Extra Gained</div><div class="value">+${settings.currencySymbol} ${deviationStats.aboveImpact.toLocaleString()}</div></div>
          <div class="card discount"><div class="label">Discount Value</div><div class="value">${settings.currencySymbol} ${deviationStats.belowImpact.toLocaleString()}</div></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Receipt #</th>
              <th>Shop</th>
              <th>Seller</th>
              <th>Product</th>
              <th>SKU</th>
              <th class="amount">Reference</th>
              <th class="amount">Sold At</th>
              <th class="amount">Diff</th>
              <th class="amount">Qty</th>
              <th class="amount">Impact</th>
            </tr>
          </thead>
          <tbody>
            ${deviations.map(d => `
              <tr class="${d.direction === 'BELOW' ? 'below' : 'above'}">
                <td>${formatDateTime(d.createdAt)}</td>
                <td><strong>${d.receiptNumber}</strong></td>
                <td>${d.shopName}</td>
                <td>${d.sellerName}</td>
                <td>${d.productName}</td>
                <td style="font-family:monospace;">${d.sku}</td>
                <td class="amount">${settings.currencySymbol} ${d.referencePrice.toLocaleString()}${!d.usedSnapshot ? '<span class="est">est.</span>' : ''}</td>
                <td class="amount">${settings.currencySymbol} ${d.soldPrice.toLocaleString()}</td>
                <td class="${d.direction === 'BELOW' ? 'diff-below' : 'diff-above'}">${d.diff > 0 ? '+' : ''}${settings.currencySymbol} ${d.diff.toLocaleString()}</td>
                <td class="amount">${d.quantity}</td>
                <td class="${d.direction === 'BELOW' ? 'diff-below' : 'diff-above'}">${d.totalImpact > 0 ? '+' : ''}${settings.currencySymbol} ${d.totalImpact.toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  // ─────────────────────────────────────────────────────────────
  // Export Main CSV
  // ─────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const s = incomeSummary;
    let csv = `Financial Report - ${selectedShopName}\n`;
    csv += `Period: ${incomeRange.from || 'Beginning'} to ${incomeRange.to || 'Present'}\n\n`;
    csv += `SUMMARY\n`;
    csv += `Gross Revenue,${s.totalGrossSales || 0}\n`;
    csv += `Cost of Goods,${s.totalCostOfGoods || 0}\n`;
    csv += `Gross Profit,${s.totalGrossProfit || 0}\n`;
    csv += `Expenses,${s.totalExpenses || 0}\n`;
    csv += `Net Profit,${s.netProfit || 0}\n\n`;

    csv += `SHOP PERFORMANCE\n`;
    csv += `Shop,Sales Count,Total Sales,Gross Profit\n`;
    (s.shopSalesBreakdown || []).forEach(sh => {
      csv += `"${sh.name}",${sh.salesCount},${sh.totalSales},${sh.grossProfit}\n`;
    });
    csv += `\n`;

    csv += `PRODUCT PROFITABILITY\n`;
    csv += `Product,SKU,Units,Revenue,Profit\n`;
    (s.topProducts || []).forEach(p => {
      csv += `"${p.name}","${p.sku}",${p.unitsSold},${p.revenue},${p.profit}\n`;
    });
    csv += `\n`;

    csv += `SELLER PERFORMANCE\n`;
    csv += `Seller,Orders,Total,Profit\n`;
    (s.sellerSales || []).forEach(se => {
      csv += `"${se.name}",${se.count},${se.total},${se.profit}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `financial_report_${selectedShopName.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addToast({ type: 'success', title: 'Report Exported', description: 'CSV report downloaded successfully.' });
  };

  // Export Deviations CSV — includes the "Snapshot?" column
  const handleExportDeviationsCSV = () => {
    if (deviations.length === 0) {
      addToast({ type: 'info', title: 'No Deviations', description: 'There are no price deviations in the current filter.' });
      return;
    }

    let csv = `Price Deviation Audit - ${selectedShopName}\n`;
    csv += `Period: ${deviationRange.from || 'Beginning'} to ${deviationRange.to || 'Present'}\n`;
    csv += `Direction: ${deviationDirection}\n\n`;
    csv += `Items Below Reference,${deviationStats.belowCount}\n`;
    csv += `Items Above Reference,${deviationStats.aboveCount}\n`;
    csv += `Extra Gained,${deviationStats.aboveImpact}\n`;
    csv += `Discount Value,${deviationStats.belowImpact}\n`;
    csv += `Net Impact,${deviationStats.netImpact}\n\n`;
    csv += `Date,Receipt #,Shop,Seller,Product,SKU,Reference,Sold At,Diff,Qty,Impact,Direction,Reference Source\n`;
    deviations.forEach(d => {
      csv += `"${formatDateTime(d.createdAt)}","${d.receiptNumber}","${d.shopName}","${d.sellerName}","${d.productName}","${d.sku}",${d.referencePrice},${d.soldPrice},${d.diff},${d.quantity},${d.totalImpact},${d.direction},"${d.usedSnapshot ? 'Sale-time snapshot' : 'Current product price (legacy)'}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `price_deviations_${selectedShopName.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addToast({ type: 'success', title: 'Deviations Exported', description: `${deviations.length} deviation(s) saved.` });
  };

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div id="admin-reports-view" className="flex-1 p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Global Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Financial & Profit/Loss Reports</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit store performance, gross margins, operating expenses, and price deviations
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={shopFilter}
            onChange={e => setShopFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
          >
            <option value="ALL">🏪 All Shops</option>
            {shops.map(s => <option key={s.id} value={s.id}>🏪 {s.name}</option>)}
          </select>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold transition"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrintReport}
            disabled={isPrinting}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* ── INCOME STATEMENT ──────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl mb-5">
        <SectionHeader
          title="Income Statement Summary"
          subtitle="Revenue, cost of goods, expenses, and net profit"
          icon={<FileText className="w-5 h-5 text-blue-400" />}
          period={reportPeriod}
          onPeriodChange={setReportPeriod}
          customStart={customStartDate}
          customEnd={customEndDate}
          onCustomStartChange={setCustomStartDate}
          onCustomEndChange={setCustomEndDate}
          collapsed={incomeCollapsed}
          onToggleCollapsed={() => setIncomeCollapsed(v => !v)}
          accent="blue"
        />
        {!incomeCollapsed && (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-slate-800/80">
                  <span className="text-slate-300 font-medium">Gross Revenue</span>
                  <span className="font-mono font-bold text-white text-sm">
                    {formatCurrency(incomeSummary.totalGrossSales || 0, settings.currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800/80 text-slate-400">
                  <span>Less: COGS</span>
                  <span className="font-mono text-rose-400">
                    -{formatCurrency(incomeSummary.totalCostOfGoods || 0, settings.currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between py-2.5 bg-slate-950/80 px-3 rounded-lg border border-slate-800">
                  <div>
                    <span className="font-bold text-white">Gross Profit</span>
                    <span className="text-[10px] text-emerald-400 block font-mono">
                      {incomeSummary.profitMarginPercent || 0}% Margin
                    </span>
                  </div>
                  <span className="font-mono font-bold text-emerald-400 text-base">
                    {formatCurrency(incomeSummary.totalGrossProfit || 0, settings.currencySymbol)}
                  </span>
                </div>
              </div>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-slate-800/80 text-slate-400">
                  <span>Less: Expenses</span>
                  <span className="font-mono text-rose-400">
                    -{formatCurrency(incomeSummary.totalExpenses || 0, settings.currencySymbol)}
                  </span>
                </div>
                <div className={`flex justify-between py-2.5 px-3 rounded-lg border ${
                  (incomeSummary.netProfit || 0) >= 0
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-rose-500/10 border-rose-500/30'
                }`}>
                  <div>
                    <span className="font-bold text-white">NET PROFIT</span>
                    <span className="text-[10px] text-slate-300 block font-mono">
                      {incomeSummary.netMarginPercent || 0}% Net Return
                    </span>
                  </div>
                  <span className={`font-mono font-extrabold text-base ${
                    (incomeSummary.netProfit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {formatCurrency(incomeSummary.netProfit || 0, settings.currencySymbol)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── PRICE DEVIATION AUDIT ─────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl mb-5">
        <SectionHeader
          title="Price Deviation Audit"
          subtitle="Sales where sellers charged above or below the reference price"
          icon={<TrendingDown className="w-5 h-5 text-rose-400" />}
          period={deviationPeriod}
          onPeriodChange={setDeviationPeriod}
          customStart={deviationStart}
          customEnd={deviationEnd}
          onCustomStartChange={setDeviationStart}
          onCustomEndChange={setDeviationEnd}
          collapsed={deviationCollapsed}
          onToggleCollapsed={() => setDeviationCollapsed(v => !v)}
          accent="rose"
          actions={
            allDeviations.length > 0 ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportDeviationsCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                </button>
                <button
                  onClick={handlePrintDeviations}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
              </div>
            ) : null
          }
        />
        {!deviationCollapsed && (
          <>
            {allDeviations.length === 0 ? (
              <div className="p-6 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
                  <TrendingUp className="w-4 h-4" />
                  <span>All sales match the reference selling price for this period</span>
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/40">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-semibold text-rose-300 uppercase tracking-wider">Below Reference</span>
                      <TrendingDown className="w-4 h-4 text-rose-400" />
                    </div>
                    <div className="text-xl font-bold text-rose-300 font-mono">{deviationStats.belowCount}</div>
                    <div className="text-[10px] text-rose-400/80 mt-0.5">
                      {deviationStats.belowSalesCount} sale{deviationStats.belowSalesCount === 1 ? '' : 's'}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/40">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-semibold text-emerald-300 uppercase tracking-wider">Above Reference</span>
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-xl font-bold text-emerald-300 font-mono">{deviationStats.aboveCount}</div>
                    <div className="text-[10px] text-emerald-400/80 mt-0.5">
                      {deviationStats.aboveSalesCount} sale{deviationStats.aboveSalesCount === 1 ? '' : 's'}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-orange-950/30 border border-orange-800/40">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-semibold text-orange-300 uppercase tracking-wider">Discount Value</span>
                      <TrendingDown className="w-4 h-4 text-orange-400" />
                    </div>
                    <div className="text-xl font-bold text-orange-300 font-mono">
                      {formatCurrency(deviationStats.belowImpact, settings.currencySymbol)}
                    </div>
                    <div className="text-[10px] text-orange-400/80 mt-0.5">Total value below reference</div>
                  </div>

                  <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-800/40">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-semibold text-blue-300 uppercase tracking-wider">Extra Gained</span>
                      <TrendingUp className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="text-xl font-bold text-blue-300 font-mono">
                      +{formatCurrency(deviationStats.aboveImpact, settings.currencySymbol)}
                    </div>
                    <div className="text-[10px] text-blue-400/80 mt-0.5">Total value above reference</div>
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
                  deviationStats.netImpact >= 0 ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-rose-950/20 border-rose-800/40'
                }`}>
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Net Impact</span>
                  <span className={`text-lg font-bold font-mono ${
                    deviationStats.netImpact >= 0 ? 'text-emerald-300' : 'text-rose-300'
                  }`}>
                    {deviationStats.netImpact > 0 ? '+' : ''}{formatCurrency(deviationStats.netImpact, settings.currencySymbol)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-semibold">
                    <button
                      onClick={() => setDeviationDirection('ALL')}
                      className={`px-3.5 py-1.5 rounded-md transition ${
                        deviationDirection === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      All ({allDeviations.length})
                    </button>
                    <button
                      onClick={() => setDeviationDirection('BELOW')}
                      className={`px-3.5 py-1.5 rounded-md transition ${
                        deviationDirection === 'BELOW' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-rose-300'
                      }`}
                    >
                      Below ({deviationStats.belowCount})
                    </button>
                    <button
                      onClick={() => setDeviationDirection('ABOVE')}
                      className={`px-3.5 py-1.5 rounded-md transition ${
                        deviationDirection === 'ABOVE' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-emerald-300'
                      }`}
                    >
                      Above ({deviationStats.aboveCount})
                    </button>
                  </div>

                  <span className="text-[11px] text-slate-500 font-mono">
                    Showing {visibleDeviations.length} of {deviations.length}
                    {hiddenDeviationCount > 0 && ` · ${hiddenDeviationCount} more — export CSV to see all`}
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-800 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                        <th className="py-2.5 px-3 font-semibold">Date</th>
                        <th className="py-2.5 px-3 font-semibold">Receipt</th>
                        <th className="py-2.5 px-3 font-semibold">Shop</th>
                        <th className="py-2.5 px-3 font-semibold">Seller</th>
                        <th className="py-2.5 px-3 font-semibold">Product</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Reference</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Sold At</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Diff</th>
                        <th className="py-2.5 px-3 text-center font-semibold">Qty</th>
                        <th className="py-2.5 px-3 text-right font-semibold">Impact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {visibleDeviations.map((d, idx) => {
                        const isBelow = d.direction === 'BELOW';
                        return (
                          <tr
                            key={`${d.saleId}-${d.productId}-${idx}`}
                            className={isBelow ? 'bg-rose-950/10 hover:bg-rose-950/20' : 'bg-emerald-950/10 hover:bg-emerald-950/20'}
                          >
                            <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap font-mono">{formatDateTime(d.createdAt)}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-white">{d.receiptNumber}</td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded bg-blue-950/70 text-blue-300 border border-blue-800/50 text-[10px] font-semibold">
                                🏪 {d.shopName || 'N/A'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-300 font-medium">{d.sellerName}</td>
                            <td className="py-2.5 px-3 text-slate-200">
                              <div className="font-medium truncate max-w-[180px]" title={d.productName}>{d.productName}</div>
                              <div className="text-[10px] text-slate-500 font-mono">{d.sku}</div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                              {formatCurrency(d.referencePrice, settings.currencySymbol)}
                              {/* Small badge for legacy rows that used the current product price */}
                              {!d.usedSnapshot && (
                                <span
                                  className="ml-1 text-[9px] text-slate-500"
                                  title="Compared against current product price (legacy sale — no snapshot recorded)"
                                >
                                  est.
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                              {formatCurrency(d.soldPrice, settings.currencySymbol)}
                            </td>
                            <td className={`py-2.5 px-3 text-right font-mono font-bold ${
                              isBelow ? 'text-rose-400' : 'text-emerald-400'
                            }`}>
                              {d.diff > 0 ? '+' : ''}{formatCurrency(d.diff, settings.currencySymbol)}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-300">{d.quantity}</td>
                            <td className={`py-2.5 px-3 text-right font-mono font-bold ${
                              isBelow ? 'text-rose-400' : 'text-emerald-400'
                            }`}>
                              {d.totalImpact > 0 ? '+' : ''}{formatCurrency(d.totalImpact, settings.currencySymbol)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── SHOP PERFORMANCE ─────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl mb-5">
        <SectionHeader
          title="Shop Performance Breakdown"
          subtitle="Sales volume and profit contribution by shop unit"
          icon={<Store className="w-5 h-5 text-blue-400" />}
          period={shopPeriod}
          onPeriodChange={setShopPeriod}
          customStart={shopStart}
          customEnd={shopEnd}
          onCustomStartChange={setShopStart}
          onCustomEndChange={setShopEnd}
          collapsed={shopsCollapsed}
          onToggleCollapsed={() => setShopsCollapsed(v => !v)}
          accent="blue"
        />
        {!shopsCollapsed && (
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-2 font-semibold">Shop</th>
                    <th className="pb-2 text-center font-semibold">Sales</th>
                    <th className="pb-2 text-right font-semibold">Total Sales</th>
                    <th className="pb-2 text-right font-semibold">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(shopSummary.shopSalesBreakdown || []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-500">No shop data in this period.</td>
                    </tr>
                  ) : (
                    (shopSummary.shopSalesBreakdown || []).map(shop => (
                      <tr key={shop.id}>
                        <td className="py-2.5 text-white font-semibold">🏪 {shop.name}</td>
                        <td className="py-2.5 text-center font-mono text-slate-300">{shop.salesCount}</td>
                        <td className="py-2.5 text-right font-mono font-medium text-white">
                          {formatCurrency(shop.totalSales, settings.currencySymbol)}
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold text-emerald-400">
                          +{formatCurrency(shop.grossProfit, settings.currencySymbol)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── PRODUCT PROFITABILITY ────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl mb-5">
        <SectionHeader
          title="Product Profitability Breakdown"
          subtitle="Revenue and profit per product"
          icon={<Package className="w-5 h-5 text-purple-400" />}
          period={productPeriod}
          onPeriodChange={setProductPeriod}
          customStart={productStart}
          customEnd={productEnd}
          onCustomStartChange={setProductStart}
          onCustomEndChange={setProductEnd}
          collapsed={productsCollapsed}
          onToggleCollapsed={() => setProductsCollapsed(v => !v)}
          accent="purple"
          actions={
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="Filter..."
                className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white w-40"
              />
            </div>
          }
        />
        {!productsCollapsed && (
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-2 font-semibold">Product</th>
                    <th className="pb-2 text-center font-semibold">Qty</th>
                    <th className="pb-2 text-right font-semibold">Revenue</th>
                    <th className="pb-2 text-right font-semibold">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-500">No product data in this period.</td>
                    </tr>
                  ) : (
                    filteredProducts.map(p => (
                      <tr key={p.sku}>
                        <td className="py-2.5 text-white font-medium">
                          <div>{p.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{p.sku}</div>
                        </td>
                        <td className="py-2.5 text-center font-mono text-slate-300">{p.unitsSold}</td>
                        <td className="py-2.5 text-right font-mono font-medium text-white">
                          {formatCurrency(p.revenue, settings.currencySymbol)}
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold text-emerald-400">
                          +{formatCurrency(p.profit, settings.currencySymbol)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── SELLER PERFORMANCE ────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <SectionHeader
          title="Seller Performance Contribution"
          subtitle="Revenue and profit per seller"
          icon={<Users className="w-5 h-5 text-purple-400" />}
          period={sellerPeriod}
          onPeriodChange={setSellerPeriod}
          customStart={sellerStart}
          customEnd={sellerEnd}
          onCustomStartChange={setSellerStart}
          onCustomEndChange={setSellerEnd}
          collapsed={sellersCollapsed}
          onToggleCollapsed={() => setSellersCollapsed(v => !v)}
          accent="amber"
          actions={
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                value={sellerSearch}
                onChange={e => setSellerSearch(e.target.value)}
                placeholder="Filter..."
                className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white w-36"
              />
            </div>
          }
        />
        {!sellersCollapsed && (
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-2 font-semibold">Seller</th>
                    <th className="pb-2 text-center font-semibold">Orders</th>
                    <th className="pb-2 text-right font-semibold">Total Sales</th>
                    <th className="pb-2 text-right font-semibold">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredSellers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-500">No seller data in this period.</td>
                    </tr>
                  ) : (
                    filteredSellers.map(seller => (
                      <tr key={seller.name}>
                        <td className="py-2.5 text-white font-semibold">{seller.name}</td>
                        <td className="py-2.5 text-center font-mono text-slate-300">{seller.count}</td>
                        <td className="py-2.5 text-right font-mono font-medium text-white">
                          {formatCurrency(seller.total, settings.currencySymbol)}
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold text-emerald-400">
                          +{formatCurrency(seller.profit, settings.currencySymbol)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
