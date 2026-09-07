import { db } from '../db/storage';
import { Sale, SaleItem, PaymentMethod, User, SaleEditRequest } from '../types';
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
    // ... (createSale remains the same)
  }

  /**
   * Void/Cancel a sale transaction.
   */
  public static voidSale(
    saleId: string,
    voidReason: string,
    currentUser: User
  ): { success: boolean; error?: string } {
    // ... (voidSale remains the same)
  }

  /**
   * Seller or Admin requests a sale edit
   */
  public static requestSaleEdit(
    saleId: string,
    newItems: CartItemInput[],
    reason: string,
    currentUser: User
  ): { success: boolean; error?: string; requiresApproval?: boolean } {
    // ... (requestSaleEdit remains the same)
  }

  /**
   * Apply sale edit (used by admin)
   */
  private static applySaleEdit(
    sale: Sale,
    newValues: {
      items: SaleItem[];
      subtotal: number;
      total: number;
      costOfGoods: number;
      grossProfit: number;
      amountReceived: number;
      change: number;
    },
    currentUser: User,
    reason?: string
  ): { success: boolean; error?: string } {
    // ... (applySaleEdit remains the same)
  }

  /**
   * Approve or reject a sale edit request (admin only)
   * FIX: Update request status FIRST, then apply sale edit
   */
  public static reviewSaleEdit(
    requestId: string,
    action: 'APPROVE' | 'REJECT',
    currentUser: User,
    reviewNote?: string
  ): { success: boolean; error?: string } {
    if (currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Only admin can review sale edits.' };
    }

    const requests = db.getSaleEditRequests?.() || [];
    const request = requests.find(r => r.id === requestId);

    if (!request) {
      return { success: false, error: 'Edit request not found.' };
    }

    if (request.status !== 'PENDING') {
      return { success: false, error: 'Request already reviewed.' };
    }

    // FIX: Update request status FIRST (before applying sale edit)
    const updatedRequests = requests.map(r =>
      r.id === requestId
        ? {
            ...r,
            status: action === 'APPROVE' ? 'APPROVED' as const : 'REJECTED' as const,
            reviewedByUserId: currentUser.id,
            reviewedByName: currentUser.name,
            reviewNote,
            reviewedAt: new Date().toISOString(),
          }
        : r
    );
    db.saveSaleEditRequests?.(updatedRequests);

    // FIX: Enqueue REVIEW_SALE_EDIT_REQUEST FIRST (before UPDATE_SALE)
    const updatedRequest = updatedRequests.find(r => r.id === requestId);
    db.enqueueSync({
      id: generateUUID(),
      operation: 'REVIEW_SALE_EDIT_REQUEST',
      entityType: 'SALE_EDIT_REQUEST',
      entityId: requestId,
      payload: {
        ...updatedRequest,
        id: requestId, // Ensure ID is explicit
      },
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });

    // THEN apply the sale edit if approved
    if (action === 'APPROVE') {
      const sales = db.getSales();
      const sale = sales.find(s => s.id === request.saleId);
      if (!sale) {
        return { success: false, error: 'Sale not found.' };
      }

      const result = this.applySaleEdit(sale, request.newValues, currentUser, request.reason);
      if (!result.success) {
        return result;
      }
    }

    // Notify seller
    NotificationService.notifySaleEditReviewed(request, action, currentUser.name, reviewNote);

    return { success: true };
  }

  /**
   * Get sale edit requests
   */
  public static getSaleEditRequests(currentUser: User): SaleEditRequest[] {
    const requests = db.getSaleEditRequests?.() || [];
    
    if (currentUser.role === 'ADMIN') {
      return requests;
    }
    
    // Sellers only see their own requests
    return requests.filter(r => r.requestedByUserId === currentUser.id);
  }

  /**
   * Query sales.
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
    // ... (getSales remains the same)
  }

  public static getSaleByReceipt(receiptNumber: string, currentUser: User): Sale | undefined {
    // ... (getSaleByReceipt remains the same)
  }
}
