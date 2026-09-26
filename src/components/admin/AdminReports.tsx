import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Receipt,
  Filter,
  Calendar,
  Eye,
  Ban,
  X,
  AlertTriangle,
  RotateCcw,
  CheckCircle,
  Printer,
  Download,
  Store,
  Pencil,
  Check,
  Clock,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SalesService, CartItemInput } from '../../services/salesService';
import { CloudflareApi } from '../../services/cloudflareApi';
import { SyncService } from '../../services/syncService';
import { db } from '../../db/storage';
import { Sale, SaleEditRequest } from '../../types';
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
  diff: number;         // soldPrice - referencePrice (per unit)
  totalImpact: number;  // diff * quantity
  direction: 'ABOVE' | 'BELOW';
}

type DeviationDirection = 'ALL' | 'ABOVE' | 'BELOW';

export const AdminSales: React.FC = () => {
  const { currentUser, showReceipt, dbState, addToast } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [sellerFilter, setSellerFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [shopFilter, setShopFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 🔧 NEW: Deviation direction sub-filter
  const [deviationDirection, setDeviationDirection] = useState<DeviationDirection>('ALL');

  // Void Sale Dialog
  const [voidingSale, setVoidingSale] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  // Edit Sale Dialog
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editItems, setEditItems] = useState<CartItemInput[]>([]);
  const [editReason, setEditReason] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Show pending edit requests
  const [showEditRequests, setShowEditRequests] = useState(false);

  // Permission check: Admin OR Seller with canEditSales/canDeleteSales
  if (!currentUser) return null;
  if (currentUser.role !== 'ADMIN' && !currentUser.permissions?.canEditSales && !currentUser.permissions?.canDeleteSales) return null;

  // Permission flags
  const canEditSale = currentUser.role === 'ADMIN' || currentUser.permissions?.canEditSales;
  const canVoidSale = currentUser.role === 'ADMIN' || currentUser.permissions?.canDeleteSales;
  const isAdmin = currentUser.role === 'ADMIN';

  // Force pull when component mounts
  useEffect(() => {
    const forcePull = async () => {
      try {
        const online = await CloudflareApi.checkConnection();
        if (!online) return;

        console.log('[AdminSales] Pulling latest sale edit requests...');
        const pullResult = await CloudflareApi.pullSync();

        if (pullResult.success && pullResult.data) {
          SyncService.applyCloudData(pullResult.data);

          const state = db.getState();
          console.log('[AdminSales] Pull completed, edit requests:', state.saleEditRequests?.length || 0);
        }
      } catch (error) {
        console.log('[AdminSales] Pull error:', error);
      }
    };

    forcePull();
  }, []);

  const refreshEditRequests = async () => {
    setIsRefreshing(true);
    try {
      const online = await CloudflareApi.checkConnection();
      if (!online) {
        addToast({ type: 'error', title: 'Offline', description: 'Cannot refresh while offline.' });
        return;
      }

      const pullResult = await CloudflareApi.pullSync();
      if (pullResult.success && pullResult.data) {
        SyncService.applyCloudData(pullResult.data);
        addToast({ type: 'success', title: 'Refreshed', description: 'Sale edit requests updated.' });
      }
    } catch (error) {
      console.log('Refresh error:', error);
      addToast({ type: 'error', title: 'Refresh Failed', description: 'Could not refresh data.' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const settings = dbState.settings;
  const sellers = dbState.users.filter(u => u.role === 'SELLER');
  const shops = dbState.shops || [];
  const products = dbState.products || [];
  const editRequests = SalesService.getSaleEditRequests(currentUser);
  const pendingRequests = editRequests.filter(r => r.status === 'PENDING');

  const sales = SalesService.getSales(
    {
      search: searchQuery,
      sellerId: sellerFilter === 'ALL' ? undefined : sellerFilter,
      paymentMethod: paymentFilter === 'ALL' ? undefined : (paymentFilter as any),
      status: statusFilter === 'ALL' ? undefined : (statusFilter as any),
      shopId: shopFilter === 'ALL' ? undefined : shopFilter,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    },
    currentUser
  );

  const totalVolume = sales.reduce((sum, s) => (s.status === 'COMPLETED' ? sum + s.total : sum), 0);
  const totalProfit = sales.reduce((sum, s) => (s.status === 'COMPLETED' ? sum + s.grossProfit : sum), 0);

  const selectedShopName = shopFilter === 'ALL' ? 'All Shops' : (shops.find(s => s.id === shopFilter)?.name || 'Unknown Shop');

  // ─────────────────────────────────────────────────────────────
  // 🔧 NEW: Compute price deviations from filtered sales
  //   For each non-voided sale, each line item, compare unitPrice
  //   against the product's reference price.
  //   referencePrice = proposedSellingPrice ?? sellingPrice
  //   Skip rows where reference <= 0 (can't compare).
  // ─────────────────────────────────────────────────────────────
  const allDeviations = useMemo<DeviationRow[]>(() => {
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

        // Strict inequality — anything not exactly the reference is a deviation
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

    // Newest first
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return rows;
  }, [sales, products]);

  // Sub-filtered list
  const deviations = useMemo(() => {
    if (deviationDirection === 'ALL') return allDeviations;
    return allDeviations.filter(d => d.direction === deviationDirection);
  }, [allDeviations, deviationDirection]);

  // Aggregates
  const deviationStats = useMemo(() => {
    const belowRows = allDeviations.filter(d => d.direction === 'BELOW');
    const aboveRows = allDeviations.filter(d => d.direction === 'ABOVE');

    const belowImpact = belowRows.reduce((sum, r) => sum + r.totalImpact, 0); // negative
    const aboveImpact = aboveRows.reduce((sum, r) => sum + r.totalImpact, 0); // positive
    const netImpact = belowImpact + aboveImpact;

    // Distinct sales count
    const belowSales = new Set(belowRows.map(r => r.saleId));
    const aboveSales = new Set(aboveRows.map(r => r.saleId));

    return {
      belowCount: belowRows.length,
      aboveCount: aboveRows.length,
      belowSalesCount: belowSales.size,
      aboveSalesCount: aboveSales.size,
      belowImpact: Number(belowImpact.toFixed(2)),
      aboveImpact: Number(aboveImpact.toFixed(2)),
      netImpact: Number(netImpact.toFixed(2)),
    };
  }, [allDeviations]);

  // Display cap to keep the page responsive on huge datasets
  const DEVIATION_DISPLAY_CAP = 200;
  const visibleDeviations = deviations.slice(0, DEVIATION_DISPLAY_CAP);
  const hiddenDeviationCount = Math.max(0, deviations.length - DEVIATION_DISPLAY_CAP);

  // ─────────────────────────────────────────────────────────────
  // Void handling
  // ─────────────────────────────────────────────────────────────
  const handleExecuteVoid = () => {
    if (!voidingSale || !currentUser) return;
    if (!voidReason.trim()) {
      addToast({
        type: 'warning',
        title: 'Reason Required',
        description: 'Please provide a reason for cancelling this sale.',
      });
      return;
    }

    setIsVoiding(true);
    const res = SalesService.voidSale(voidingSale.id, voidReason, currentUser);
    setIsVoiding(false);

    if (res.success) {
      addToast({
        type: 'success',
        title: 'Sale Voided & Inventory Restored',
        description: `Receipt #${voidingSale.receiptNumber} marked voided. All product quantities were returned to stock.`,
      });
      setVoidingSale(null);
      setVoidReason('');
    } else {
      addToast({
        type: 'error',
        title: 'Void Failed',
        description: res.error || 'Could not void transaction.',
      });
    }
  };

  const openEditSale = (sale: Sale) => {
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

  const handleSaveEdit = () => {
    if (!editingSale || !currentUser) return;

    setIsEditing(true);
    const result = SalesService.requestSaleEdit(
      editingSale.id,
      editItems,
      editReason || 'Admin correction',
      currentUser
    );
    setIsEditing(false);

    if (result.success) {
      addToast({
        type: 'success',
        title: result.requiresApproval ? 'Edit Request Sent' : 'Sale Edited Successfully',
        description: result.requiresApproval
          ? 'Your edit request has been sent for admin approval.'
          : `Receipt #${editingSale.receiptNumber} updated. Stock recalculated.`,
      });
      setEditingSale(null);
      setEditItems([]);
      setEditReason('');
    } else {
      addToast({
        type: 'error',
        title: 'Edit Failed',
        description: result.error || 'Could not edit sale.',
      });
    }
  };

  const handleReviewRequest = (request: SaleEditRequest, action: 'APPROVE' | 'REJECT') => {
    if (!currentUser) return;

    const reviewNote = action === 'REJECT' ? 'Rejected by admin' : undefined;
    const result = SalesService.reviewSaleEdit(request.id, action, currentUser, reviewNote);

    if (result.success) {
      addToast({
        type: 'success',
        title: action === 'APPROVE' ? 'Edit Approved' : 'Edit Rejected',
        description: action === 'APPROVE'
          ? 'Sale edit approved. Stock recalculated.'
          : 'Sale edit request rejected.',
      });
    } else {
      addToast({
        type: 'error',
        title: 'Review Failed',
        description: result.error || 'Could not process review.',
      });
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Print Sales Report
  // ─────────────────────────────────────────────────────────────
  const handlePrint = () => {
    setIsPrinting(true);

    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) {
      addToast({ type: 'error', title: 'Popup Blocked', description: 'Please allow popups to print.' });
      setIsPrinting(false);
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sales Report - ${selectedShopName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: #fff; color: #1e293b; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 3px double #3b82f6; padding-bottom: 15px; }
          .header h1 { font-size: 24px; color: #1e40af; font-weight: bold; }
          .header .company { font-size: 16px; color: #475569; margin-top: 5px; }
          .header .meta { font-size: 12px; color: #64748b; margin-top: 8px; }
          .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; }
          .summary-card { padding: 15px; border-radius: 8px; text-align: center; }
          .summary-card.total { background: #eff6ff; border: 2px solid #3b82f6; }
          .summary-card.profit { background: #f0fdf4; border: 2px solid #22c55e; }
          .summary-card.count { background: #fef3c7; border: 2px solid #f59e0b; }
          .summary-card .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }
          .summary-card .value { font-size: 22px; font-weight: bold; margin-top: 5px; }
          .summary-card.total .value { color: #1e40af; }
          .summary-card.profit .value { color: #16a34a; }
          .summary-card.count .value { color: #d97706; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          thead { background: #1e293b; color: #fff; }
          th { padding: 10px 8px; text-align: left; font-weight: 600; }
          td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
          tr:nth-child(even) { background: #f8fafc; }
          tr:hover { background: #e0f2fe; }
          .status-completed { color: #16a34a; font-weight: bold; }
          .status-voided { color: #dc2626; font-weight: bold; }
          .amount { text-align: right; font-family: 'Courier New', monospace; font-weight: bold; }
          .items-list { max-width: 250px; }
          .item-tag { display: inline-block; background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px; margin: 2px; font-size: 11px; }
          .footer { text-align: center; margin-top: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          .shop-badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${settings.businessName}</h1>
          <div class="company">${settings.tagline || ''}</div>
          <div class="meta">
            <strong>Sales History Report</strong><br>
            Shop: ${selectedShopName} | Period: ${startDate || 'Beginning'} to ${endDate || 'Present'}<br>
            Generated: ${new Date().toLocaleString()}
          </div>
          <div class="shop-badge">🏪 ${selectedShopName}</div>
        </div>

        <div class="summary">
          <div class="summary-card total">
            <div class="label">Total Revenue</div>
            <div class="value">${settings.currencySymbol} ${totalVolume.toLocaleString()}</div>
          </div>
          <div class="summary-card profit">
            <div class="label">Gross Profit</div>
            <div class="value">${settings.currencySymbol} ${totalProfit.toLocaleString()}</div>
          </div>
          <div class="summary-card count">
            <div class="label">Transactions</div>
            <div class="value">${sales.length}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Receipt #</th>
              <th>Date & Time</th>
              <th>Shop</th>
              <th>Seller</th>
              <th>Products Sold</th>
              <th>Payment</th>
              <th>Status</th>
              <th class="amount">Total</th>
              <th class="amount">Profit</th>
            </tr>
          </thead>
          <tbody>
            ${sales.map(sale => `
              <tr>
                <td><strong>${sale.receiptNumber}</strong></td>
                <td>${formatDateTime(sale.createdAt)}</td>
                <td>${sale.shopName || 'N/A'}</td>
                <td>${sale.sellerName}</td>
                <td class="items-list">
                  ${(sale.items || []).map(item =>
                    `<span class="item-tag">${item.quantity}x ${item.productName}</span>`
                  ).join('')}
                </td>
                <td>${sale.paymentMethod}</td>
                <td class="${sale.status === 'COMPLETED' ? 'status-completed' : 'status-voided'}">${sale.status}</td>
                <td class="amount">${settings.currencySymbol} ${sale.total.toLocaleString()}</td>
                <td class="amount">${sale.status === 'COMPLETED' ? `${settings.currencySymbol} ${sale.grossProfit.toLocaleString()}` : `${settings.currencySymbol} 0`}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          ${settings.businessName} - ${settings.address || ''} | Phone: ${settings.phone || 'N/A'}<br>
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
      addToast({
        type: 'info',
        title: 'No Deviations',
        description: 'There are no price deviations in the current filter.',
      });
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
          .filter-summary { font-size: 11px; color: #64748b; text-align: center; margin-bottom: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Price Deviation Audit Report</h1>
          <div class="company">${settings.businessName}</div>
          <div class="meta">
            <strong>Sales where sellers charged above or below reference price</strong><br>
            Shop: ${selectedShopName} | Period: ${startDate || 'Beginning'} to ${endDate || 'Present'}<br>
            Direction: ${deviationDirection === 'ALL' ? 'All deviations' : deviationDirection === 'ABOVE' ? 'Above reference only' : 'Below reference only'}<br>
            Generated: ${new Date().toLocaleString()}
          </div>
          <div class="shop-badge">⚠️ Deviation Report</div>
        </div>

        <div class="summary">
          <div class="card below">
            <div class="label">Items Below Reference</div>
            <div class="value">${deviationStats.belowCount}</div>
          </div>
          <div class="card above">
            <div class="label">Items Above Reference</div>
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

        <div class="filter-summary">
          Showing ${deviations.length} deviation${deviations.length === 1 ? '' : 's'} in the current filter · Net Impact: ${settings.currencySymbol} ${deviationStats.netImpact.toLocaleString()}
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
          This report lists every sale line where the seller's charged price differed from the reference price. Admin sales are included.
        </div>

        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  // ─────────────────────────────────────────────────────────────
  // Export Sales CSV (existing behavior, unchanged)
  // ─────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    let csv = `Sales Report - ${selectedShopName}\n`;
    csv += `Generated: ${new Date().toLocaleString()}\n\n`;
    csv += `Receipt #,Date,Shop,Seller,Products,Payment,Status,Total,Profit\n`;

    sales.forEach(sale => {
      const productsList = (sale.items || []).map(i => `${i.quantity}x ${i.productName}`).join('; ');
      csv += `"${sale.receiptNumber}","${formatDateTime(sale.createdAt)}","${sale.shopName || ''}","${sale.sellerName}","${productsList}","${sale.paymentMethod}","${sale.status}",${sale.total},${sale.status === 'COMPLETED' ? sale.grossProfit : 0}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales_report_${selectedShopName.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ─────────────────────────────────────────────────────────────
  // 🔧 NEW: Export Deviations CSV (separate file)
  // ─────────────────────────────────────────────────────────────
  const handleExportDeviationsCSV = () => {
    if (deviations.length === 0) {
      addToast({
        type: 'info',
        title: 'No Deviations',
        description: 'There are no price deviations in the current filter.',
      });
      return;
    }

    let csv = `Price Deviation Audit - ${selectedShopName}\n`;
    csv += `Generated: ${new Date().toLocaleString()}\n`;
    csv += `Filter: ${deviationDirection}\n\n`;

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
    <div id="admin-sales-view" className="flex-1 p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Sales & Transaction Management</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit store sales, filter by cashier or payment gateway, and manage voiding/cancellations
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-right">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              Completed Revenue
            </span>
            <span className="text-base font-bold text-emerald-400 font-mono">
              {formatCurrency(totalVolume, settings.currencySymbol)}
            </span>
          </div>

          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-right">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              Gross Profit
            </span>
            <span className="text-base font-bold text-blue-400 font-mono">
              {formatCurrency(totalProfit, settings.currencySymbol)}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span>Print Report</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pending Edit Requests Section */}
      {canEditSale && (
        <div className="mb-5 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Pending Edit Requests ({pendingRequests.length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={refreshEditRequests}
                disabled={isRefreshing}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                onClick={() => setShowEditRequests(!showEditRequests)}
                className="text-xs text-slate-400 hover:text-white transition"
              >
                {showEditRequests ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {showEditRequests && pendingRequests.length > 0 && pendingRequests.map(request => (
            <div key={request.id} className="p-3 bg-slate-950 rounded-lg border border-slate-800 mb-2">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-white text-xs">Request from: {request.requestedByName}</span>
                    <span className="text-[10px] text-slate-500">{formatDateTime(request.createdAt)}</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-1">
                    <strong>Reason:</strong> {request.reason}
                  </p>
                  <div className="text-[10px] text-slate-500">
                    <strong>Original Total:</strong> {formatCurrency(request.originalValues.total, settings.currencySymbol)} →{' '}
                    <strong>New Total:</strong> {formatCurrency(request.newValues.total, settings.currencySymbol)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    <strong>Items Changed:</strong>{' '}
                    {request.originalValues.items.length} → {request.newValues.items.length} items
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleReviewRequest(request, 'APPROVE')}
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                    >
                      <Check className="w-3 h-3 inline mr-1" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReviewRequest(request, 'REJECT')}
                      className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition"
                    >
                      <X className="w-3 h-3 inline mr-1" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {showEditRequests && pendingRequests.length === 0 && (
            <div className="p-4 text-center text-slate-500 text-xs">
              No pending edit requests.
            </div>
          )}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 mb-5 space-y-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search receipt, seller, or product..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <select
            value={shopFilter}
            onChange={e => setShopFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">🏪 All Shops</option>
            {shops.map(s => (
              <option key={s.id} value={s.id}>🏪 {s.name}</option>
            ))}
          </select>

          <select
            value={sellerFilter}
            onChange={e => setSellerFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Sellers</option>
            {sellers.map(s => (
              <option key={s.id} value={s.id}>{s.name} (@{s.username})</option>
            ))}
          </select>

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
            <option value="OTHER">Other</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="VOIDED">Voided</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Date:</span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
            />
          </div>

          {(searchQuery || sellerFilter !== 'ALL' || paymentFilter !== 'ALL' || statusFilter !== 'ALL' || shopFilter !== 'ALL' || startDate || endDate) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSellerFilter('ALL');
                setPaymentFilter('ALL');
                setStatusFilter('ALL');
                setShopFilter('ALL');
                setStartDate('');
                setEndDate('');
              }}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────── */}
      {/* 🔧 NEW: Price Deviation Audit Section                    */}
      {/* ──────────────────────────────────────────────────────── */}
      <div className="mb-5 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        {/* Section Header */}
        <div className="p-4 border-b border-slate-800 bg-gradient-to-r from-rose-950/20 via-slate-900 to-slate-900">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
                <TrendingDown className="w-4 h-4 text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Price Deviation Audit</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Sales where sellers charged above or below the reference selling price
                </p>
              </div>
            </div>

            {allDeviations.length > 0 && (
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
            )}
          </div>
        </div>

        {/* Empty state */}
        {allDeviations.length === 0 ? (
          <div className="p-6 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
              <CheckCircle className="w-4 h-4" />
              <span>All sales in the current filter match the reference selling price</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              No price deviations detected for the selected filters.
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/40">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-rose-300 uppercase tracking-wider">Below Reference</span>
                  <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                </div>
                <div className="text-lg font-bold text-rose-300 font-mono">{deviationStats.belowCount}</div>
                <div className="text-[10px] text-rose-400/80 mt-0.5">
                  {deviationStats.belowSalesCount} sale{deviationStats.belowSalesCount === 1 ? '' : 's'}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-emerald-300 uppercase tracking-wider">Above Reference</span>
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-lg font-bold text-emerald-300 font-mono">{deviationStats.aboveCount}</div>
                <div className="text-[10px] text-emerald-400/80 mt-0.5">
                  {deviationStats.aboveSalesCount} sale{deviationStats.aboveSalesCount === 1 ? '' : 's'}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-orange-950/30 border border-orange-800/40">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-orange-300 uppercase tracking-wider">Discount Value</span>
                  <TrendingDown className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <div className="text-lg font-bold text-orange-300 font-mono">
                  {formatCurrency(deviationStats.belowImpact, settings.currencySymbol)}
                </div>
                <div className="text-[10px] text-orange-400/80 mt-0.5">
                  Total value below reference
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-800/40">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-blue-300 uppercase tracking-wider">Extra Gained</span>
                  <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="text-lg font-bold text-blue-300 font-mono">
                  +{formatCurrency(deviationStats.aboveImpact, settings.currencySymbol)}
                </div>
                <div className="text-[10px] text-blue-400/80 mt-0.5">
                  Total value above reference
                </div>
              </div>
            </div>

            {/* Net impact ribbon */}
            <div className={`p-3 rounded-xl border flex items-center justify-between ${
              deviationStats.netImpact >= 0
                ? 'bg-emerald-950/20 border-emerald-800/40'
                : 'bg-rose-950/20 border-rose-800/40'
            }`}>
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Net Impact</span>
              <span className={`text-base font-bold font-mono ${
                deviationStats.netImpact >= 0 ? 'text-emerald-300' : 'text-rose-300'
              }`}>
                {deviationStats.netImpact > 0 ? '+' : ''}
                {formatCurrency(deviationStats.netImpact, settings.currencySymbol)}
              </span>
            </div>

            {/* Direction sub-filter pills */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-semibold">
                <button
                  onClick={() => setDeviationDirection('ALL')}
                  className={`px-3 py-1.5 rounded-md transition ${
                    deviationDirection === 'ALL'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({allDeviations.length})
                </button>
                <button
                  onClick={() => setDeviationDirection('BELOW')}
                  className={`px-3 py-1.5 rounded-md transition ${
                    deviationDirection === 'BELOW'
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-400 hover:text-rose-300'
                  }`}
                >
                  Below ({deviationStats.belowCount})
                </button>
                <button
                  onClick={() => setDeviationDirection('ABOVE')}
                  className={`px-3 py-1.5 rounded-md transition ${
                    deviationDirection === 'ABOVE'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-emerald-300'
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

            {/* Deviations table */}
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
                    <th className="py-2.5 px-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {visibleDeviations.map((d, idx) => {
                    const isBelow = d.direction === 'BELOW';
                    return (
                      <tr
                        key={`${d.saleId}-${d.productId}-${idx}`}
                        className={`transition ${
                          isBelow
                            ? 'bg-rose-950/10 hover:bg-rose-950/20'
                            : 'bg-emerald-950/10 hover:bg-emerald-950/20'
                        }`}
                      >
                        <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap font-mono">
                          {formatDateTime(d.createdAt)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-white">
                          {d.receiptNumber}
                        </td>
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
                          {d.diff > 0 ? '+' : ''}
                          {formatCurrency(d.diff, settings.currencySymbol)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-slate-300">
                          {d.quantity}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-mono font-bold ${
                          isBelow ? 'text-rose-400' : 'text-emerald-400'
                        }`}>
                          {d.totalImpact > 0 ? '+' : ''}
                          {formatCurrency(d.totalImpact, settings.currencySymbol)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => {
                              const sale = sales.find(s => s.id === d.saleId);
                              if (sale) showReceipt(sale);
                            }}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-medium transition"
                          >
                            <Eye className="w-3 h-3 inline mr-1" />
                            Receipt
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
      </div>

      {/* Sales Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                <th className="py-3 px-4 font-semibold">Receipt #</th>
                <th className="py-3 px-4 font-semibold">Date & Time</th>
                <th className="py-3 px-4 font-semibold">Shop</th>
                <th className="py-3 px-4 font-semibold">Seller</th>
                <th className="py-3 px-4 font-semibold">Products Sold</th>
                <th className="py-3 px-4 font-semibold">Payment</th>
                <th className="py-3 px-4 text-right font-semibold">Total</th>
                <th className="py-3 px-4 text-right font-semibold">Profit</th>
                <th className="py-3 px-4 text-center font-semibold">Status</th>
                <th className="py-3 px-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-500">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>No sales found.</p>
                  </td>
                </tr>
              ) : (
                sales.map(sale => {
                  const isVoided = sale.status === 'VOIDED';

                  return (
                    <tr key={sale.id} className={`hover:bg-slate-850/60 transition ${isVoided ? 'opacity-65' : ''}`}>
                      <td className="py-3 px-4 font-mono font-bold text-white">{sale.receiptNumber}</td>
                      <td className="py-3 px-4 text-slate-400">{formatDateTime(sale.createdAt)}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-blue-950/70 text-blue-300 border border-blue-800/50 text-[10px] font-semibold">
                          🏪 {sale.shopName || 'N/A'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-medium">{sale.sellerName}</td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {(sale.items || []).map((item, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/60 text-[11px] text-slate-200"
                            >
                              <span className="font-bold text-blue-400">{item.quantity}x</span>
                              <span className="truncate max-w-[120px]">{item.productName}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] uppercase font-medium">
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-white">
                        {formatCurrency(sale.total, settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                        {isVoided ? formatCurrency(0, settings.currencySymbol) : `+${formatCurrency(sale.grossProfit, settings.currencySymbol)}`}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            !isVoided
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {sale.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <button
                          onClick={() => showReceipt(sale)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition"
                        >
                          Receipt
                        </button>
                        {!isVoided && (
                          <>
                            {canEditSale && (
                              <button
                                onClick={() => openEditSale(sale)}
                                className="px-2 py-1 rounded bg-blue-500/15 hover:bg-blue-600 hover:text-white text-blue-300 text-[11px] font-semibold border border-blue-500/30 transition"
                              >
                                <Pencil className="w-3 h-3 inline mr-0.5" />
                                Edit
                              </button>
                            )}
                            {canVoidSale && (
                              <button
                                onClick={() => {
                                  setVoidingSale(sale);
                                  setVoidReason('');
                                }}
                                className="px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-600 hover:text-white text-rose-300 text-[11px] font-semibold border border-rose-500/30 transition"
                              >
                                Void
                              </button>
                            )}
                          </>
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

      {/* Edit Sale Modal */}
      {editingSale && canEditSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2 text-blue-400">
                <Pencil className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Edit Sale {editingSale.receiptNumber}</h3>
              </div>
              <button onClick={() => setEditingSale(null)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-xs mb-4">
              <strong>Stock Recalculation:</strong> Editing this sale will reverse the original stock movements and apply the new quantities automatically.
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Reason for Edit (Optional)</label>
                <input
                  type="text"
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                  placeholder="Optional - e.g. Quantity recorded incorrectly"
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
                        <label className="text-[10px] text-slate-400 block">Qty</label>
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
                        <label className="text-[10px] text-slate-400 block">Price</label>
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
                              discount: val === '' ? '' as any : parseFloat(val) || 0
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
                onClick={handleSaveEdit}
                disabled={isEditing}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold"
              >
                {isEditing ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Modal */}
      {voidingSale && canVoidSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2 text-rose-400">
                <Ban className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Void Sale {voidingSale.receiptNumber}</h3>
              </div>
              <button onClick={() => setVoidingSale(null)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-xs mb-4 flex items-start gap-2">
              <RotateCcw className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong>Auto Stock Restore:</strong> Voiding this transaction will return{' '}
                <strong>{voidingSale.items.reduce((s, i) => s + i.quantity, 0)} item(s)</strong> to inventory.
              </div>
            </div>

            <div className="space-y-3 text-xs mb-5">
              <label className="block text-slate-300 font-semibold mb-1">Reason for Void *</label>
              <textarea
                required
                rows={3}
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                placeholder="e.g. Customer returned items..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button onClick={() => setVoidingSale(null)} className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs">Cancel</button>
              <button onClick={handleExecuteVoid} disabled={isVoiding} className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-bold">
                {isVoiding ? 'Processing...' : 'Confirm Void & Restore Stock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
