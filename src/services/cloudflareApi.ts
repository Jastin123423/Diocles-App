// src/services/cloudflareApi.ts (ENHANCED)
export interface CloudflareConfig {
  baseUrl: string;
  deviceId: string;
}

export class CloudflareApi {
  private static config: CloudflareConfig = {
    baseUrl: 'https://your-worker.workers.dev', // Replace with your actual Worker URL
    deviceId: localStorage.getItem('omnibiz_device_id') || (() => {
      const id = `device_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('omnibiz_device_id', id);
      return id;
    })(),
  };

  private static token: string | null = localStorage.getItem('omnibiz_auth_token');

  static setToken(token: string) {
    this.token = token;
    localStorage.setItem('omnibiz_auth_token', token);
  }

  static getToken(): string | null {
    return this.token;
  }

  static clearToken() {
    this.token = null;
    localStorage.removeItem('omnibiz_auth_token');
  }

  private static isOnline(): boolean {
    return navigator.onLine;
  }

  private static async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.isOnline()) {
      throw new Error('OFFLINE: Cannot reach cloud endpoint');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Device-ID': this.config.deviceId,
      ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
      ...(options.headers as Record<string, string>),
    };

    const response = await fetch(`${this.config.baseUrl}/api${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `API Error: ${response.status}`);
    }

    return await response.json();
  }

  // Check connectivity
  static async checkConnection(): Promise<boolean> {
    if (!this.isOnline()) return false;
    try {
      await this.request('/health');
      return true;
    } catch {
      return false;
    }
  }

  // ==========================================
  // AUTH
  // ==========================================
  static async login(username: string, password: string) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  static async logout(userId: string) {
    return this.request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  // ==========================================
  // SHOPS
  // ==========================================
  static async getShops(status?: string) {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    return this.request(`/shops?${params}`);
  }

  static async createShop(shop: any) {
    return this.request('/shops', {
      method: 'POST',
      body: JSON.stringify(shop),
    });
  }

  static async updateShop(id: string, shop: any) {
    return this.request(`/shops/${id}`, {
      method: 'PUT',
      body: JSON.stringify(shop),
    });
  }

  static async getShop(id: string) {
    return this.request(`/shops/${id}`);
  }

  // ==========================================
  // PRODUCTS
  // ==========================================
  static async getProducts(filters?: {
    shopId?: string;
    status?: string;
    categoryId?: string;
    search?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.shopId) params.append('shopId', filters.shopId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    if (filters?.search) params.append('search', filters.search);
    return this.request(`/products?${params}`);
  }

  static async createProduct(product: any) {
    return this.request('/products', {
      method: 'POST',
      body: JSON.stringify(product),
    });
  }

  static async updateProduct(id: string, product: any) {
    return this.request(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(product),
    });
  }

  static async getProduct(id: string) {
    return this.request(`/products/${id}`);
  }

  // ==========================================
  // CATEGORIES
  // ==========================================
  static async getCategories(shopId?: string) {
    const params = new URLSearchParams();
    if (shopId) params.append('shopId', shopId);
    return this.request(`/categories?${params}`);
  }

  static async createCategory(category: any) {
    return this.request('/categories', {
      method: 'POST',
      body: JSON.stringify(category),
    });
  }

  // ==========================================
  // SALES
  // ==========================================
  static async getSales(filters?: {
    shopId?: string;
    sellerId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.shopId) params.append('shopId', filters.shopId);
    if (filters?.sellerId) params.append('sellerId', filters.sellerId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.search) params.append('search', filters.search);
    return this.request(`/sales?${params}`);
  }

  static async createSale(sale: any) {
    return this.request('/sales', {
      method: 'POST',
      body: JSON.stringify(sale),
    });
  }

  static async voidSale(id: string, voidReason: string, voidedBy: string) {
    return this.request(`/sales/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ voidReason, voidedBy }),
    });
  }

  // ==========================================
  // PURCHASES
  // ==========================================
  static async getPurchases(shopId?: string) {
    const params = new URLSearchParams();
    if (shopId) params.append('shopId', shopId);
    return this.request(`/purchases?${params}`);
  }

  static async createPurchase(purchase: any) {
    return this.request('/purchases', {
      method: 'POST',
      body: JSON.stringify(purchase),
    });
  }

  // ==========================================
  // EXPENSES
  // ==========================================
  static async getExpenses(shopId?: string, category?: string) {
    const params = new URLSearchParams();
    if (shopId) params.append('shopId', shopId);
    if (category) params.append('category', category);
    return this.request(`/expenses?${params}`);
  }

  static async createExpense(expense: any) {
    return this.request('/expenses', {
      method: 'POST',
      body: JSON.stringify(expense),
    });
  }

  // ==========================================
  // INVENTORY
  // ==========================================
  static async getMovements(productId?: string, shopId?: string) {
    const params = new URLSearchParams();
    if (productId) params.append('productId', productId);
    if (shopId) params.append('shopId', shopId);
    return this.request(`/inventory/movements?${params}`);
  }

  static async createMovement(movement: any) {
    return this.request('/inventory/movements', {
      method: 'POST',
      body: JSON.stringify(movement),
    });
  }

  static async getValuation(shopId?: string) {
    const params = new URLSearchParams();
    if (shopId) params.append('shopId', shopId);
    return this.request(`/inventory/valuation?${params}`);
  }

  // ==========================================
  // DEBTS
  // ==========================================
  static async getDebts(type?: string, status?: string) {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (status) params.append('status', status);
    return this.request(`/debts?${params}`);
  }

  static async createDebt(debt: any) {
    return this.request('/debts', {
      method: 'POST',
      body: JSON.stringify(debt),
    });
  }

  static async addDebtPayment(debtId: string, payment: any) {
    return this.request(`/debts/${debtId}/payments`, {
      method: 'POST',
      body: JSON.stringify(payment),
    });
  }

  // ==========================================
  // NOTIFICATIONS
  // ==========================================
  static async getNotifications(userId: string, role: string) {
    const params = new URLSearchParams();
    params.append('userId', userId);
    params.append('role', role);
    return this.request(`/notifications?${params}`);
  }

  static async createNotification(notification: any) {
    return this.request('/notifications', {
      method: 'POST',
      body: JSON.stringify(notification),
    });
  }

  static async markNotificationRead(notificationId: string, userId: string) {
    return this.request('/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ notificationId, userId }),
    });
  }

  // ==========================================
  // SETTINGS
  // ==========================================
  static async getSettings() {
    return this.request('/settings');
  }

  static async updateSettings(settings: any) {
    return this.request('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // ==========================================
  // R2 FILE OPERATIONS
  // ==========================================
  static async uploadFile(file: File | Blob, productId: string, imageOrder: number) {
    if (!this.isOnline()) {
      throw new Error('OFFLINE: Cannot upload file');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('productId', productId);
    formData.append('imageOrder', imageOrder.toString());

    const response = await fetch(`${this.config.baseUrl}/api/r2/upload`, {
      method: 'POST',
      headers: {
        'X-Device-ID': this.config.deviceId,
        ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    return await response.json();
  }

  static getFileUrl(key: string): string {
    return `${this.config.baseUrl}/api/r2/files/${key}`;
  }

  static async deleteFile(key: string) {
    return this.request(`/r2/files/${key}`, { method: 'DELETE' });
  }
}
