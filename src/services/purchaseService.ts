import { db } from '../db/storage';
import { Purchase, PurchaseItem, PaymentStatus, User } from '../types';
import { generateUUID } from '../utils/crypto';
import { generatePurchaseNumber } from '../utils/formatters';

export interface PurchaseItemInput {
  productId: string;
  quantity: number;
  unitCost: number;
}

export class PurchaseService {
  /**
   * Record a new purchase order / stock-in for a specific shop.
   * Uses Moving Average Cost for inventory valuation.
   */
  public static recordPurchase(
    params: {
      shopId?: string;
      supplierName: string;
      date?: string;
      items: PurchaseItemInput[];
      paymentStatus: PaymentStatus;
      notes?: string;
      invoiceNumber?: string;
    },
    currentUser: User
  ): { success: boolean; purchase?: Purchase; error?: string } {
    const targetShopId = params.shopId || db.getShops()[0]?.id || 'shop-1';
    
    // Check role and shop assignment permissions
    if (currentUser.role === 'SELLER') {
      const assigned = currentUser.assignedShopIds || [];
      if (assigned.length > 0 && !assigned.includes(targetShopId)) {
        return { success: false, error: 'Permission Denied: You are not assigned to record purchases for this shop.' };
      }
    }
    const shop = db.getShops().find(s => s.id === targetShopId);
    if (!shop) {
      return { success: false, error: 'Selected shop does not exist.' };
    }

    if (!params.items || params.items.length === 0) {
      return { success: false, error: 'Please add at least one product item.' };
    }

    const products = [...db.getProducts()];
    const purchaseId = generateUUID();
    const purchaseNumber = generatePurchaseNumber();
    const purchaseItems: PurchaseItem[] = [];
    let totalAmount = 0;

    for (const itemInput of params.items) {
      const prodIndex = products.findIndex(p => p.id === itemInput.productId);
      
      if (prodIndex === -1) {
        return { success: false, error: `Product not found (ID: ${itemInput.productId})` };
      }

      const prod = products[prodIndex];

      if (itemInput.quantity <= 0) {
        return { success: false, error: `Invalid quantity for ${prod.name}. Must be greater than 0.` };
      }

      if (itemInput.unitCost < 0) {
        return { success: false, error: `Unit cost for ${prod.name} cannot be negative.` };
      }

      const itemTotal = itemInput.quantity * itemInput.unitCost;
      totalAmount += itemTotal;

      purchaseItems.push({
        id: generateUUID(),
        productId: prod.id,
        productName: prod.name,
        quantity: itemInput.quantity,
        unitCost: itemInput.unitCost,
        total: itemTotal,
      });

      // MOVING AVERAGE COST CALCULATION
      const currentStock = prod.currentStock || 0;
      const currentPrice = prod.purchasePrice || 0;
      const currentTotalCost = currentStock * currentPrice;
      const newTotalCost = itemInput.quantity * itemInput.unitCost;
      const newTotalStock = currentStock + itemInput.quantity;
      
      // Calculate weighted average cost
      const newAveragePrice = newTotalStock > 0 
        ? (currentTotalCost + newTotalCost) / newTotalStock 
        : itemInput.unitCost;

      const prevStock = currentStock;
      const newStock = newTotalStock;

      // Update product with new stock and AVERAGE cost (not latest cost)
      products[prodIndex] = {
        ...prod,
        currentStock: newStock,
        purchasePrice: Number(newAveragePrice.toFixed(2)),
        updatedAt: new Date().toISOString(),
      };

      // Record inventory movement with ACTUAL purchase price
      const movement = {
        id: generateUUID(),
        shopId: targetShopId,
        shopName: shop.name,
        productId: prod.id,
        productName: prod.name,
        previousQty: prevStock,
        changeQty: itemInput.quantity,
        newQty: newStock,
        type: 'PURCHASE' as const,
        reason: `PO ${purchaseNumber} from ${params.supplierName?.trim() || 'Walk-in Supplier'} [${shop.name}] @ ${itemInput.unitCost}/unit (Avg: ${newAveragePrice.toFixed(2)})`,
        costValue: itemTotal,
        userId: currentUser.id,
        userName: currentUser.name,
        createdAt: new Date().toISOString(),
      };
      db.saveMovements([movement, ...db.getMovements()]);
    }

    // Save updated products with new average costs
    db.saveProducts(products);

    const finalSupplierName = params.supplierName?.trim() || 'Walk-in Supplier';

    const newPurchase: Purchase = {
      id: purchaseId,
      shopId: targetShopId,
      shopName: shop.name,
      purchaseNumber,
      supplierName: finalSupplierName,
      date: params.date || new Date().toISOString().slice(0, 10),
      items: purchaseItems,
      totalAmount,
      paymentStatus: params.paymentStatus,
      notes: params.notes?.trim() || undefined,
      invoiceNumber: params.invoiceNumber?.trim() || undefined,
      createdByUserId: currentUser.id,
      createdByName: currentUser.name,
      createdAt: new Date().toISOString(),
    };

    db.savePurchases([newPurchase, ...db.getPurchases()]);

    db.enqueueSync({
      id: generateUUID(),
      operation: 'CREATE_PURCHASE',
      entityType: 'PURCHASE',
      entityId: purchaseId,
      payload: newPurchase,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });

    db.addAuditLog({
      id: generateUUID(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'RECORD_PURCHASE',
      details: `Recorded purchase ${purchaseNumber} from ${finalSupplierName} for [${shop.name}]`,
      entityType: 'PURCHASE',
      entityId: purchaseId,
      timestamp: new Date().toISOString(),
    });

    return { success: true, purchase: newPurchase };
  }

  public static createPurchase(
    params: {
      shopId?: string;
      supplierName: string;
      date?: string;
      items: PurchaseItemInput[];
      paymentStatus: PaymentStatus;
      notes?: string;
      invoiceNumber?: string;
    },
    currentUser: User
  ) {
    return this.recordPurchase(params, currentUser);
  }

  /**
   * Get purchases filtered by shop, supplier, date.
   */
  public static getPurchases(
    options?: {
      shopId?: string;
      supplierName?: string;
      search?: string;
      paymentStatus?: PaymentStatus | 'ALL';
      startDate?: string;
      endDate?: string;
    },
    _currentUser?: User
  ): Purchase[] {
    let purchases = db.getPurchases();

    if (options?.shopId && options.shopId !== 'ALL') {
      purchases = purchases.filter(p => p.shopId === options.shopId);
    }

    if (options?.search?.trim()) {
      const q = options.search.trim().toLowerCase();
      purchases = purchases.filter(
        p =>
          p.supplierName.toLowerCase().includes(q) ||
          p.purchaseNumber.toLowerCase().includes(q) ||
          (p.invoiceNumber && p.invoiceNumber.toLowerCase().includes(q)) ||
          (p.shopName && p.shopName.toLowerCase().includes(q))
      );
    }

    if (options?.supplierName) {
      const q = options.supplierName.toLowerCase();
      purchases = purchases.filter(p => p.supplierName.toLowerCase().includes(q));
    }

    if (options?.paymentStatus && options.paymentStatus !== 'ALL') {
      purchases = purchases.filter(p => p.paymentStatus === options.paymentStatus);
    }

    if (options?.startDate) {
      purchases = purchases.filter(p => p.date >= options.startDate!);
    }

    if (options?.endDate) {
      purchases = purchases.filter(p => p.date <= options.endDate!);
    }

    return purchases;
  }
}
