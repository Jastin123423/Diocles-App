import React, { useState, useMemo } from 'react';
import {
  FileText,
  Printer,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Download,
  Users,
  Package,
  Store,
  Search,
  Filter,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ReportService } from '../../services/reportService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

// ─────────────────────────────────────────────────────────────
// Price Deviation row shape
// ─────────────────────────────────────────────────────────────
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
}

type DeviationDirection = 'ALL' | 'ABOVE' | 'BELOW';

export const AdminReports: React.FC = () => {
  const { currentUser, dbState, addToast } = useApp();
  const [reportPeriod, setReportPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Filters
  const [shopFilter, setShopFilter] = useState('ALL');
  const [productSearch, setProductSearch] = useState('');
  const [sellerSearch, setSellerSearch] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);

  // 🔧 NEW: Deviation sub-filter (defaults to All)
  const [deviationDirection, setDeviationDirection] = useState<DeviationDirection>('ALL');

  // Permission check: Admin OR Seller with canViewReports
  if (!currentUser) return null;
  if (currentUser.role !== 'ADMIN' && !currentUser.permissions?.canViewReports) return null;

  const settings = dbState.settings;
  const shops = dbState.shops || [];
  const products = dbState.products || [];

  const dateRange = useMemo(() => {
    const now = new Date();
    if (reportPeriod === 'today') {
      const d = now.toISOString().slice(0, 10);
      return { from: d, to: d };
    }
    if (reportPeriod === 'week') {
      const past = new Date(now.getTime() - 7 * 86400000);
      return { from: past.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
    }
    if (reportPeriod === 'month') {
      const past = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: past.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
    }
    return { from: customStartDate || undefined, to: customEndDate || undefined };
  }, [reportPeriod, customStartDate, customEndDate]);

  // Fallback-safe summary
  const summary = useMemo(() => {
    const result = ReportService.getFinancialSummary(
      dateRange,
      { shopId: shopFilter },
      currentUser
    );
    return result || {
      totalGrossSales: 0,
      totalCostOfGoods: 0,
      totalGrossProfit: 0,
      totalExpenses: 0,
      netProfit: 0,
      profitMarginPercent: 0,
      netMarginPercent: 0,
      shopSalesBreakdown: [],
      topProducts: [],
      sellerSales: [],
      filteredSales: [],
    };
  }, [dateRange, currentUser, dbState, shopFilter]);

  // Filter products
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return summary.topProducts || [];
    const q = productSearch.trim().toLowerCase();
    return (summary.topProducts || []).filter(p =>
      p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [summary.topProducts, productSearch]);

  // Filter sellers
  const filteredSellers = useMemo(() => {
    if (!sellerSearch.trim()) return summary.sellerSales || [];
    const q = sellerSearch.trim().toLowerCase();
    return (summary.sellerSales || []).filter(s => s.name.toLowerCase().includes(q));
  }, [summary.sellerSales, sellerSearch]);

  const selectedShopName = shopFilter === 'ALL' ? 'All Shops' : (shops.find(s => s.id === shopFilter)?.name || 'Unknown');

  // ─────────────────────────────────────────────────────────────
  // 🔧 NEW: Compute Price Deviations from summary.filteredSales
  //   For each non-voided sale line: compare unit_price against
  //   product's reference (proposedSellingPrice ?? sellingPrice).
  // ─────────────────────────────────────────────────────────────
  const allDeviations = useMemo<DeviationRow[]>(() => {
    const sales = summary.filteredSales || [];
    const productMap = new Map(products.map(p => [p.id, p]));
    const rows: DeviationRow[] = [];

    for (const sale of sales) {
      if (sale.status === 'VOIDED') continue;

      for (const item of sale.items || []) {
        const product = productMap.get(item.productId);
        if (!product) continue;

        const referencePrice =
          (product.proposedSellingPrice && product.proposedSellingPrice > 0)
            ? product.proposedSellingPrice
            : (product.sellingPrice || 0);

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
        });
      }
    }

    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return rows;
  }, [summary.filteredSales, products]);

  const deviations = useMemo(() => {
    if (deviationDirection === 'ALL') return allDeviations;
    return allDeviations.filter(d => d.direction === deviationDirection);
  }, [allDeviations, deviationDirection]);

  const deviationStats = useMemo(() => {
    const belowRows = allDeviations.filter(d => d.direction === 'BELOW');
    const aboveRows = allDeviations.filter(d => d.direction === 'ABOVE');

    const belowImpact = belowRows.reduce((sum, r) => sum + r.totalImpact, 0);
    const aboveImpact = aboveRows.reduce((sum, r) => sum + r.totalImpact, 0);
    const netImpact = belowImpact + aboveImpact;

    return {
      belowCount: belowRows.length,
      aboveCount: aboveRows.length,
      belowSalesCount: new Set(belowRows.map(r => r.saleId)).size,
      aboveSalesCount: new Set(aboveRows.map(r => r.saleId)).size,
      belowImpact: Number(belowImpact.toFixed(2)),
      aboveImpact: Number(aboveImpact.toFixed(2)),
      netImpact: Number(netImpact.toFixed(2)),
    };
  }, [allDeviations]);

  const DEVIATION_DISPLAY_CAP = 200;
  const visibleDeviations = deviations.slice(0, DEVIATION_DISPLAY_CAP);
  const hiddenDeviationCount = Math.max(0, deviations.length - DEVIATION_DISPLAY_CAP);

  // ─────────────────────────────────────────────────────────────
  // Print Main Report
  // ─────────────────────────────────────────────────────────────
  const handlePrintReport = () => {
    setIsPrinting(true);

    const printWindow = window.open('', '_blank', 'width=1400,height=900');
    if (!printWindow) {
      addToast({ type: 'error', title: 'Popup Blocked', description: 'Please allow popups to print.' });
      setIsPrinting(false);
      return;
    }

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
          .header .badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-top: 10px; }
          .section { margin-bottom: 30px; page-break-inside: avoid; }
          .section-title { font-size: 18px; color: #1e293b; font-weight: bold; margin-bottom: 15px; padding: 10px 15px; background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%); border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; }
          .summary-card { padding: 20px; border-radius: 10px; text-align: center; color: #fff; }
          .summary-card.gross { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
          .summary-card.profit { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); }
          .summary-card.expenses { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
          .summary-card.net { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); }
          .summary-card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.9; }
          .summary-card .value { font-size: 24px; font-weight: bold; margin-top: 8px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
          thead { background: #1e293b; color: #fff; }
          th { padding: 12px 10px; text-align: left; font-weight: 600; }
          td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
          tr:nth-child(even) { background: #f8fafc; }
          .amount { text-align: right; font-family: 'Courier New', monospace; font-weight: bold; }
          .positive { color: #16a34a; }
          .negative { color: #dc2626; }
          .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #94a3b8; border-top: 2px solid #e2e8f0; padding-top: 15px; }
          .divider { border: none; border-top: 2px dashed #cbd5e1; margin: 25px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${settings.businessName}</h1>
          <div class="company">${settings.tagline || ''}</div>
          <div class="meta">
            <strong>Financial & Performance Report</strong><br>
            Period: ${dateRange.from || 'Beginning'} to ${dateRange.to || 'Present'}<br>
            Generated: ${new Date().toLocaleString()}
          </div>
          <div class="badge">🏪 ${selectedShopName}</div>
        </div>

        <div class="summary-grid">
          <div class="summary-card gross">
            <div class="label">Gross Revenue</div>
            <div class="value">${settings.currencySymbol} ${(summary.totalGrossSales || 0).toLocaleString()}</div>
          </div>
          <div class="summary-card profit">
            <div class="label">Gross Profit</div>
            <div class="value">${settings.currencySymbol} ${(summary.totalGrossProfit || 0).toLocaleString()}</div>
          </div>
          <div class="summary-card expenses">
            <div class="label">Total Expenses</div>
            <div class="value">${settings.currencySymbol} ${(summary.totalExpenses || 0).toLocaleString()}</div>
          </div>
          <div class="summary-card net">
            <div class="label">Net Profit</div>
            <div class="value">${settings.currencySymbol} ${(summary.netProfit || 0).toLocaleString()}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">📊 Income Statement Summary</div>
          <table>
            <tbody>
              <tr><td><strong>Gross Revenue (Completed Sales)</strong></td><td class="amount">${settings.currencySymbol} ${(summary.totalGrossSales || 0).toLocaleString()}</td></tr>
              <tr><td>Less: Cost of Goods Sold (COGS)</td><td class="amount negative">-${settings.currencySymbol} ${(summary.totalCostOfGoods || 0).toLocaleString()}</td></tr>
              <tr><td><strong>Gross Operating Profit</strong></td><td class="amount positive">${settings.currencySymbol} ${(summary.totalGrossProfit || 0).toLocaleString()} (${summary.profitMarginPercent || 0}%)</td></tr>
              <tr><td>Less: Operating Overhead Expenses</td><td class="amount negative">-${settings.currencySymbol} ${(summary.totalExpenses || 0).toLocaleString()}</td></tr>
              <tr style="background:#f0fdf4; font-size:14px;"><td><strong>NET PROFIT / (LOSS)</strong></td><td class="amount ${(summary.netProfit || 0) >= 0 ? 'positive' : 'negative'}">${settings.currencySymbol} ${(summary.netProfit || 0).toLocaleString()} (${summary.netMarginPercent || 0}%)</td></tr>
            </tbody>
          </table>
        </div>

        <hr class="divider">

        <div class="section">
          <div class="section-title">🏪 Shop Performance Breakdown</div>
          <table>
            <thead>
              <tr>
                <th>Shop Name</th>
                <th class="amount">Sales Count</th>
                <th class="amount">Total Sales</th>
                <th class="amount">Gross Profit</th>
                <th class="amount">Expenses</th>
                <th class="amount">Net Contribution</th>
              </tr>
            </thead>
            <tbody>
              ${(summary.shopSalesBreakdown || []).map(shop => `
                <tr>
                  <td><strong>🏪 ${shop.name}</strong></td>
                  <td class="amount">${shop.salesCount}</td>
                  <td class="amount">${settings.currencySymbol} ${shop.totalSales.toLocaleString()}</td>
                  <td class="amount positive">${settings.currencySymbol} ${shop.grossProfit.toLocaleString()}</td>
                  <td class="amount negative">${settings.currencySymbol} ${shop.expenseTotal.toLocaleString()}</td>
                  <td class="amount ${shop.grossProfit - shop.expenseTotal >= 0 ? 'positive' : 'negative'}">${settings.currencySymbol} ${(shop.grossProfit - shop.expenseTotal).toLocaleString()}</td>
                </tr>
              `).join('') || '<tr><td colspan="6" style="text-align:center;">No shop data available</td></tr>'}
            </tbody>
          </table>
        </div>

        <hr class="divider">

        <div class="section">
          <div class="section-title">📦 Product Profitability Breakdown</div>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th class="amount">Units Sold</th>
                <th class="amount">Revenue</th>
                <th class="amount">Profit</th>
              </tr>
            </thead>
            <tbody>
              ${(summary.topProducts || []).map(p => `
                <tr>
                  <td><strong>${p.name}</strong></td>
                  <td style="font-family:monospace;">${p.sku}</td>
                  <td class="amount">${p.unitsSold}</td>
                  <td class="amount">${settings.currencySymbol} ${p.revenue.toLocaleString()}</td>
                  <td class="amount positive">+${settings.currencySymbol} ${p.profit.toLocaleString()}</td>
                </tr>
              `).join('') || '<tr><td colspan="5" style="text-align:center;">No product data available</td></tr>'}
            </tbody>
          </table>
        </div>

        <hr class="divider">

        <div class="section">
          <div class="section-title">👥 Seller Performance Contribution</div>
          <table>
            <thead>
              <tr>
                <th>Seller Name</th>
                <th class="amount">Orders</th>
                <th class="amount">Total Sales</th>
                <th class="amount">Gross Profit</th>
              </tr>
            </thead>
            <tbody>
              ${(summary.sellerSales || []).map(seller => `
                <tr>
                  <td><strong>${seller.name}</strong></td>
                  <td class="amount">${seller.count}</td>
                  <td class="amount">${settings.currencySymbol} ${seller.total.toLocaleString()}</td>
                  <td class="amount positive">+${settings.currencySymbol} ${seller.profit.toLocaleString()}</td>
                </tr>
              `).join('') || '<tr><td colspan="4" style="text-align:center;">No seller data available</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="footer">
          ${settings.businessName} - ${settings.address || ''}<br>
          Phone: ${settings.phone || 'N/A'} | Email: ${settings.email || 'N/A'}<br>
          ${settings.receiptFooterNote || 'Thank you for your business!'}
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
  // 🔧 NEW: Print Deviation Report (separate document)
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
        <title>Price Deviation Audit - ${selectedShopName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: #fff; color: #1e293b; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 3px double #dc2626; padding-bottom: 15px; }
          .header h1 { font-size: 24px; color: #991b1b; font-weight: bold; }
          .header .company { font-size: 16px; color: #475569; margin-top: 5px; }
          .header .meta { font-size: 12px; color: #64748b; margin-top: 8px; }
          .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
          .card { padding: 14px; border-radius: 8px; text-align: center; }
          .card.below { background: #fef2f2; border: 2px solid #dc2626; }
          .card.above { background: #f0fdf4; border: 2px solid #16a34a; }
          .card.gained { background: #eff6ff; border: 2px solid #3b82f6; }
          .card.discount { background: #fff7ed; border: 2px solid #f97316; }
          .card .label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 600; }
          .card .value { font-size: 20px; font-weight: bold; margin-top: 5px; }
          .card.below .value { color: #991b1b; }
          .card.above .value { color: #166534; }
          .card.gained .value { color: #1e40af; }
          .card.discount .value { color: #c2410c; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          thead { background: #1e293b; color: #fff; }
          th { padding: 9px 7px; text-align: left; font-weight: 600; }
          td { padding: 7px; border-bottom: 1px solid #e2e8f0; }
          tr.below td { background: #fef2f2; }
          tr.above td { background: #f0fdf4; }
          .amount { text-align: right; font-family: 'Courier New', monospace; font-weight: bold; }
          .diff-below { color: #dc2626; font-weight: bold; text-align: right; font-family: 'Courier New', monospace; }
          .diff-above { color: #16a34a; font-weight: bold; text-align: right; font-family: 'Courier New', monospace; }
          .footer { text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          .shop-badge { display: inline-block; background: #fee2e2; color: #991b1b; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-top: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Price Deviation Audit Report</h1>
          <div class="company">${settings.businessName}</div>
          <div class="meta">
            <strong>Sales where sellers charged above or below reference price</strong><br>
            Shop: ${selectedShopName} | Period: ${dateRange.from || 'Beginning'} to ${dateRange.to || 'Present'}<br>
            Direction: ${deviationDirection === 'ALL' ? 'All deviations' : deviationDirection === 'ABOVE' ? 'Above reference only' : 'Below reference only'}<br>
            Generated: ${new Date().toLocaleString()}
          </div>
          <div class="shop-badge">⚠️ Deviation Report</div>
        </div>

        <div class="summary">
          <div class="card below">
            <div class="label">Below Reference</div>
            <div class="value">${deviationStats.belowCount}</div>
          </div>
          <div class="card above">
            <div class="label">Above Reference</div>
            <div class="value">${deviationStats.aboveCount}</div>
          </div>
          <div class="card gained">
            <div class="label">Extra Gained</div>
            <div class="value">+${settings.currencySymbol} ${deviationStats.aboveImpact.toLocaleString()}</div>
          </div>
          <div class="card discount">
            <div class="label">Discount Value</div>
            <div class="value">${settings.currencySymbol} ${deviationStats.belowImpact.toLocaleString()}</div>
          </div>
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
                <td>${d.shopName || 'N/A'}</td>
                <td>${d.sellerName}</td>
                <td>${d.productName}</td>
                <td style="font-family:monospace;">${d.sku}</td>
                <td class="amount">${settings.currencySymbol} ${d.referencePrice.toLocaleString()}</td>
                <td class="amount">${settings.currencySymbol} ${d.soldPrice.toLocaleString()}</td>
                <td class="${d.direction === 'BELOW' ? 'diff-below' : 'diff-above'}">${d.diff > 0 ? '+' : ''}${settings.currencySymbol} ${d.diff.toLocaleString()}</td>
                <td class="amount">${d.quantity}</td>
                <td class="${d.direction === 'BELOW' ? 'diff-below' : 'diff-above'}">${d.totalImpact > 0 ? '+' : ''}${settings.currencySymbol} ${d.totalImpact.toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          ${settings.businessName} - ${settings.address || ''} | Phone: ${settings.phone || 'N/A'}<br>
          Rows show sales where the charged price differed from the reference selling price. Admin sales are included.
        </div>

        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  // ─────────────────────────────────────────────────────────────
  // Export Main CSV (existing behavior)
  // ─────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    let csv = `Financial Report - ${selectedShopName}\n`;
    csv += `Period: ${dateRange.from || 'Beginning'} to ${dateRange.to || 'Present'}\n\n`;
    csv += `SUMMARY\n`;
    csv += `Gross Revenue,${summary.totalGrossSales || 0}\n`;
    csv += `Cost of Goods,${summary.totalCostOfGoods || 0}\n`;
    csv += `Gross Profit,${summary.totalGrossProfit || 0}\n`;
    csv += `Expenses,${summary.totalExpenses || 0}\n`;
    csv += `Net Profit,${summary.netProfit || 0}\n\n`;

    csv += `SHOP PERFORMANCE\n`;
    csv += `Shop,Sales Count,Total Sales,Gross Profit,Expenses,Net\n`;
    (summary.shopSalesBreakdown || []).forEach(s => {
      csv += `"${s.name}",${s.salesCount},${s.totalSales},${s.grossProfit},${s.expenseTotal},${s.grossProfit - s.expenseTotal}\n`;
    });
    csv += `\n`;

    csv += `PRODUCT PROFITABILITY\n`;
    csv += `Product,SKU,Units,Revenue,Profit\n`;
    (summary.topProducts || []).forEach(p => {
      csv += `"${p.name}","${p.sku}",${p.unitsSold},${p.revenue},${p.profit}\n`;
    });
    csv += `\n`;

    csv += `SELLER PERFORMANCE\n`;
    csv += `Seller,Orders,Total,Profit\n`;
    (summary.sellerSales || []).forEach(s => {
      csv += `"${s.name}",${s.count},${s.total},${s.profit}\n`;
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

  // ─────────────────────────────────────────────────────────────
  // 🔧 NEW: Export Deviations CSV (separate file)
  // ─────────────────────────────────────────────────────────────
  const handleExportDeviationsCSV = () => {
    if (deviations.length === 0) {
      addToast({ type: 'info', title: 'No Deviations', description: 'There are no price deviations in the current filter.' });
      return;
    }

    let csv = `Price Deviation Audit - ${selectedShopName}\n`;
    csv += `Period: ${dateRange.from || 'Beginning'} to ${dateRange.to || 'Present'}\n`;
    csv += `Direction Filter: ${deviationDirection}\n`;
    csv += `Generated: ${new Date().toLocaleString()}\n\n`;

    csv += `SUMMARY\n`;
    csv += `Items Below Reference,${deviationStats.belowCount}\n`;
    csv += `Items Above Reference,${deviationStats.aboveCount}\n`;
    csv += `Extra Gained,${deviationStats.aboveImpact}\n`;
    csv += `Discount Value,${deviationStats.belowImpact}\n`;
    csv += `Net Impact,${deviationStats.netImpact}\n\n`;

    csv += `DETAILS\n`;
    csv += `Date,Receipt #,Shop,Seller,Product,SKU,Reference Price,Sold Price,Difference,Qty,Total Impact,Direction\n`;

    deviations.forEach(d => {
      csv += `"${formatDateTime(d.createdAt)}","${d.receiptNumber}","${d.shopName}","${d.sellerName}","${d.productName}","${d.sku}",${d.referencePrice},${d.soldPrice},${d.diff},${d.quantity},${d.totalImpact},${d.direction}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `price_deviations_${selectedShopName.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    addToast({
      type: 'success',
      title: 'Deviations Exported',
      description: `${deviations.length} deviation${deviations.length === 1 ? '' : 's'} saved to CSV.`,
    });
  };

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div id="admin-reports-view" className="flex-1 p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Financial & Profit/Loss Reports</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit store performance, gross margins, operating expenses, and cash breakdown
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
            {[
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'Last 7 Days' },
              { id: 'month', label: 'This Month' },
              { id: 'custom', label: 'Custom' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setReportPeriod(p.id as any)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  reportPeriod === p.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

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

      {/* Custom Date Inputs */}
      {reportPeriod === 'custom' && (
        <div className="mb-5 p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3 text-xs">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-slate-400">Custom Date Range:</span>
          <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white" />
          <span className="text-slate-500">to</span>
          <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white" />
        </div>
      )}

      {/* Profit & Loss Statement */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl mb-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-bold text-white uppercase tracking-wider">Income Statement Summary</h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Period: {dateRange.from || 'Start'} to {dateRange.to || 'Present'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-2 border-b border-slate-800/80">
              <span className="text-slate-300 font-medium">Gross Revenue</span>
              <span className="font-mono font-bold text-white text-sm">{formatCurrency(summary.totalGrossSales || 0, settings.currencySymbol)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-800/80 text-slate-400">
              <span>Less: COGS</span>
              <span className="font-mono text-rose-400">-{formatCurrency(summary.totalCostOfGoods || 0, settings.currencySymbol)}</span>
            </div>
            <div className="flex justify-between py-2.5 bg-slate-950/80 px-3 rounded-lg border border-slate-800">
              <div>
                <span className="font-bold text-white">Gross Profit</span>
                <span className="text-[10px] text-emerald-400 block font-mono">{summary.profitMarginPercent || 0}% Margin</span>
              </div>
              <span className="font-mono font-bold text-emerald-400 text-base">{formatCurrency(summary.totalGrossProfit || 0, settings.currencySymbol)}</span>
            </div>
          </div>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-2 border-b border-slate-800/80 text-slate-400">
              <span>Less: Expenses</span>
              <span className="font-mono text-rose-400">-{formatCurrency(summary.totalExpenses || 0, settings.currencySymbol)}</span>
            </div>
            <div className={`flex justify-between py-2.5 px-3 rounded-lg border ${(summary.netProfit || 0) >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
              <div>
                <span className="font-bold text-white">NET PROFIT</span>
                <span className="text-[10px] text-slate-300 block font-mono">{summary.netMarginPercent || 0}% Net Return</span>
              </div>
              <span className={`font-mono font-extrabold text-base ${(summary.netProfit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(summary.netProfit || 0, settings.currencySymbol)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────── */}
      {/* 🔧 NEW: Price Deviation Audit Section                    */}
      {/* ──────────────────────────────────────────────────────── */}
      <div className="mb-6 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {/* Section Header */}
        <div className="p-5 border-b border-slate-800 bg-gradient-to-r from-rose-950/20 via-slate-900 to-slate-900">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
                <TrendingDown className="w-4.5 h-4.5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Price Deviation Audit</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sales where sellers charged above or below the reference selling price
                </p>
              </div>
            </div>

            {allDeviations.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportDeviationsCSV}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Export</span>
                </button>
                <button
                  onClick={handlePrintDeviations}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Empty state */}
        {allDeviations.length === 0 ? (
          <div className="p-6 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
              <TrendingUp className="w-4 h-4" />
              <span>All sales match the reference selling price</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              No price deviations detected for the selected period and shop.
            </p>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Summary cards */}
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
                <div className="text-[10px] text-orange-400/80 mt-0.5">
                  Total value below reference
                </div>
              </div>

              <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-800/40">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-blue-300 uppercase tracking-wider">Extra Gained</span>
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-xl font-bold text-blue-300 font-mono">
                  +{formatCurrency(deviationStats.aboveImpact, settings.currencySymbol)}
                </div>
                <div className="text-[10px] text-blue-400/80 mt-0.5">
                  Total value above reference
                </div>
              </div>
            </div>

            {/* Net impact ribbon */}
            <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
              deviationStats.netImpact >= 0
                ? 'bg-emerald-950/20 border-emerald-800/40'
                : 'bg-rose-950/20 border-rose-800/40'
            }`}>
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Net Impact</span>
              <span className={`text-lg font-bold font-mono ${
                deviationStats.netImpact >= 0 ? 'text-emerald-300' : 'text-rose-300'
              }`}>
                {deviationStats.netImpact > 0 ? '+' : ''}
                {formatCurrency(deviationStats.netImpact, settings.currencySymbol)}
              </span>
            </div>

            {/* Direction sub-filter */}
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

            {/* Deviations Table */}
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
                    <th className="py-2.5 px-3 text-right font-semibold">Total Impact</th>
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
                        <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap font-mono">
                          {formatDateTime(d.createdAt)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-white">{d.receiptNumber}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-blue-950/70 text-blue-300 border border-blue-800/50 text-[10px] font-semibold">
                            🏪 {d.shopName || 'N/A'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 font-medium">{d.sellerName}</td>
                        <td className="py-2.5 px-3 text-slate-200">
                          <div className="font-medium truncate max-w-[180px]" title={d.productName}>
                            {d.productName}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">{d.sku}</div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                          {formatCurrency(d.referencePrice, settings.currencySymbol)}
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
      </div>

      {/* Shops Performance */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-bold text-white">Shop Performance Breakdown</h3>
          </div>
          <select
            value={shopFilter}
            onChange={e => setShopFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
          >
            <option value="ALL">🏪 All Shops</option>
            {shops.map(s => <option key={s.id} value={s.id}>🏪 {s.name}</option>)}
          </select>
        </div>
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
              {(summary.shopSalesBreakdown || []).map(shop => (
                <tr key={shop.id}>
                  <td className="py-2.5 text-white font-semibold">🏪 {shop.name}</td>
                  <td className="py-2.5 text-center font-mono text-slate-300">{shop.salesCount}</td>
                  <td className="py-2.5 text-right font-mono font-medium text-white">{formatCurrency(shop.totalSales, settings.currencySymbol)}</td>
                  <td className="py-2.5 text-right font-mono font-bold text-emerald-400">+{formatCurrency(shop.grossProfit, settings.currencySymbol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Profitability */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-bold text-white">Product Profitability Breakdown</h3>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="Filter by product name or SKU..."
              className="bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white w-64"
            />
          </div>
        </div>
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
              {filteredProducts.map(p => (
                <tr key={p.sku}>
                  <td className="py-2.5 text-white font-medium">
                    <div>{p.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{p.sku}</div>
                  </td>
                  <td className="py-2.5 text-center font-mono text-slate-300">{p.unitsSold}</td>
                  <td className="py-2.5 text-right font-mono font-medium text-white">{formatCurrency(p.revenue, settings.currencySymbol)}</td>
                  <td className="py-2.5 text-right font-mono font-bold text-emerald-400">+{formatCurrency(p.profit, settings.currencySymbol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Seller Performance */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" />
            <h3 className="text-base font-bold text-white">Seller Performance Contribution</h3>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={sellerSearch}
              onChange={e => setSellerSearch(e.target.value)}
              placeholder="Filter by seller name..."
              className="bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white w-56"
            />
          </div>
        </div>
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
              {filteredSellers.map(seller => (
                <tr key={seller.name}>
                  <td className="py-2.5 text-white font-semibold">{seller.name}</td>
                  <td className="py-2.5 text-center font-mono text-slate-300">{seller.count}</td>
                  <td className="py-2.5 text-right font-mono font-medium text-white">{formatCurrency(seller.total, settings.currencySymbol)}</td>
                  <td className="py-2.5 text-right font-mono font-bold text-emerald-400">+{formatCurrency(seller.profit, settings.currencySymbol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
