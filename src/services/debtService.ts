import { db } from '../db/storage';
import { DebtRecord, DebtSummary, DebtType, DebtStatus, User } from '../types';

export class DebtService {
  /**
   * Helper to normalize a date string (YYYY-MM-DD) to compare with today
   */
  private static getTodayStr(): string {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  /**
   * Calculate effective status of a debt based on current local date
   * Paid, Cancelled, and Archived states are preserved.
   */
  public static calculateStatus(debt: DebtRecord, todayStr: string = this.getTodayStr()): DebtStatus {
    if (debt.status === 'PAID') return 'PAID';
    if (debt.status === 'CANCELLED') return 'CANCELLED';
    if (debt.status === 'ARCHIVED') return 'ARCHIVED';

    if (!debt.dueDate) {
      return 'PENDING';
    }

    const due = debt.dueDate.slice(0, 10);
    if (due < todayStr) {
      return 'OVERDUE';
    } else if (due === todayStr) {
      return 'DUE_TODAY';
    } else {
      return 'PENDING';
    }
  }

  /**
   * Calculate overdue days from due date to today
   */
  public static getOverdueDays(dueDate?: string, todayStr: string = this.getTodayStr()): number {
    if (!dueDate) return 0;
    const due = new Date(dueDate.slice(0, 10)).getTime();
    const today = new Date(todayStr).getTime();
    if (today <= due) return 0;
    const diffMs = today - due;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Get all debts with dynamically computed current statuses
   */
  public static getAllDebts(): DebtRecord[] {
    const rawDebts = db.getDebts();
    const todayStr = this.getTodayStr();

    return rawDebts.map(d => {
      const computedStatus = this.calculateStatus(d, todayStr);
      if (computedStatus !== d.status && d.status !== 'PAID' && d.status !== 'CANCELLED' && d.status !== 'ARCHIVED') {
        return { ...d, status: computedStatus };
      }
      return d;
    });
  }

  /**
   * Get Debt Dashboard Summary Metrics (Tunadai & Wanatudai)
   * Strictly independent from main accounting/sales/products.
   */
  public static getSummary(): DebtSummary {
    const debts = this.getAllDebts();

    const summary: DebtSummary = {
      weDemand: {
        totalOutstanding: 0,
        dueTodayCount: 0,
        dueTodayAmount: 0,
        overdueCount: 0,
        overdueAmount: 0,
        paidCount: 0,
        paidAmount: 0,
        totalCount: 0,
      },
      theyDemand: {
        totalOutstanding: 0,
        dueTodayCount: 0,
        dueTodayAmount: 0,
        overdueCount: 0,
        overdueAmount: 0,
        paidCount: 0,
        paidAmount: 0,
        totalCount: 0,
      },
    };

    debts.forEach(d => {
      const target = d.type === 'WE_DEMAND' ? summary.weDemand : summary.theyDemand;
      target.totalCount += 1;

      if (d.status === 'PAID') {
        target.paidCount += 1;
        target.paidAmount += d.amount;
      } else if (d.status !== 'CANCELLED' && d.status !== 'ARCHIVED') {
        target.totalOutstanding += d.amount;

        if (d.status === 'DUE_TODAY') {
          target.dueTodayCount += 1;
          target.dueTodayAmount += d.amount;
        } else if (d.status === 'OVERDUE') {
          target.overdueCount += 1;
          target.overdueAmount += d.amount;
        }
      }
    });

    return summary;
  }

  /**
   * Create a new independent debt record
   */
  public static createDebt(
    input: {
      type: DebtType;
      debtorName: string;
      productDescription?: string;
      amount: number;
      dueDate?: string;
      contact?: string;
      notes?: string;
      shopId?: string;
    },
    user: User
  ): DebtRecord {
    const id = `debt-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    const initialStatus = input.dueDate
      ? this.calculateStatus({
          id,
          type: input.type,
          debtorName: input.debtorName.trim(),
          amount: Number(input.amount),
          dueDate: input.dueDate,
          status: 'PENDING',
          createdByUserId: user.id,
          createdByName: user.name,
          createdAt: now,
          updatedAt: now,
        })
      : 'PENDING';

    const record: DebtRecord = {
      id,
      type: input.type,
      debtorName: input.debtorName.trim(),
      productDescription: (input.productDescription || '').trim(),
      amount: Math.max(0, Number(input.amount)),
      dueDate: input.dueDate || undefined,
      contact: (input.contact || '').trim() || undefined,
      notes: (input.notes || '').trim() || undefined,
      status: initialStatus,
      createdByUserId: user.id,
      createdByName: user.name,
      shopId: input.shopId || undefined,
      createdAt: now,
      updatedAt: now,
    };

    db.addDebt(record);
    return record;
  }

  /**
   * Mark a debt as Paid
   * Strictly updates the debt record, saves payment metadata and history.
   * Does NOT alter sales, purchases, stock, expenses, or profit.
   */
  public static markAsPaid(
    debtId: string,
    user: User,
    paymentNotes?: string,
    paymentDate: string = new Date().toISOString()
  ): boolean {
    const rawDebts = db.getDebts();
    const existing = rawDebts.find(d => d.id === debtId);
    if (!existing) return false;

    db.updateDebt(debtId, {
      status: 'PAID',
      paidAt: paymentDate,
      paidByUserId: user.id,
      paidByName: user.name,
      paymentNotes: paymentNotes?.trim() || undefined,
    });

    return true;
  }

  /**
   * Update an existing debt record
   */
  public static updateDebt(debtId: string, patch: Partial<DebtRecord>): boolean {
    const rawDebts = db.getDebts();
    const existing = rawDebts.find(d => d.id === debtId);
    if (!existing) return false;

    db.updateDebt(debtId, patch);
    return true;
  }

  /**
   * Delete or archive a debt record
   */
  public static deleteDebt(debtId: string): boolean {
    db.deleteDebt(debtId);
    return true;
  }
}
