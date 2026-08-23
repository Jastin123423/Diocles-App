import {
  User,
  Category,
  Product,
  Sale,
  Purchase,
  Expense,
  InventoryMovement,
  BusinessSettings,
  AuditLog,
  SyncQueueItem,
  Shop,
  ImportHistoryItem,
  DebtRecord,
  AppNotification,
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_SALES,
  INITIAL_PURCHASES,
  INITIAL_EXPENSES,
  INITIAL_MOVEMENTS,
  INITIAL_SETTINGS,
  INITIAL_AUDIT_LOGS,
  INITIAL_SHOPS,
  INITIAL_IMPORT_HISTORY,
  INITIAL_DEBTS,
  DEFAULT_ADMIN_HASH,
} from './seedData';

const DB_PREFIX = 'omnibiz_pos_db_v1_';

export interface DatabaseState {
  shops: Shop[];
  users: User[];
  categories: Category[];
  products: Product[];
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
  movements: InventoryMovement[];
  settings: BusinessSettings;
  auditLogs: AuditLog[];
  syncQueue: SyncQueueItem[];
  importHistory: ImportHistoryItem[];
  debts: DebtRecord[];
  notifications: AppNotification[];
}


type DBListener = () => void;

class LocalDatabase {
  private listeners: Set<DBListener> = new Set();
  private memoryCache: DatabaseState | null = null;

  constructor() {
    this.init();
  }

  private getKey(table: string): string {
    return `${DB_PREFIX}${table}`;
  }

  private loadTable<T>(tableName: string, fallback: T): T {
    try {
      const serialized = localStorage.getItem(this.getKey(tableName));
      if (!serialized) {
        this.saveTable(tableName, fallback);
        return fallback;
      }
      return JSON.parse(serialized) as T;
    } catch (e) {
      console.warn(`[LocalDB] Error reading table ${tableName}, using fallback`, e);
      return fallback;
    }
  }

  private saveTable<T>(tableName: string, data: T): void {
    try {
      localStorage.setItem(this.getKey(tableName), JSON.stringify(data));
    } catch (e) {
      console.error(`[LocalDB] Failed writing table ${tableName}`, e);
    }
  }

