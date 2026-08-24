// src/services/syncService.ts (UPDATED)
import { db } from '../db/storage';
import { SyncQueueItem, User } from '../types';
import { CloudflareApi } from './cloudflareApi';

export type SyncState = 'OFFLINE_LOCAL' | 'PENDING_SYNC' | 'SYNCING' | 'SYNCED';

export class SyncService {
  private static isSyncing = false;
  private static lastSyncedAt: string | null = localStorage.getItem('omnibiz_last_synced_at');

  public static getQueueItems(): SyncQueueItem[] {
    return db.getSyncQueue();
  }

  public static getPendingCount(): number {
    return db.getSyncQueue().filter(item => item.status === 'PENDING').length;
  }

  public static getSyncStats(): { total: number; pending: number; synced: number; failed: number } {
    const queue = db.getSyncQueue();
    return {
      total: queue.length,
      pending: queue.filter(q => q.status === 'PENDING').length,
      synced: queue.filter(q => q.status === 'SYNCED').length,
      failed: queue.filter(q => q.status === 'FAILED').length,
    };
  }

  public static getSyncStatus(): { state: SyncState; pendingCount: number; lastSyncedAt?: string } {
    const queue = db.getSyncQueue();
    const pending = queue.filter(q => q.status === 'PENDING').length;

    if (SyncService.isSyncing) {
      return { state: 'SYNCING', pendingCount: pending, lastSyncedAt: this.lastSyncedAt || undefined };
    }

    if (pending > 0) {
      return { state: 'PENDING_SYNC', pendingCount: pending, lastSyncedAt: this.lastSyncedAt || undefined };
    }

    return { 
      state: this.lastSyncedAt ? 'SYNCED' : 'OFFLINE_LOCAL', 
      pendingCount: 0, 
      lastSyncedAt: this.lastSyncedAt || undefined 
    };
  }

  public static async processSyncQueue(currentUser?: User): Promise<{ 
    success: boolean; 
    processedCount: number; 
    message?: string;
    cloudData?: any;
  }> {
    if (SyncService.isSyncing) {
      return { success: false, processedCount: 0, message: 'Sync already in progress' };
    }

    // Check if online
    const online = await CloudflareApi.checkConnection();
    if (!online) {
      return { 
        success: false, 
        processedCount: 0, 
        message: 'Offline: Cannot reach cloud server. Will retry when connection is available.' 
      };
    }

    SyncService.isSyncing = true;

    try {
      const queue = db.getSyncQueue();
      const pendingItems = queue.filter(item => item.status === 'PENDING');

      // 1. PUSH local changes to cloud
      if (pendingItems.length > 0) {
        const operations = pendingItems.map(item => ({
          id: item.id,
          operation: item.operation || item.action,
          entityType: item.entityType,
          entityId: item.entityId,
          payload: item.payload,
        }));

        const pushResult = await CloudflareApi.pushSync(operations);

        // Update queue items based on push results
        const updatedQueue = queue.map(item => {
          if (item.status !== 'PENDING') return item;
          
          const successResult = pushResult.results?.find((r: any) => r.id === item.id && r.success);
          const errorResult = pushResult.errors?.find((e: any) => e.id === item.id);
          
          if (successResult) {
            return { ...item, status: 'SYNCED' as const };
          }
          if (errorResult) {
            return { 
              ...item, 
              status: 'FAILED' as const, 
              retryCount: (item.retryCount || 0) + 1 
            };
          }
          // If not in results, keep as PENDING
          return item;
        });

        db.saveSyncQueue(updatedQueue);
      }

      // 2. PULL latest cloud state
      const pullResult = await CloudflareApi.pullSync(this.lastSyncedAt || undefined);

      if (pullResult.success && pullResult.data) {
        this.applyCloudData(pullResult.data);
      }

      // 3. Update sync timestamp
      this.lastSyncedAt = new Date().toISOString();
      localStorage.setItem('omnibiz_last_synced_at', this.lastSyncedAt);

      SyncService.isSyncing = false;

      return {
        success: true,
        processedCount: pendingItems.length,
        message: `Synchronized ${pendingItems.length} records with cloud.`,
        cloudData: pullResult.data,
      };
    } catch (error: any) {
      SyncService.isSyncing = false;
      return { 
        success: false, 
        processedCount: 0, 
        message: `Sync failed: ${error.message || 'Unknown error'}` 
      };
    }
  }

