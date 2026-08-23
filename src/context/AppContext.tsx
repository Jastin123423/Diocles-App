import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { db, DatabaseState } from '../db/storage';
import { AuthService } from '../services/authService';
import { SyncService, SyncState } from '../services/syncService';
import { User, Sale, ToastMessage, Shop } from '../types';
import { getColorOption } from '../utils/colors';

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

    // For Seller, only active shops they are assigned to
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

      // If user is logged in, refresh their current state
      if (currentUser) {
        const freshUser = state.users.find(u => u.id === currentUser.id);
        if (freshUser) {
          if (freshUser.status !== 'ACTIVE') {
            // Force logout if account deactivated by admin
            AuthService.logout();
            setCurrentUser(null);
            setToasts(prev => [
              ...prev,
              {
                id: Date.now().toString(),
                type: 'warning',
                title: 'Account Deactivated',
                description: 'Your seller account has been deactivated by an Administrator.',
              },
            ]);
          } else {
            setCurrentUser(freshUser);
            AuthService.setActiveUser(freshUser);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Ensure seller has a valid shop selected
  useEffect(() => {
    if (!currentUser) return;

    if (currentUser.role === 'SELLER') {
      const sellerShops = (dbState.shops || []).filter(
        s => s.status === 'ACTIVE' && (currentUser.assignedShopIds || []).includes(s.id)
      );

      if (sellerShops.length > 0) {
        // If current selection is 'ALL' or not in seller's shops, auto select first assigned shop
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
      // Keep previous shop selection or 'ALL'
    } else {
      setActiveTab('new_sale'); // sellers land directly on fast POS
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
      description: `Logged in to Windows ${user.role} Portal (Offline-Ready)`,
    });
  };

  const logout = () => {
    AuthService.logout();
    setCurrentUser(null);
    setActiveTab('dashboard');
    addToast({
      type: 'info',
      title: 'Logged Out',
      description: 'Session ended securely. Local data remains saved.',
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
    const res = await SyncService.simulateServerSync();
    setSyncStatus(SyncService.getSyncStatus());
    if (res.success) {
      addToast({
        type: 'success',
        title: 'Synchronization Complete',
        description: res.syncedCount > 0 ? `Synced ${res.syncedCount} queued records to server simulation.` : 'All local records are up to date.',
      });
    }
  };

  // Dynamically resolve seller color
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