  public init(): DatabaseState {
    let shops = this.loadTable<Shop[]>('shops', INITIAL_SHOPS);
    let users = this.loadTable<User[]>('users', INITIAL_USERS);
    let categories = this.loadTable<Category[]>('categories', INITIAL_CATEGORIES);
    let products = this.loadTable<Product[]>('products', INITIAL_PRODUCTS);
    let sales = this.loadTable<Sale[]>('sales', INITIAL_SALES);
    let purchases = this.loadTable<Purchase[]>('purchases', INITIAL_PURCHASES);
    let expenses = this.loadTable<Expense[]>('expenses', INITIAL_EXPENSES);
    let movements = this.loadTable<InventoryMovement[]>('movements', INITIAL_MOVEMENTS);
    let settings = this.loadTable<BusinessSettings>('settings', INITIAL_SETTINGS);
    const auditLogs = this.loadTable<AuditLog[]>('audit_logs', INITIAL_AUDIT_LOGS);
    const syncQueue = this.loadTable<SyncQueueItem[]>('sync_queue', []);
    const importHistory = this.loadTable<ImportHistoryItem[]>('import_history', INITIAL_IMPORT_HISTORY);

    // Ensure categories have status and Hardware category exists
    let categoriesModified = false;
    if (!categories || categories.length === 0) {
      categories = INITIAL_CATEGORIES;
      categoriesModified = true;
    } else {
      categories = categories.map(cat => {
        if (!cat.status) {
          categoriesModified = true;
          return { ...cat, status: 'ACTIVE' as const };
        }
        return cat;
      });
      const hasHardware = categories.some(c => c.name.toLowerCase() === 'hardware' || c.id === 'cat-hardware');
      if (!hasHardware) {
        categories.unshift({
          id: 'cat-hardware',
          name: 'Hardware',
          icon: 'Hammer',
          color: '#64748b',
          status: 'ACTIVE' as const,
        });
        categoriesModified = true;
      }
    }
    if (categoriesModified) {
      this.saveTable('categories', categories);
    }

    // Ensure shops exist
    if (!shops || shops.length === 0) {
      shops = INITIAL_SHOPS;
      this.saveTable('shops', shops);
    }

    const defaultShopId = shops[0]?.id || 'shop-hardware-03';

    // Ensure users have assignedShopIds and Admin has all shops
    const allShopIds = shops.map(s => s.id);
    let usersModified = false;
    users = users.map(u => {
      let mod = false;
      const copy = { ...u };
      if (copy.role === 'ADMIN') {
        if (copy.username.toLowerCase() === 'admin') {
          copy.username = 'Admin';
          copy.passwordHash = DEFAULT_ADMIN_HASH;
          mod = true;
        }
        if (!copy.assignedShopIds || copy.assignedShopIds.length !== allShopIds.length) {
          copy.assignedShopIds = allShopIds;
          mod = true;
        }
      } else {
        if (!copy.assignedShopIds || copy.assignedShopIds.length === 0) {
          copy.assignedShopIds = [defaultShopId];
          mod = true;
        }
      }
      if (mod) usersModified = true;
      return copy;
    });

    if (usersModified) {
      this.saveTable('users', users);
    }

    // Ensure all products have a valid shopId
    let productsModified = false;
    products = products.map(p => {
      if (!p.shopId) {
        productsModified = true;
        return { ...p, shopId: defaultShopId };
      }
      return p;
    });
    if (productsModified) {
      this.saveTable('products', products);
    }

    // Ensure all sales have shopId and items have shopId
    let salesModified = false;
    sales = sales.map(s => {
      if (!s.shopId) {
        salesModified = true;
        const targetShop = shops.find(sh => sh.id === defaultShopId);
        return {
          ...s,
          shopId: defaultShopId,
          shopName: targetShop?.name || 'Main Shop',
          items: s.items.map(item => ({ ...item, shopId: item.shopId || defaultShopId })),
        };
      }
      return s;
    });
    if (salesModified) {
      this.saveTable('sales', sales);
    }

    // Ensure purchases have shopId
    let purchasesModified = false;
    purchases = purchases.map(po => {
      if (!po.shopId) {
        purchasesModified = true;
        const targetShop = shops.find(sh => sh.id === defaultShopId);
        return { ...po, shopId: defaultShopId, shopName: targetShop?.name || 'Main Shop' };
      }
      return po;
    });
    if (purchasesModified) {
      this.saveTable('purchases', purchases);
    }

    // Ensure movements have shopId
    let movementsModified = false;
    movements = movements.map(m => {
      if (!m.shopId) {
        movementsModified = true;
        const targetShop = shops.find(sh => sh.id === defaultShopId);
        return { ...m, shopId: defaultShopId, shopName: targetShop?.name || 'Main Shop' };
      }
      return m;
    });
    if (movementsModified) {
      this.saveTable('movements', movements);
    }

    // Ensure business branding is correct and currency is TSh
    let settingsModified = false;
    if (settings.businessName === 'Apex Hardware & Retail Solutions' || !settings.businessName) {
      settings = {
        ...settings,
        businessName: 'Diocres Hardware&Retail Solutions',
        tagline: 'Quality Tools, Hardware, Building & Retail Solutions',
        receiptHeaderNote: 'Thank you for shopping with Diocres Hardware&Retail Solutions!',
      };
      settingsModified = true;
    }

    if (!settings.currencySymbol || settings.currencySymbol === '$') {
      settings = {
        ...settings,
        currencySymbol: 'TSh',
        currencyCode: 'TZS',
      };
      settingsModified = true;
    }

    if (settingsModified) {
      this.saveTable('settings', settings);
    }

    const debts = this.loadTable<DebtRecord[]>('debts', INITIAL_DEBTS);
    const notifications = this.loadTable<AppNotification[]>('notifications', []);

    this.memoryCache = {
      shops,
      users,
      categories,
      products,
      sales,
      purchases,
      expenses,
      movements,
      settings,
      auditLogs,
      syncQueue,
      importHistory,
      debts,
      notifications,
    };

    return this.memoryCache;

  }

  public getState(): DatabaseState {
    if (!this.memoryCache) {
      return this.init();
    }
    return this.memoryCache;
  }

  public subscribe(listener: DBListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach(fn => {
      try {
        fn();
      } catch (err) {
        console.error('[LocalDB] Listener error', err);
      }
    });
  }

  // --- Shops ---
  public getShops(): Shop[] {
    return this.getState().shops || [];
  }

  public saveShops(shops: Shop[]): void {
    if (!this.memoryCache) this.init();
    this.memoryCache!.shops = shops;
    this.saveTable('shops', shops);
    this.notify();
  }

  // --- Users ---
  public getUsers(): User[] {
    return this.getState().users || [];
  }

  public saveUsers(users: User[]): void {
    if (!this.memoryCache) this.init();
    this.memoryCache!.users = users;
    this.saveTable('users', users);
    this.notify();
  }

  // --- Categories ---
  public getCategories(): Category[] {
    return this.getState().categories || [];
  }

  public saveCategories(categories: Category[]): void {
    if (!this.memoryCache) this.init();
    this.memoryCache!.categories = categories;
    this.saveTable('categories', categories);
    this.notify();
  }

  // --- Products ---
  public getProducts(): Product[] {
    return this.getState().products || [];
  }

