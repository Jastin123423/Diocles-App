import { db } from '../db/storage';
import { Expense, ExpenseCategory, PaymentMethod, User } from '../types';
import { generateUUID } from '../utils/crypto';

export class ExpenseService {
  /**
   * Record operational expense (Shop-specific or General Company).
   * Admin only. Sellers must never access.
   */
  public static recordExpense(
    params: {
      shopId?: string | null;
      isCompanyExpense?: boolean;
      category: ExpenseCategory | string;
      description?: string;
      title?: string;
      amount: number;
      paymentMethod: PaymentMethod;
      date?: string;
      reference?: string;
      notes?: string;
    },
    currentUser: User
  ): { success: boolean; expense?: Expense; error?: string } {
    if (currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Permission Denied: Only Admin can record expenses.' };
    }

    const desc = params.title || params.description;
    if (!desc?.trim()) {
      return { success: false, error: 'Description is required.' };
    }

    if (params.amount <= 0) {
      return { success: false, error: 'Amount must be greater than zero.' };
    }

    let shopName: string | undefined = undefined;
    let finalShopId: string | null = null;
    const isCompany = params.isCompanyExpense || !params.shopId || params.shopId === 'GENERAL';

    if (!isCompany && params.shopId) {
      const shop = db.getShops().find(s => s.id === params.shopId);
      if (!shop) {
        return { success: false, error: 'Selected shop does not exist.' };
      }
      shopName = shop.name;
      finalShopId = shop.id;
    } else {
      shopName = 'General Company';
      finalShopId = null;
    }

    const newExpense: Expense = {
      id: generateUUID(),
      shopId: finalShopId,
      shopName,
      isCompanyExpense: isCompany,
      category: params.category || 'OTHER',
      description: desc.trim(),
      title: desc.trim(),
      amount: Number(params.amount.toFixed(2)),
      paymentMethod: params.paymentMethod || 'CASH',
      date: params.date || new Date().toISOString().slice(0, 10),
      reference: params.reference?.trim(),
      notes: params.notes?.trim(),
      createdByUserId: currentUser.id,
      createdByName: currentUser.name,
      createdAt: new Date().toISOString(),
    };

    db.saveExpenses([newExpense, ...db.getExpenses()]);

    db.enqueueSync({
      id: generateUUID(),
      operation: 'CREATE_EXPENSE',
      entityType: 'EXPENSE',
      entityId: newExpense.id,
      payload: newExpense,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });

    db.addAuditLog({
      id: generateUUID(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'CREATE_EXPENSE',
      details: `Recorded ${newExpense.category} expense: $${newExpense.amount.toFixed(2)} (${newExpense.description}) [${shopName}]`,
      entityType: 'EXPENSE',
      entityId: newExpense.id,
      timestamp: new Date().toISOString(),
    });

    return { success: true, expense: newExpense };
  }

  public static createExpense(
    params: {
      shopId?: string | null;
      isCompanyExpense?: boolean;
      category: ExpenseCategory | string;
      title: string;
      amount: number;
      paymentMethod: PaymentMethod;
      reference?: string;
      notes?: string;
    },
    currentUser: User
  ) {
    return ExpenseService.recordExpense(params, currentUser);
  }

  public static getExpenses(
    filter?: {
      shopId?: string;
      category?: ExpenseCategory | string;
      search?: string;
      startDate?: string;
      endDate?: string;
    },
    currentUser?: User
  ): Expense[] {
    if (currentUser && currentUser.role !== 'ADMIN') {
      return []; // Shield expenses from sellers
    }

    let list = db.getExpenses();

    if (filter?.shopId && filter.shopId !== 'ALL') {
      if (filter.shopId === 'GENERAL') {
        list = list.filter(e => e.isCompanyExpense || !e.shopId);
      } else {
        list = list.filter(e => e.shopId === filter.shopId);
      }
    }

    if (filter?.category && filter.category !== 'ALL') {
      list = list.filter(e => e.category === filter.category);
    }

    if (filter?.search?.trim()) {
      const q = filter.search.trim().toLowerCase();
      list = list.filter(
        e =>
          (e.description && e.description.toLowerCase().includes(q)) ||
          (e.title && e.title.toLowerCase().includes(q)) ||
          (e.reference && e.reference.toLowerCase().includes(q)) ||
          (e.notes && e.notes.toLowerCase().includes(q)) ||
          (e.shopName && e.shopName.toLowerCase().includes(q))
      );
    }

    if (filter?.startDate) {
      list = list.filter(e => e.date >= filter.startDate!);
    }

    if (filter?.endDate) {
      list = list.filter(e => e.date <= filter.endDate!);
    }

    return list;
  }
}
