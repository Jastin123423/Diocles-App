// src/services/cloudflareApi.ts (SAFE VERSION)
export interface CloudflareConfig {
  baseUrl: string;
  deviceId: string;
}

export class CloudflareApi {
  private static config: CloudflareConfig = {
    baseUrl: 'https://your-worker.workers.dev', // UPDATE THIS LATER
    deviceId: '',
  };

  private static getDeviceId(): string {
    if (!this.config.deviceId) {
      const stored = localStorage.getItem('omnibiz_device_id');
      if (stored) {
        this.config.deviceId = stored;
      } else {
        this.config.deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        localStorage.setItem('omnibiz_device_id', this.config.deviceId);
      }
    }
    return this.config.deviceId;
  }

  private static isOnline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine;
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
      'X-Device-ID': this.getDeviceId(),
      ...(options.headers as Record<string, string>),
    };

    const response = await fetch(`${this.config.baseUrl}/api${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    return await response.json();
  }

  static async checkConnection(): Promise<boolean> {
    if (!this.isOnline()) return false;
    try {
      await this.request('/health');
      return true;
    } catch {
      return false;
    }
  }

  static async pushSync(operations: any[]) {
    return this.request('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ deviceId: this.getDeviceId(), operations }),
    });
  }

  static async pullSync(since?: string, shopId?: string) {
    const params = new URLSearchParams();
    if (since) params.append('since', since);
    if (shopId && shopId !== 'ALL') params.append('shopId', shopId);
    return this.request(`/sync/pull?${params}`);
  }
}
