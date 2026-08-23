import { db } from '../db/storage';
import { Sale, SaleItem, PaymentMethod, User } from '../types';
import { generateUUID } from '../utils/crypto';
import { generateReceiptNumber } from '../utils/formatters';
import { NotificationService } from './notificationService';

export interface CartItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
}

export class SalesService {
  /**
   * Complete a new sale transaction for a specific shop.
   * Can be executed by Seller or Admin.
   * Decrements product inventory in that shop, creates inventory movements, creates receipt, logs audit.
   */
  public static createSale(
    params: {
      shopId: string;
      items: CartItemInput[];
      paymentMethod: PaymentMethod;
      discount?: number;
      amountReceived: number;
      notes?: string;
    },
    currentUser: User
  ): { success: boolean; sale?: Sale; error?: string } {
    if (!params.shopId) {
      return { success: false, error: 'Shop identification is required to process sale.' };
    }

    const shop = db.getShops().find(s => s.id === params.shopId);
    if (!shop) {
      return { success: false, error: 'Selected shop does not exist.' };
    }

    if (shop.status !== 'ACTIVE') {
      return { success: false, error: `Shop "${shop.name}" is currently inactive. Sales cannot be recorded.` };
    }

    if (!params.items || params.items.length === 0) {
      return { success: false, error: 'Cart is empty. Please add items to complete sale.' };
    }

    const products = db.getProducts();
    const settings = db.getSettings();

    // Validate inventory and prepare sale items
    const saleItems: SaleItem[] = [];
    let subtotal = 0;
    let totalCostOfGoods = 0;

    for (const itemInput of params.items) {
      const product = products.find(p => p.id === itemInput.productId && p.shopId === params.shopId);
      if (!product) {
        return { success: false, error: `Product not found in ${shop.name} (ID: ${itemInput.productId})` };
      }

      if (product.status !== 'ACTIVE') {
        return { success: false, error: `Product '${product.name}' is inactive and cannot be sold.` };
      }

      if (product.currentStock < itemInput.quantity) {
        return {
          success: false,
          error: `Insufficient stock in ${shop.name} for '${product.name}'. Available: ${product.currentStock} ${product.unit}, Requested: ${itemInput.quantity}`,
        };
      }

      const itemTotal = itemInput.quantity * itemInput.unitPrice - (itemInput.discount || 0);
      subtotal += itemTotal;
      totalCostOfGoods += itemInput.quantity * product.purchasePrice;

      saleItems.push({
        id: generateUUID(),
        saleId: '', // populated below
        shopId: params.shopId,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unitPrice: itemInput.unitPrice,
        purchasePrice: product.purchasePrice,
        quantity: itemInput.quantity,
        discount: itemInput.discount || 0,
        total: Math.max(0, itemTotal),
      });
    }

    const overallDiscount = params.discount || 0;
    const discountedSubtotal = Math.max(0, subtotal - overallDiscount);
    // Tax completely removed per requirement
    const taxAmount = 0;
    const finalTotal = Number(discountedSubtotal.toFixed(2));

    if (params.amountReceived < finalTotal && params.paymentMethod === 'CASH') {
      return {
        success: false,
        error: `Tendered amount (${settings.currencySymbol}${params.amountReceived.toFixed(2)}) is less than total balance (${settings.currencySymbol}${finalTotal.toFixed(2)})`,
      };
    }

    const change = params.paymentMethod === 'CASH' ? Math.max(0, params.amountReceived - finalTotal) : 0;
    const grossProfit = Number((finalTotal - totalCostOfGoods).toFixed(2));

    const saleId = generateUUID();
    const receiptNumber = generateReceiptNumber();

    // Attach saleId to each item
    saleItems.forEach(item => {
      item.saleId = saleId;
    });

    const newSale: Sale = {
      id: saleId,
      receiptNumber,
      shopId: params.shopId,
      shopName: shop.name,
      sellerId: currentUser.id,
      sellerName: currentUser.name,
      subtotal: Number(subtotal.toFixed(2)),
      discount: Number(overallDiscount.toFixed(2)),
      tax: taxAmount,
      total: finalTotal,
      costOfGoods: Number(totalCostOfGoods.toFixed(2)),
      grossProfit,
      paymentMethod: params.paymentMethod,
      amountReceived: Number(params.amountReceived.toFixed(2)),
      change: Number(change.toFixed(2)),
      status: 'COMPLETED',
      notes: params.notes?.trim(),
      createdAt: new Date().toISOString(),
      items: saleItems,
    };

    // 1. Decrement product stock in local database for that shop
    const updatedProducts = products.map(prod => {
      const soldItem = saleItems.find(si => si.productId === prod.id && prod.shopId === params.shopId);
      if (soldItem) {
        return {
          ...prod,
          currentStock: prod.currentStock - soldItem.quantity,
          updatedAt: new Date().toISOString(),
        };
      }
      return prod;
    });
    db.saveProducts(updatedProducts);

    // 2. Record inventory movement for each item with shopId
    const newMovements = saleItems.map(item => {
      const prod = products.find(p => p.id === item.productId)!;
      return {
        id: generateUUID(),
        shopId: params.shopId,
        shopName: shop.name,
        productId: item.productId,
        productName: item.productName,
        previousQty: prod.currentStock,
        changeQty: -item.quantity,
        newQty: prod.currentStock - item.quantity,
        type: 'SALE' as const,
        reason: `Sale ${receiptNumber} (${currentUser.name}) [${shop.name}]`,
        referenceId: saleId,
        userId: currentUser.id,
        userName: currentUser.name,
        createdAt: new Date().toISOString(),
      };
    });
    db.saveMovements([...newMovements, ...db.getMovements()]);

    // 3. Save new sale
    db.saveSales([newSale, ...db.getSales()]);

    // 4. Record to sync queue
    db.enqueueSync({
      id: generateUUID(),
      operation: 'CREATE_SALE',
      entityType: 'SALE',
      entityId: saleId,
      payload: newSale,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });

    // 5. Audit Log & Loss Notifications
    db.addAuditLog({
      id: generateUUID(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'CREATE_SALE',
      details: `Completed sale ${receiptNumber} in [${shop.name}] for ${settings.currencySymbol}${finalTotal.toFixed(2)} (${params.paymentMethod})`,
      entityType: 'SALE',
      entityId: saleId,
      timestamp: new Date().toISOString(),
    });

    // Check for items sold below purchase price
    saleItems.forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      if (prod && prod.purchasePrice > 0 && item.unitPrice < prod.purchasePrice) {
        NotificationService.notifyBelowCostSale(prod, item.unitPrice, currentUser, shop.name, receiptNumber);
      }
    });