  public saveProducts(products: Product[]): void {
    if (!this.memoryCache) this.init();
    this.memoryCache!.products = products;
    this.saveTable('products', products);
    this.notify();
  }

  // --- Sales ---
  public getSales(): Sale[] {
    return this.getState().sales || [];
  }

  public saveSales(sales: Sale[]): void {
    if (!this.memoryCache) this.init();
    this.memoryCache!.sales = sales;
    this.saveTable('sales', sales);
    this.notify();
  }

  // --- Purchases ---
  public getPurchases(): Purchase[] {
    return this.getState().purchases || [];
  }

  public savePurchases(purchases: Purchase[]): void {
    if (!this.memoryCache) this.init();
    this.memoryCache!.purchases = purchases;
    this.saveTable('purchases', purchases);
    this.notify();
  }

  // --- Expenses ---
  public getExpenses(): Expense[] {
    return this.getState().expenses || [];
  }

  public saveExpenses(expenses: Expense[]): void {
    if (!this.memoryCache) this.init();
    this.memoryCache!.expenses = expenses;
    this.saveTable('expenses', expenses);
    this.notify();
  }

  // --- Movements ---
  public getMovements(): InventoryMovement[] {
    return this.getState().movements || [];
  }

  public saveMovements(movements: InventoryMovement[]): void {
    if (!this.memoryCache) this.init();
    this.memoryCache!.movements = movements;
    this.saveTable('movements', movements);
    this.notify();
  }

  // --- Settings ---
  public getSettings(): BusinessSettings {
    return this.getState().settings || INITIAL_SETTINGS;
  }

  public saveSettings(settings: BusinessSettings): void {
    if (!this.memoryCache) this.init();
    this.memoryCache!.settings = settings;
    this.saveTable('settings', settings);
    this.notify();
  }

  // --- Audit Logs ---
  public getAuditLogs(): AuditLog[] {
    return this.getState().auditLogs || [];
  }

  public addAuditLog(log: AuditLog): void {
    if (!this.memoryCache) this.init();
    const updated = [log, ...(this.memoryCache!.auditLogs || [])].slice(0, 500); // cap at 500
    this.memoryCache!.auditLogs = updated;
    this.saveTable('audit_logs', updated);
    this.notify();
  }

  // --- Import History ---
  public getImportHistory(): ImportHistoryItem[] {
    return this.getState().importHistory || [];
  }

  public saveImportHistory(history: ImportHistoryItem[]): void {
    if (!this.memoryCache) this.init();
    this.memoryCache!.importHistory = history;
    this.saveTable('import_history', history);
    this.notify();
  }

  public addImportHistory(item: ImportHistoryItem): void {
    if (!this.memoryCache) this.init();
    const updated = [item, ...(this.memoryCache!.importHistory || [])].slice(0, 200);
    this.memoryCache!.importHistory = updated;
    this.saveTable('import_history', updated);
    this.notify();
  }

  // --- Sync Queue ---
  public getSyncQueue(): SyncQueueItem[] {
    return this.getState().syncQueue || [];
  }

  public enqueueSync(item: SyncQueueItem): void {
    if (!this.memoryCache) this.init();
    const updated = [item, ...(this.memoryCache!.syncQueue || [])];
    this.memoryCache!.syncQueue = updated;
    this.saveTable('sync_queue', updated);
    this.notify();
  }

  public saveSyncQueue(queue: SyncQueueItem[]): void {
    if (!this.memoryCache) this.init();
    this.memoryCache!.syncQueue = queue;
    this.saveTable('sync_queue', queue);
    this.notify();
  }

  // --- Debts (Independent Module) ---
  public getDebts(): DebtRecord[] {
    return this.getState().debts || [];
  }

  public saveDebts(debts: DebtRecord[]): void {
    if (!this.memoryCache) this.init();
    this.memoryCache!.debts = debts;
    this.saveTable('debts', debts);
    this.notify();
  }

  public addDebt(debt: DebtRecord): void {
    if (!this.memoryCache) this.init();
    const updated = [debt, ...(this.memoryCache!.debts || [])];
    this.memoryCache!.debts = updated;
    this.saveTable('debts', updated);
    this.notify();
  }

  public updateDebt(debtId: string, patch: Partial<DebtRecord>): void {
    if (!this.memoryCache) this.init();
    const current = this.memoryCache!.debts || [];
    const updated = current.map(d => (d.id === debtId ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d));
    this.memoryCache!.debts = updated;
    this.saveTable('debts', updated);
    this.notify();
  }

  public deleteDebt(debtId: string): void {
    if (!this.memoryCache) this.init();
    const current = this.memoryCache!.debts || [];
    const updated = current.filter(d => d.id !== debtId);
    this.memoryCache!.debts = updated;
    this.saveTable('debts', updated);
    this.notify();
  }

