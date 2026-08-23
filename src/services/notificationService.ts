import { db } from '../db/storage';
import { AppNotification, NotificationType, NotificationCategory, User, Product } from '../types';
import { DebtService } from './debtService';

export class NotificationService {
  private static getTodayStr(): string {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  private static getTomorrowStr(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Run local generation routine for automatic debt and stock reminders.
   * Runs offline without needing any external server or API.
   */
  public static syncAutomaticNotifications(): void {
    const todayStr = this.getTodayStr();
    const tomorrowStr = this.getTomorrowStr();
    const debts = DebtService.getAllDebts();
    const products = db.getProducts();
    const shops = db.getShops();
    const existingNotifications = db.getNotifications();

    const newNotifications: AppNotification[] = [];

    // 1. Process Debts
    debts.forEach(debt => {
      if (debt.status === 'PAID' || debt.status === 'CANCELLED' || debt.status === 'ARCHIVED') {
        return; // Stopped when paid
      }

      if (!debt.dueDate) return;

      const due = debt.dueDate.slice(0, 10);
      const desc = debt.productDescription || 'bidhaa';
      const amountStr = debt.amount.toLocaleString();

      // Tomorrow upcoming payment
      if (due === tomorrowStr) {
        if (debt.type === 'WE_DEMAND') {
          const contactMsg = debt.contact ? ` Mkumbushe ${debt.contact}.` : '';
          const msg = `Kesho ni siku ya ${debt.debtorName} kulipa deni la ${desc} Sh ${amountStr}.${contactMsg}`;
          const id = `notif-debt-up-cust-${debt.id}-${todayStr}`;
          
          if (!existingNotifications.some(n => n.id === id)) {
            newNotifications.push({
              id,
              type: 'DEBT_UPCOMING_CUSTOMER',
              category: 'INFO',
              title: `Malipo ya Kesho: ${debt.debtorName}`,
              message: msg,
              isGlobal: true,
              relatedEntityId: debt.id,
              relatedEntityType: 'DEBT',
              createdAt: new Date().toISOString(),
              readByUserIds: [],
            });
          }
        } else {
          // THEY_DEMAND (Wanatudai)
          const msg = `Kesho ni siku ya kulipa ${debt.debtorName} pesa ya ${desc} Sh ${amountStr}.`;
          const id = `notif-debt-up-comp-${debt.id}-${todayStr}`;
          
          if (!existingNotifications.some(n => n.id === id)) {
            newNotifications.push({
              id,
              type: 'DEBT_UPCOMING_COMPANY',
              category: 'WARNING',
              title: `Malipo Yetu Kesho: ${debt.debtorName}`,
              message: msg,
              isGlobal: true,
              relatedEntityId: debt.id,
              relatedEntityType: 'DEBT',
              createdAt: new Date().toISOString(),
              readByUserIds: [],
            });
          }
        }
      }

      // Overdue debts
      if (due < todayStr) {
        const days = Math.max(1, DebtService.getOverdueDays(debt.dueDate, todayStr));

        if (debt.type === 'WE_DEMAND') {
          const msg = `${debt.debtorName} kachelewa kulipa Sh ${amountStr} ya ${desc}. Zimepita siku ${days}.`;
          const id = `notif-debt-over-cust-${debt.id}-${todayStr}`;

          if (!existingNotifications.some(n => n.id === id)) {
            newNotifications.push({
              id,
              type: 'DEBT_OVERDUE_CUSTOMER',
              category: days > 7 ? 'CRITICAL' : 'WARNING',
              title: `Deni Limechelewa: ${debt.debtorName}`,
              message: msg,
              isGlobal: true,
              relatedEntityId: debt.id,
              relatedEntityType: 'DEBT',
              createdAt: new Date().toISOString(),
              readByUserIds: [],
            });
          }
        } else {
          // THEY_DEMAND (Wanatudai)
          const msg = `Malipo ya ${desc} kwa ${debt.debtorName} yamechelewa. Zimepita siku ${days}.`;
          const id = `notif-debt-over-comp-${debt.id}-${todayStr}`;

          if (!existingNotifications.some(n => n.id === id)) {
            newNotifications.push({
              id,
              type: 'DEBT_OVERDUE_COMPANY',
              category: 'CRITICAL',
              title: `Malipo Yamechelewa: ${debt.debtorName}`,
              message: msg,
              isGlobal: true,
              relatedEntityId: debt.id,
              relatedEntityType: 'DEBT',
              createdAt: new Date().toISOString(),
              readByUserIds: [],
            });
          }
        }
      }
    });

    // 2. Process Shop-specific stock alerts
    products.forEach(product => {
      if (product.status !== 'ACTIVE') return;

      const shop = shops.find(s => s.id === product.shopId);
      const shopName = shop?.name || 'Shop';

      // Out of Stock
      if (product.currentStock <= 0) {
        const msg = `${product.name} zimeisha kabisa.`;
        const id = `notif-stock-out-${product.id}-${todayStr}`;

        if (!existingNotifications.some(n => n.id === id)) {
          newNotifications.push({
            id,
            type: 'STOCK_OUT',
            category: 'CRITICAL',
            title: `Bidhaa Imeisha: ${product.name}`,
            message: msg,
            isGlobal: false,
            targetShopId: product.shopId,
            targetShopName: shopName,
            targetRole: 'ALL',
            relatedEntityId: product.id,
            relatedEntityType: 'PRODUCT',
            createdAt: new Date().toISOString(),
            readByUserIds: [],
          });
        }
      } else if (product.currentStock <= product.minStock) {
        // Low Stock
        const msg = `${product.name} zimekaribia kuisha — zimebaki ${product.currentStock}.`;
        const id = `notif-stock-low-${product.id}-${todayStr}`;

        if (!existingNotifications.some(n => n.id === id)) {
          newNotifications.push({
            id,
            type: 'STOCK_LOW',
            category: 'WARNING',
            title: `Akiba Chini: ${product.name}`,
            message: msg,
            isGlobal: false,
            targetShopId: product.shopId,
            targetShopName: shopName,
            targetRole: 'ALL',
            relatedEntityId: product.id,
            relatedEntityType: 'PRODUCT',
            createdAt: new Date().toISOString(),
            readByUserIds: [],
          });
        }
      }
    });

    // Append newly generated notifications if any
    if (newNotifications.length > 0) {
      const merged = [...newNotifications, ...existingNotifications].slice(0, 300);
      db.saveNotifications(merged);
    }
  }

  /**
   * Broadcast a price change event to shop sellers and generate admin confirmation
   */
  public static broadcastPriceChange(product: Product, oldPrice: number, newPrice: number): void {
    if (oldPrice === newPrice) return;

    const shops = db.getShops();
    const targetShop = shops.find(s => s.id === product.shopId);
    const shopName = targetShop?.name || 'Duka';
    const now = new Date().toISOString();

    // 1. Notification for Sellers of that shop
    const sellerNotif: AppNotification = {
      id: `notif-price-seller-${product.id}-${Date.now()}`,
      type: 'PRICE_CHANGE_SELLER',
      category: 'INFO',
      title: `Mabadiliko ya Bei: ${product.name}`,
      message: `${product.name} zimebadilishwa bei sasa zitauzwa Sh ${newPrice.toLocaleString()}.`,
      isGlobal: false,
      targetShopId: product.shopId,
      targetShopName: shopName,
      targetRole: 'SELLER',
      relatedEntityId: product.id,
      relatedEntityType: 'PRODUCT',
      createdAt: now,
      readByUserIds: [],
    };

    // 2. Notification confirmation for Admin
    const adminNotif: AppNotification = {
      id: `notif-price-admin-${product.id}-${Date.now()}`,
      type: 'PRICE_CHANGE_ADMIN',
      category: 'SUCCESS',
      title: `Taarifa ya Bei Imetumwa (${shopName})`,
      message: `Taarifa imetumwa kwa wauzaji wa ${shopName} juu ya mabadiliko ya bei ya ${product.name}.`,
      isGlobal: false,
      targetShopId: product.shopId,
      targetShopName: shopName,
      targetRole: 'ADMIN',
      relatedEntityId: product.id,
      relatedEntityType: 'PRODUCT',
      createdAt: now,
      readByUserIds: [],
    };

    db.addNotification(sellerNotif);
    db.addNotification(adminNotif);
  }

  /**
   * Get notifications visible to the currently logged in user based on role and shop assignments
   */
  public static getUserNotifications(user: User | null): AppNotification[] {
    if (!user) return [];

    const all = db.getNotifications();

    return all.filter(n => {
      // Global notifications (debt reminders) are seen by everyone
      if (n.isGlobal) return true;

      // Admin receives everything intended for Admin or ALL, across all shops
      if (user.role === 'ADMIN') {
        if (n.targetRole === 'SELLER') return false; // Seller-only specific notices
        return true;
      }

      // Seller: must not receive ADMIN-only notices
      if (n.targetRole === 'ADMIN') return false;

      // Seller: if notification is shop-specific, check assignment
      if (n.targetShopId) {
        const assigned = user.assignedShopIds || [];
        return assigned.includes(n.targetShopId);
      }

      return true;
    });
  }

  /**
   * Get unread notification count for user
   */
  public static getUnreadCount(user: User | null): number {
    if (!user) return 0;
    const userNotifs = this.getUserNotifications(user);
    return userNotifs.filter(n => !(n.readByUserIds || []).includes(user.id)).length;
  }

  /**
   * Mark a notification as read
   */
  public static markAsRead(notificationId: string, user: User): void {
    db.markNotificationAsRead(notificationId, user.id);
  }

  /**
   * Mark all notifications as read for current user
   */
  public static markAllAsRead(user: User): void {
    db.markAllNotificationsAsRead(user.id);
  }
}
