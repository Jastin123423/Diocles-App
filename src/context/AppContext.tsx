import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { db, DatabaseState } from '../db/storage';
import { AuthService } from '../services/authService';
import { SyncService, SyncState } from '../services/syncService';
import { CloudflareApi } from '../services/cloudflareApi';
import { User, Sale, ToastMessage, Shop } from '../types';
import { getColorOption } from '../utils/colors';
import { generateUUID } from '../utils/crypto';

interface AppContextType {
  currentUser: User | null;
  dbState: DatabaseState;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  login: (user: User) => void;
  logout: () => void;
  refreshUser: () => void;
  // Shop context
  selectedShopId: string;
  setSelectedShopId: (shopId: string) => void;
  currentShop: Shop | null;
  availableShops: Shop[];
  // Toast notifications
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  // Receipt modal
  activeReceipt: Sale | null;
  showReceipt: (sale: Sale) => void;
  closeReceipt: () => void;
  // Sync status
  syncStatus: { state: SyncState; pendingCount: number };
  triggerSync: () => Promise<void>;
  // Settings
  updateSettings: (settings: any) => void;
  // Seller color theme
  sellerColor: ReturnType<typeof getColorOption>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => AuthService.getActiveUser());
  const [dbState, setDbState] = useState<DatabaseState>(() => db.getState());
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [activeReceipt, setActiveReceipt] = useState<Sale | null>(null);
  const [syncStatus, setSyncStatus] = useState(SyncService.getSyncStatus());
  const [selectedShopId, setSelectedShopIdState] = useState<string>(() => {
    const saved = localStorage.getItem('diocres_selected_shop_id');
    return saved || 'ALL';
  });
  
  const isSyncingRef = useRef<boolean>(false);
  const lastPullTimeRef = useRef<number>(0);
  const PULL_INTERVAL = 60000; // 60 seconds between pulls

  const setSelectedShopId = (shopId: string) => {
    setSelectedShopIdState(shopId);
    localStorage.setItem('diocres_selected_shop_id', shopId);
  };

  // Available shops based on current user
  const availableShops = useMemo(() => {
    const allShops = dbState.shops || [];
    if (!currentUser) return allShops;

    if (currentUser.role === 'ADMIN') {
      return allShops;
    }

    const assigned = currentUser.assignedShopIds || [];
    return allShops.filter(s => s.status === 'ACTIVE' && assigned.includes(s.id));
  }, [dbState.shops, currentUser]);

  // Current Shop entity
  const currentShop = useMemo(() => {
    if (selectedShopId === 'ALL') return null;
    return (dbState.shops || []).find(s => s.id === selectedShopId) || null;
  }, [dbState.shops, selectedShopId]);

  // Listen to LocalDB changes and sync React state
  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      const state = db.getState();
      setDbState({ ...state });
      setSyncStatus(SyncService.getSyncStatus());

      if (currentUser) {
        const freshUser = state.users.find(u => u.id === currentUser.id);
        if (freshUser) {
          if (freshUser.status !== 'ACTIVE') {
            AuthService.logout();
            setCurrentUser(null);
            setToasts(prev => [...prev, {
              id: Date.now().toString(),
              type: 'warning',
              title: 'Account Deactivated',
              description: 'Your seller account has been deactivated by an Administrator.',
            }]);
          } else {
            setCurrentUser(freshUser);
            AuthService.setActiveUser(freshUser);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  // OPTIMIZED SYNC: 
  // - Push pending items immediately (if any)
  // - Pull only every 60 seconds (not every 2 seconds)
  useEffect(() => {
    const liveSync = async () => {
      if (isSyncingRef.current) return;
      
      try {
        const online = await CloudflareApi.checkConnection();
        
        if (online) {
          isSyncingRef.current = true;
          
          const pendingCount = SyncService.getPendingCount();
          const now = Date.now();
          const timeSinceLastPull = now - lastPullTimeRef.current;
          const shouldPull = timeSinceLastPull >= PULL_INTERVAL;
          
          // PUSH: Always push if there are pending items
          if (pendingCount > 0) {
            await SyncService.processSyncQueue(currentUser || undefined);
          }
          
          // PULL: Only pull every 60 seconds
          if (shouldPull) {
            const pullResult = await CloudflareApi.pullSync();
            
            if (pullResult.success && pullResult.data) {
              SyncService.applyCloudData(pullResult.data);
              
              const nowISO = new Date().toISOString();
              localStorage.setItem('omnibiz_last_synced_at', nowISO);
              
              const state = db.getState();
              setDbState({ ...state });
              setSyncStatus(SyncService.getSyncStatus());
            }
            
            lastPullTimeRef.current = now;
          }
          
          isSyncingRef.current = false;
        }
      } catch (error) {
        console.log('[LiveSync] Error:', error);
        isSyncingRef.current = false;
      }
    };

    // Initial check
    liveSync();
    
    // Check every 10 seconds for pending pushes
    // But only pull every 60 seconds
    const interval = setInterval(liveSync, 10000);
    
    return () => clearInterval(interval);
  }, [currentUser]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('[LiveSync] Connection restored');
      if (currentUser) {
        SyncService.processSyncQueue(currentUser).then(() => {
          const state = db.getState();
          setDbState({ ...state });
          setSyncStatus(SyncService.getSyncStatus());
        });
      }
    };

    const handleOffline = () => {
      console.log('[LiveSync] Connection lost');
      setSyncStatus({ state: 'OFFLINE_LOCAL', pendingCount: SyncService.getPendingCount() });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [currentUser]);

  // Ensure seller has a valid shop selected
  useEffect(() => {
    if (!currentUser) return;

    if (currentUser.role === 'SELLER') {
      const sellerShops = (dbState.shops || []).filter(
        s => s.status === 'ACTIVE' && (currentUser.assignedShopIds || []).includes(s.id)
      );

      if (sellerShops.length > 0) {
        const isCurrentValid = sellerShops.some(s => s.id === selectedShopId);
        if (!isCurrentValid || selectedShopId === 'ALL') {
          setSelectedShopId(sellerShops[0].id);
        }
      }
    }
  }, [currentUser, dbState.shops, selectedShopId]);

  const refreshUser = () => {
    const u = AuthService.getActiveUser();
    setCurrentUser(u);
  };

  const login = (user: User) => {
    AuthService.setActiveUser(user);
    setCurrentUser(user);

    if (user.role === 'ADMIN') {
      setActiveTab('dashboard');
    } else {
      setActiveTab('new_sale');
      const sellerShops = (dbState.shops || []).filter(
        s => s.status === 'ACTIVE' && (user.assignedShopIds || []).includes(s.id)
      );
      if (sellerShops.length > 0) {
        setSelectedShopId(sellerShops[0].id);
      }
    }

    addToast({
      type: 'success',
      title: `Welcome back, ${user.name}`,
      description: `Logged in as ${user.role}`,
    });
  };

  const logout = () => {
    AuthService.logout();
    setCurrentUser(null);
    setActiveTab('dashboard');
    addToast({
      type: 'info',
      title: 'Logged Out',
      description: 'Session ended securely.',
    });
  };

  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
    setToasts(prev => [...prev, { ...toast, id }]);

    setTimeout(() => {
      removeToast(id);
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const showReceipt = (sale: Sale) => {
    setActiveReceipt(sale);
  };

  const closeReceipt = () => {
    setActiveReceipt(null);
  };

  const triggerSync = async () => {
    setSyncStatus({ state: 'SYNCING', pendingCount: syncStatus.pendingCount });
    
    const res = await SyncService.processSyncQueue(currentUser || undefined);
    
    setSyncStatus(SyncService.getSyncStatus());
    
    if (res.success) {
      addToast({
        type: 'success',
        title: 'Synchronization Complete',
        description: res.processedCount > 0 
          ? `Synced ${res.processedCount} records to cloud.` 
          : 'All records up to date.',
      });
    } else {
      addToast({
        type: 'warning',
        title: 'Sync Status',
        description: res.message || 'Sync completed.',
      });
    }
  };

  const updateSettings = (newSettings: any) => {
    const currentSettings = db.getSettings();
    const updatedSettings = { ...currentSettings, ...newSettings };
    db.saveSettings(updatedSettings);
    
    db.enqueueSync({
      id: generateUUID(),
      operation: 'UPDATE_SETTINGS',
      entityType: 'SETTINGS',
      entityId: 'global',
      payload: updatedSettings,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });
    
    setDbState(db.getState());
    setSyncStatus(SyncService.getSyncStatus());
  };

  const sellerColor = useMemo(() => {
    return getColorOption(currentUser?.color || 'blue');
  }, [currentUser?.color]);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        dbState,
        activeTab,
        setActiveTab,
        login,
        logout,
        refreshUser,
        selectedShopId,
        setSelectedShopId,
        currentShop,
        availableShops,
        toasts,
        addToast,
        removeToast,
        activeReceipt,
        showReceipt,
        closeReceipt,
        syncStatus,
        triggerSync,
        updateSettings,
        sellerColor,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
