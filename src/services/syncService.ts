import { db } from '../db/storage';
import { SyncQueueItem, User } from '../types';

export type SyncState = 'OFFLINE_LOCAL' | 'PENDING_SYNC' | 'SYNCING' | 'SYNCED';

export class SyncService {
  private static isSimulatingSync = false;

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

    if (SyncService.isSimulatingSync) {
      return { state: 'SYNCING', pendingCount: pending };
    }

    if (pending > 0) {
      return { state: 'PENDING_SYNC', pendingCount: pending };
    }

    return { state: 'OFFLINE_LOCAL', pendingCount: 0 };
  }

  public static async processSyncQueue(currentUser?: User): Promise<{ success: boolean; processedCount: number; message?: string }> {
    return SyncService.simulateServerSync().then(res => ({
      success: res.success,
      processedCount: res.syncedCount,
      message: `Synchronized ${res.syncedCount} offline operations with cloud hub.`,
    }));
  }

  public static async simulateServerSync(): Promise<{ success: boolean; syncedCount: number }> {
    if (SyncService.isSimulatingSync) {
      return { success: false, syncedCount: 0 };
    }

    SyncService.isSimulatingSync = true;
    const queue = db.getSyncQueue();
    const pendingItems = queue.filter(item => item.status === 'PENDING');

    if (pendingItems.length === 0) {
      SyncService.isSimulatingSync = false;
      return { success: true, syncedCount: 0 };
    }

    // Simulate 1.2s network handshake
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Mark items as SYNCED
    const updatedQueue = queue.map(item => {
      if (item.status === 'PENDING') {
        return { ...item, status: 'SYNCED' as const };
      }
      return item;
    });

    db.saveSyncQueue(updatedQueue);
    SyncService.isSimulatingSync = false;

    return { success: true, syncedCount: pendingItems.length };
  }

  public static clearCompleted(): void {
    const queue = db.getSyncQueue().filter(q => q.status !== 'SYNCED');
    db.saveSyncQueue(queue);
  }
}