  // Apply cloud data to local database
  private static applyCloudData(cloudData: any): void {
    if (!cloudData) return;

    // Apply shops
    if (cloudData.shops && cloudData.shops.length > 0) {
      const localShops = db.getShops();
      const mergedShops = this.mergeArrays(localShops, cloudData.shops.map((s: any) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        description: s.description,
        address: s.address,
        phone: s.phone,
        status: s.status,
        color: s.color,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      })), 'id');
      db.saveShops(mergedShops);
    }

    // Apply users
    if (cloudData.users && cloudData.users.length > 0) {
      const localUsers = db.getUsers();
      const mergedUsers = this.mergeArrays(localUsers, cloudData.users.map((u: any) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role,
        passwordHash: u.password_hash,
        color: u.color,
        status: u.status,
        assignedShopIds: u.assigned_shop_ids || [],
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      })), 'id');
      db.saveUsers(mergedUsers);
    }

    // Apply categories
    if (cloudData.categories && cloudData.categories.length > 0) {
      const localCategories = db.getCategories();
      const mergedCategories = this.mergeArrays(localCategories, cloudData.categories.map((c: any) => ({
        id: c.id,
        shopId: c.shop_id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        status: c.status,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })), 'id');
      db.saveCategories(mergedCategories);
    }

    // Apply products
    if (cloudData.products && cloudData.products.length > 0) {
      const localProducts = db.getProducts();
      const mergedProducts = this.mergeArrays(localProducts, cloudData.products.map((p: any) => ({
        id: p.id,
        shopId: p.shop_id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        categoryId: p.category_id,
        sellingPrice: p.selling_price,
        proposedSellingPrice: p.proposed_selling_price,
        purchasePrice: p.purchase_price,
        currentStock: p.current_stock,
        minStock: p.min_stock,
        unit: p.unit,
        status: p.status,
        imageUrl: p.image_url,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })), 'id');
      db.saveProducts(mergedProducts);
    }

    // Apply expenses
    if (cloudData.expenses && cloudData.expenses.length > 0) {
      const localExpenses = db.getExpenses();
      const mergedExpenses = this.mergeArrays(localExpenses, cloudData.expenses.map((e: any) => ({
        id: e.id,
        shopId: e.shop_id,
        shopName: e.shop_name,
        isCompanyExpense: !!e.is_company_expense,
        category: e.category,
        description: e.description,
        title: e.title,
        amount: e.amount,
        paymentMethod: e.payment_method,
        date: e.date,
        reference: e.reference,
        notes: e.notes,
        createdByUserId: e.created_by_user_id,
        createdByName: e.created_by_name,
        createdAt: e.created_at,
      })), 'id');
      db.saveExpenses(mergedExpenses);
    }

    // Apply movements
    if (cloudData.movements && cloudData.movements.length > 0) {
      const localMovements = db.getMovements();
      const mergedMovements = this.mergeArrays(localMovements, cloudData.movements.map((m: any) => ({
        id: m.id,
        shopId: m.shop_id,
        shopName: m.shop_name,
        productId: m.product_id,
        productName: m.product_name,
        previousQty: m.previous_qty,
        changeQty: m.change_qty,
        newQty: m.new_qty,
        type: m.type,
        reason: m.reason,
        costValue: m.cost_value,
        referenceId: m.reference_id,
        userId: m.user_id,
        userName: m.user_name,
        createdAt: m.created_at,
      })), 'id');
      db.saveMovements(mergedMovements);
    }

    // Apply settings
    if (cloudData.settings) {
      const localSettings = db.getSettings();
      const mergedSettings = {
        ...localSettings,
        ...(cloudData.settings.business_name ? { businessName: cloudData.settings.business_name } : {}),
        ...(cloudData.settings.tagline ? { tagline: cloudData.settings.tagline } : {}),
        ...(cloudData.settings.address ? { address: cloudData.settings.address } : {}),
        ...(cloudData.settings.phone ? { phone: cloudData.settings.phone } : {}),
        ...(cloudData.settings.email ? { email: cloudData.settings.email } : {}),
        ...(cloudData.settings.currency_symbol ? { currencySymbol: cloudData.settings.currency_symbol } : {}),
        ...(cloudData.settings.currency_code ? { currencyCode: cloudData.settings.currency_code } : {}),
        ...(cloudData.settings.tax_rate_percent !== undefined ? { taxRatePercent: cloudData.settings.tax_rate_percent } : {}),
        ...(cloudData.settings.enable_tax !== undefined ? { enableTax: !!cloudData.settings.enable_tax } : {}),
        ...(cloudData.settings.receipt_header_note ? { receiptHeaderNote: cloudData.settings.receipt_header_note } : {}),
        ...(cloudData.settings.receipt_footer_note ? { receiptFooterNote: cloudData.settings.receipt_footer_note } : {}),
        ...(cloudData.settings.receipt_paper_width ? { receiptPaperWidth: cloudData.settings.receipt_paper_width } : {}),
        ...(cloudData.settings.low_stock_threshold_default ? { lowStockThresholdDefault: cloudData.settings.low_stock_threshold_default } : {}),
      };
      db.saveSettings(mergedSettings);
    }
  }

  // Helper to merge arrays (cloud wins on conflict)
  private static mergeArrays(local: any[], cloud: any[], idField: string): any[] {
    const map = new Map<string, any>();
    
    // Add local items first
    local.forEach(item => map.set(item[idField], item));
    
    // Override with cloud items (cloud is source of truth)
    cloud.forEach(item => map.set(item[idField], item));
    
    return Array.from(map.values());
  }

  // Clear completed sync items (older than 7 days)
  public static clearCompleted(): void {
    const queue = db.getSyncQueue();
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    
    const filtered = queue.filter(q => {
      if (q.status !== 'SYNCED') return true;
      const timestamp = new Date(q.timestamp || q.createdAt).getTime();
      return timestamp > sevenDaysAgo;
    });
    
    db.saveSyncQueue(filtered);
  }

  // Setup auto-sync listeners
  public static setupAutoSync(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      console.log('[SyncService] Online detected, auto-syncing...');
      this.processSyncQueue();
    });

    window.addEventListener('offline', () => {
      console.log('[SyncService] Offline detected, continuing in local mode');
    });
  }
}

// Auto-setup on import
SyncService.setupAutoSync();
