import { db } from '../db/storage';
import { User, UserStatus } from '../types';
import { generateUUID, hashPassword } from '../utils/crypto';

export class SellerService {
  /**
   * Get all sellers with their performance statistics (Total sales, total revenue, status, assigned shops).
   */
  public static getSellers(): (User & { salesCount: number; totalRevenue: number; assignedShopNames: string[] })[] {
    const users = db.getUsers().filter(u => u.role === 'SELLER');
    const sales = db.getSales().filter(s => s.status === 'COMPLETED');
    const shops = db.getShops();

    return users.map(user => {
      const userSales = sales.filter(s => s.sellerId === user.id);
      const salesCount = userSales.length;
      const totalRevenue = userSales.reduce((sum, s) => sum + s.total, 0);

      const assignedShopNames = (user.assignedShopIds || [])
        .map(id => shops.find(sh => sh.id === id)?.name)
        .filter(Boolean) as string[];

      return {
        ...user,
        salesCount,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        assignedShopNames,
      };
    });
  }

  /**
   * Admin creates a new seller with assigned shops.
   */
  public static async createSeller(
    params: {
      name: string;
      username: string;
      password: string;
      color?: string;
      status?: UserStatus;
      assignedShopIds?: string[];
    },
    currentUser: User
  ): Promise<{ success: boolean; seller?: User; error?: string }> {
    if (currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Permission Denied: Only Admin can create seller accounts.' };
    }

    if (!params.name?.trim() || !params.username?.trim() || !params.password) {
      return { success: false, error: 'Full name, username, and password are required.' };
    }

    const cleanUsername = params.username.trim().toLowerCase();
    const users = db.getUsers();

    if (users.some(u => u.username.toLowerCase() === cleanUsername)) {
      return { success: false, error: `Username '${cleanUsername}' is already taken.` };
    }

    const passwordHash = await hashPassword(params.password);
    const newSeller: User = {
      id: generateUUID(),
      username: cleanUsername,
      name: params.name.trim(),
      role: 'SELLER',
      passwordHash,
      color: params.color || 'blue',
      status: params.status || 'ACTIVE',
      assignedShopIds: params.assignedShopIds && params.assignedShopIds.length > 0 ? params.assignedShopIds : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.saveUsers([...users, newSeller]);

    db.enqueueSync({
      id: generateUUID(),
      operation: 'CREATE_SELLER',
      entityType: 'SELLER',
      entityId: newSeller.id,
      payload: {
        id: newSeller.id,
        username: newSeller.username,
        name: newSeller.name,
        color: newSeller.color,
        status: newSeller.status,
        assignedShopIds: newSeller.assignedShopIds,
      },
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });

    db.addAuditLog({
      id: generateUUID(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'CREATE_SELLER',
      details: `Created new seller account: ${newSeller.name} (@${newSeller.username}) with ${newSeller.assignedShopIds?.length || 0} assigned shops`,
      entityType: 'SELLER',
      entityId: newSeller.id,
      timestamp: new Date().toISOString(),
    });

    return { success: true, seller: newSeller };
  }

  /**
   * Admin updates a seller (name, color, status, assignedShopIds, optional new password).
   * Note: Permanent deletion is forbidden.
   */
  public static updateSeller(
    sellerId: string,
    params: {
      name?: string;
      color?: string;
      status?: UserStatus;
      assignedShopIds?: string[];
    },
    currentUser: User
  ): { success: boolean; seller?: User; error?: string } {
    if (currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Permission Denied: Only Admin can manage seller profiles.' };
    }

    const users = db.getUsers();
    const index = users.findIndex(u => u.id === sellerId && u.role === 'SELLER');
    if (index === -1) {
      return { success: false, error: 'Seller account not found.' };
    }

    const seller = users[index];

    if (params.name?.trim()) {
      seller.name = params.name.trim();
    }

    if (params.color) {
      seller.color = params.color;
    }

    if (params.status) {
      seller.status = params.status;
    }

    if (params.assignedShopIds !== undefined) {
      seller.assignedShopIds = params.assignedShopIds;
    }

    seller.updatedAt = new Date().toISOString();
    users[index] = seller;
    db.saveUsers(users);

    db.enqueueSync({
      id: generateUUID(),
      operation: 'UPDATE_SELLER',
      entityType: 'SELLER',
      entityId: seller.id,
      payload: {
        id: seller.id,
        name: seller.name,
        color: seller.color,
        status: seller.status,
        assignedShopIds: seller.assignedShopIds,
      },
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });

    db.addAuditLog({
      id: generateUUID(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'UPDATE_SELLER',
      details: `Updated seller ${seller.name} (Status: ${seller.status}, Color: ${seller.color}, Assigned Shops: ${seller.assignedShopIds?.length || 0})`,
      entityType: 'SELLER',
      entityId: seller.id,
      timestamp: new Date().toISOString(),
    });

    return { success: true, seller };
  }

  public static toggleSellerStatus(
    sellerId: string,
    status: UserStatus,
    currentUser: User
  ): { success: boolean; error?: string } {
    return SellerService.updateSeller(sellerId, { status }, currentUser);
  }

  /**
   * Seller or Admin updates the seller's account color.
   */
  public static updateSellerColor(
    sellerId: string,
    color: string,
    currentUser: User
  ): { success: boolean; error?: string } {
    if (currentUser.role !== 'ADMIN' && currentUser.id !== sellerId) {
      return { success: false, error: 'Permission Denied: You cannot modify another user color.' };
    }

    const users = db.getUsers();
    const user = users.find(u => u.id === sellerId);
    if (!user) return { success: false, error: 'User not found.' };

    user.color = color;
    user.updatedAt = new Date().toISOString();
    db.saveUsers(users);

    return { success: true };
  }
}