  // --- Notifications (Independent Center) ---
  public getNotifications(): AppNotification[] {
    return this.getState().notifications || [];
  }

  public saveNotifications(notifications: AppNotification[]): void {
    if (!this.memoryCache) this.init();
    this.memoryCache!.notifications = notifications;
    this.saveTable('notifications', notifications);
    this.notify();
  }

  public addNotification(notification: AppNotification): void {
    if (!this.memoryCache) this.init();
    const current = this.memoryCache!.notifications || [];
    // Avoid exact duplicate messages created at the same minute
    const isDup = current.some(
      n => n.type === notification.type &&
           n.message === notification.message &&
           n.relatedEntityId === notification.relatedEntityId
    );
    if (!isDup) {
      const updated = [notification, ...current].slice(0, 300);
      this.memoryCache!.notifications = updated;
      this.saveTable('notifications', updated);
      this.notify();
    }
  }

  public markNotificationAsRead(notificationId: string, userId: string): void {
    if (!this.memoryCache) this.init();
    const current = this.memoryCache!.notifications || [];
    const updated = current.map(n => {
      if (n.id === notificationId) {
        const reads = n.readByUserIds || [];
        if (!reads.includes(userId)) {
          return { ...n, readByUserIds: [...reads, userId] };
        }
      }
      return n;
    });
    this.memoryCache!.notifications = updated;
    this.saveTable('notifications', updated);
    this.notify();
  }

  public markAllNotificationsAsRead(userId: string): void {
    if (!this.memoryCache) this.init();
    const current = this.memoryCache!.notifications || [];
    const updated = current.map(n => {
      const reads = n.readByUserIds || [];
      if (!reads.includes(userId)) {
        return { ...n, readByUserIds: [...reads, userId] };
      }
      return n;
    });
    this.memoryCache!.notifications = updated;
    this.saveTable('notifications', updated);
    this.notify();
  }

  // --- Backup & Restore ---
  public exportFullBackup(): string {
    const data = this.getState();
    const payload = {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      generator: 'Diocres Windows Desktop Business System',
      data,
    };
    return JSON.stringify(payload, null, 2);
  }

  public importFullBackup(jsonString: string): { success: boolean; message: string } {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || !parsed.data) {
        return { success: false, message: 'Invalid backup file structure: missing data payload' };
      }
      const d = parsed.data as DatabaseState;
      if (!Array.isArray(d.users) || !Array.isArray(d.products) || !Array.isArray(d.sales)) {
        return { success: false, message: 'Corrupt database snapshot: core tables are missing' };
      }

      this.saveTable('shops', d.shops || INITIAL_SHOPS);
      this.saveTable('users', d.users);
      this.saveTable('categories', d.categories || INITIAL_CATEGORIES);
      this.saveTable('products', d.products);
      this.saveTable('sales', d.sales);
      this.saveTable('purchases', d.purchases || []);
      this.saveTable('expenses', d.expenses || []);
      this.saveTable('movements', d.movements || []);
      this.saveTable('settings', d.settings || INITIAL_SETTINGS);
      this.saveTable('audit_logs', d.auditLogs || []);
      this.saveTable('sync_queue', d.syncQueue || []);
      this.saveTable('import_history', d.importHistory || INITIAL_IMPORT_HISTORY);
      this.saveTable('debts', d.debts || INITIAL_DEBTS);
      this.saveTable('notifications', d.notifications || []);

      this.init();
      this.notify();
      return { success: true, message: `Successfully restored backup from ${parsed.exportedAt || 'archive'}` };
    } catch (e: any) {
      return { success: false, message: `Failed to restore database: ${e.message || 'JSON parse error'}` };
    }
  }

  public resetToDefaultDemo(): void {
    this.saveTable('shops', INITIAL_SHOPS);
    this.saveTable('users', INITIAL_USERS);
    this.saveTable('categories', INITIAL_CATEGORIES);
    this.saveTable('products', INITIAL_PRODUCTS);
    this.saveTable('sales', INITIAL_SALES);
    this.saveTable('purchases', INITIAL_PURCHASES);
    this.saveTable('expenses', INITIAL_EXPENSES);
    this.saveTable('movements', INITIAL_MOVEMENTS);
    this.saveTable('settings', INITIAL_SETTINGS);
    this.saveTable('audit_logs', INITIAL_AUDIT_LOGS);
    this.saveTable('sync_queue', []);
    this.saveTable('import_history', INITIAL_IMPORT_HISTORY);
    this.saveTable('debts', INITIAL_DEBTS);
    this.saveTable('notifications', []);

    this.init();
    this.notify();
  }
}


export const db = new LocalDatabase();
export const StorageService = db;
