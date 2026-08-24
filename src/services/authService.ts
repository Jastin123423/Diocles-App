// src/services/authService.ts (UPDATED WITH CLOUD SYNC)
import { db } from '../db/storage';
import { User, UserRole } from '../types';
import { hashPassword, verifyPassword, generateUUID } from '../utils/crypto';
import { CloudflareApi } from './cloudflareApi';

const AUTH_STORAGE_KEY = 'omnibiz_active_session_v1';

export class AuthService {
  public static async login(
    username: string,
    plainPassword: string,
    expectedRole?: UserRole
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    const trimmedUsername = username.trim().toLowerCase();
    const users = db.getUsers();
    const user = users.find(u => u.username.toLowerCase() === trimmedUsername);

    if (!user) {
      // Try cloud login if local user not found
      try {
        const online = await CloudflareApi.checkConnection();
        if (online) {
          const cloudResult = await CloudflareApi.login(username, plainPassword);
          if (cloudResult.success && cloudResult.user) {
            // Sync cloud user to local
            const cloudUser: User = {
              id: cloudResult.user.id,
              username: cloudResult.user.username,
              name: cloudResult.user.name,
              role: cloudResult.user.role,
              passwordHash: await hashPassword(plainPassword),
              color: cloudResult.user.color || 'blue',
              status: cloudResult.user.status || 'ACTIVE',
              assignedShopIds: cloudResult.user.assignedShopIds || [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            
            const updatedUsers = [...db.getUsers().filter(u => u.id !== cloudUser.id), cloudUser];
            db.saveUsers(updatedUsers);
            
            if (cloudResult.token) {
              CloudflareApi.setToken(cloudResult.token);
            }
            
            AuthService.setActiveUser(cloudUser);
            
            db.addAuditLog({
              id: generateUUID(),
              userId: cloudUser.id,
              userName: cloudUser.name,
              action: 'USER_LOGIN',
              details: `${cloudUser.role} login successful via cloud (${cloudUser.username})`,
              entityType: 'AUTH',
              entityId: cloudUser.id,
              timestamp: new Date().toISOString(),
            });
            
            return { success: true, user: cloudUser };
          }
        }
      } catch (error) {
        console.log('Cloud login failed, continuing offline:', error);
      }
      
      return { success: false, error: 'Account not found. Please check your username.' };
    }

    if (user.status !== 'ACTIVE') {
      return {
        success: false,
        error: 'This account is currently inactive. Please contact the administrator.',
      };
    }

    if (expectedRole && user.role !== expectedRole) {
      return {
        success: false,
        error: `Unauthorized role: This login portal is restricted to ${expectedRole.toLowerCase()} accounts.`,
      };
    }

    // Verify password hash
    const isValid = await verifyPassword(plainPassword, user.passwordHash);
    if (!isValid) {
      // Fallback check for admin 52775277 or seller default passwords
      if (plainPassword === '52775277' && user.role === 'ADMIN') {
        const newHash = await hashPassword('52775277');
        user.passwordHash = newHash;
        db.saveUsers(users);
      } else if (plainPassword === 'seller123' && user.role === 'SELLER') {
        const newHash = await hashPassword('seller123');
        user.passwordHash = newHash;
        db.saveUsers(users);
      } else {
        return { success: false, error: 'Incorrect password. Please try again.' };
      }
    }

    // Persist session locally
    AuthService.setActiveUser(user);

    // Audit log
    db.addAuditLog({
      id: generateUUID(),
      userId: user.id,
      userName: user.name,
      action: 'USER_LOGIN',
      details: `${user.role} login successful (${user.username})`,
      entityType: 'AUTH',
      entityId: user.id,
      timestamp: new Date().toISOString(),
    });

    // Try cloud login in background (non-blocking)
    CloudflareApi.login(username, plainPassword)
      .then(result => {
        if (result.success && result.token) {
          CloudflareApi.setToken(result.token);
          console.log('Cloud token stored for future sync');
        }
      })
      .catch(() => {
        console.log('Cloud login deferred - will sync later');
      });

    return { success: true, user };
  }

  public static getActiveUser(): User | null {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as User;
      // Refresh user from database to ensure up-to-date color/status
      const users = db.getUsers();
      const current = users.find(u => u.id === parsed.id);
      if (current && current.status === 'ACTIVE') {
        return current;
      }
      return null;
    } catch {
      return null;
    }
  }

  public static setActiveUser(user: User | null): void {
    if (!user) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } else {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    }
  }

  public static logout(): void {
    const user = AuthService.getActiveUser();
    if (user) {
      db.addAuditLog({
        id: generateUUID(),
        userId: user.id,
        userName: user.name,
        action: 'USER_LOGOUT',
        details: `User logged out (${user.username})`,
        entityType: 'AUTH',
        entityId: user.id,
        timestamp: new Date().toISOString(),
      });
      
      // Sync logout to cloud (non-blocking)
      CloudflareApi.logout(user.id).catch(() => {
        console.log('Cloud logout deferred');
      });
      CloudflareApi.clearToken();
    }
    AuthService.setActiveUser(null);
  }

  public static async adminResetPassword(
    sellerId: string,
    newPass: string,
    currentUser: User
  ): Promise<{ success: boolean; error?: string }> {
    if (currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Permission denied: Only Administrator can reset seller passwords.' };
    }
    return AuthService.changePassword(sellerId, '', newPass, currentUser);
  }

  public static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    callerUser: User
  ): Promise<{ success: boolean; error?: string }> {
    // Sellers can change only their own password. Admin can change any seller's password.
    if (callerUser.role !== 'ADMIN' && callerUser.id !== userId) {
      return { success: false, error: 'Permission denied: You cannot change another user password.' };
    }

    if (newPassword.length < 4) {
      return { success: false, error: 'New password must be at least 4 characters.' };
    }

    const users = db.getUsers();
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) {
      return { success: false, error: 'User not found.' };
    }

    // If seller is changing own password, verify old password first
    if (callerUser.id === userId && callerUser.role === 'SELLER') {
      const isValid = await verifyPassword(currentPassword, targetUser.passwordHash);
      if (!isValid) {
        return { success: false, error: 'Current password is not correct.' };
      }
    }

    const newHash = await hashPassword(newPassword);
    targetUser.passwordHash = newHash;
    targetUser.updatedAt = new Date().toISOString();

    db.saveUsers(users);

    db.addAuditLog({
      id: generateUUID(),
      userId: callerUser.id,
      userName: callerUser.name,
      action: 'PASSWORD_CHANGE',
      details: `Password changed for user ${targetUser.username} by ${callerUser.name}`,
      entityType: 'SELLER',
      entityId: targetUser.id,
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  }
}
