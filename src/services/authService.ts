// src/services/authService.ts (ENHANCED)
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
    // Check local database first (offline-first)
    const trimmedUsername = username.trim().toLowerCase();
    const users = db.getUsers();
    const user = users.find(u => u.username.toLowerCase() === trimmedUsername);

    if (!user) {
      // Try cloud login if offline local check fails
      const online = await CloudflareApi.checkConnection();
      if (online) {
        try {
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
            
            CloudflareApi.setToken(cloudResult.token);
            AuthService.setActiveUser(cloudUser);
            
            return { success: true, user: cloudUser };
          }
        } catch (error) {
          console.error('Cloud login failed:', error);
        }
      }
      
      return { success: false, error: 'Account not found. Please check your username.' };
    }

    if (user.status !== 'ACTIVE') {
      return { success: false, error: 'This account is currently inactive.' };
    }

    if (expectedRole && user.role !== expectedRole) {
      return { success: false, error: `This portal is restricted to ${expectedRole.toLowerCase()} accounts.` };
    }

    const isValid = await verifyPassword(plainPassword, user.passwordHash);
    if (!isValid) {
      return { success: false, error: 'Incorrect password.' };
    }

    // Set local session
    AuthService.setActiveUser(user);

    // Try cloud login in background
    CloudflareApi.login(username, plainPassword)
      .then(result => {
        if (result.success && result.token) {
          CloudflareApi.setToken(result.token);
        }
      })
      .catch(() => {
        console.log('Cloud login deferred - will sync later');
      });

    return { success: true, user };
  }

  // [Rest of methods remain similar, but with cloud sync added]

  public static logout(): void {
    const user = AuthService.getActiveUser();
    if (user) {
      // Sync logout to cloud
      CloudflareApi.logout(user.id).catch(() => {});
      CloudflareApi.clearToken();
      
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
    }
    AuthService.setActiveUser(null);
  }
}