    return { success: true, sale: newSale };
  }

  /**
   * Void/Cancel a sale transaction.
   * Admin only.
   * Restores product stock, creates inventory movement (VOID_RETURN), updates sale status.
   */
  public static voidSale(
    saleId: string,
    voidReason: string,
    currentUser: User
  ): { success: boolean; error?: string } {
    if (currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Permission Denied: Only Admin can void a sale.' };
    }

    if (!voidReason?.trim()) {
      return { success: false, error: 'A cancellation reason is required to void a sale.' };
    }

    const sales = db.getSales();
    const targetSale = sales.find(s => s.id === saleId);
    if (!targetSale) {
      return { success: false, error: 'Sale record not found.' };
    }

    if (targetSale.status === 'VOIDED') {
      return { success: false, error: 'Sale has already been voided.' };
    }

    // 1. Restore product stock in the correct shop
    const products = db.getProducts();
    const returnMovements = [];

    for (const item of targetSale.items) {
      const prodIndex = products.findIndex(p => p.id === item.productId && p.shopId === targetSale.shopId);
      if (prodIndex !== -1) {
        const prod = products[prodIndex];
        const prevQty = prod.currentStock;
        const newQty = prevQty + item.quantity;

        products[prodIndex] = {
          ...prod,
          currentStock: newQty,
          updatedAt: new Date().toISOString(),
        };

        returnMovements.push({
          id: generateUUID(),
          shopId: targetSale.shopId,
          shopName: targetSale.shopName,
          productId: prod.id,
          productName: prod.name,
          previousQty: prevQty,
          changeQty: item.quantity,
          newQty,
          type: 'VOID_RETURN' as const,
          reason: `Restocked from voided sale ${targetSale.receiptNumber}: ${voidReason.trim()}`,
          referenceId: saleId,
          userId: currentUser.id,
          userName: currentUser.name,
          createdAt: new Date().toISOString(),
        });
      }
    }

    db.saveProducts(products);
    db.saveMovements([...returnMovements, ...db.getMovements()]);

    // 2. Mark sale as voided
    targetSale.status = 'VOIDED';
    targetSale.voidReason = voidReason.trim();
    targetSale.voidedAt = new Date().toISOString();
    targetSale.voidedBy = currentUser.name;
    db.saveSales(sales);

    // 3. Sync Queue
    db.enqueueSync({
      id: generateUUID(),
      operation: 'VOID_SALE',
      entityType: 'SALE',
      entityId: saleId,
      payload: { saleId, voidReason, voidedBy: currentUser.name },
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });

    // 4. Audit Log
    db.addAuditLog({
      id: generateUUID(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'VOID_SALE',
      details: `Voided sale ${targetSale.receiptNumber} (${voidReason.trim()}) in [${targetSale.shopName || 'Shop'}]. Restored inventory.`,
      entityType: 'SALE',
      entityId: saleId,
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  }

  /**
   * Query sales.
   * Sellers only see their own sales. Admin can see all sales or filter by shop.
   */
  public static getSales(
    options: {
      shopId?: string;
      sellerId?: string;
      search?: string;
      paymentMethod?: PaymentMethod | 'ALL';
      status?: 'ALL' | 'COMPLETED' | 'VOIDED';
      startDate?: string;
      endDate?: string;
    },
    currentUser: User
  ): Sale[] {
    let sales = db.getSales();

    // Security Rule: Sellers strictly only see their own sales
    if (currentUser.role === 'SELLER') {
      sales = sales.filter(s => s.sellerId === currentUser.id);
    } else if (options.sellerId && options.sellerId !== 'ALL') {
      sales = sales.filter(s => s.sellerId === options.sellerId);
    }

    if (options.shopId && options.shopId !== 'ALL') {
      sales = sales.filter(s => s.shopId === options.shopId);
    }

    if (options.status && options.status !== 'ALL') {
      sales = sales.filter(s => s.status === options.status);
    }

    if (options.paymentMethod && options.paymentMethod !== 'ALL') {
      sales = sales.filter(s => s.paymentMethod === options.paymentMethod);
    }

    if (options.search) {
      const q = options.search.toLowerCase().trim();
      sales = sales.filter(
        s =>
          s.receiptNumber.toLowerCase().includes(q) ||
          s.sellerName.toLowerCase().includes(q) ||
          (s.shopName && s.shopName.toLowerCase().includes(q)) ||
          s.items.some(i => i.productName.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
      );
    }

    if (options.startDate) {
      const start = new Date(options.startDate).getTime();
      sales = sales.filter(s => new Date(s.createdAt).getTime() >= start);
    }

    if (options.endDate) {
      const end = new Date(options.endDate).getTime() + 86400000; // End of day
      sales = sales.filter(s => new Date(s.createdAt).getTime() <= end);
    }

    return sales;
  }

  public static getSaleByReceipt(receiptNumber: string, currentUser: User): Sale | undefined {
    const sale = db.getSales().find(s => s.receiptNumber.toLowerCase() === receiptNumber.toLowerCase());
    if (!sale) return undefined;

    // Permissions check
    if (currentUser.role === 'SELLER' && sale.sellerId !== currentUser.id) {
      return undefined;
    }
    return sale;
  }
}
