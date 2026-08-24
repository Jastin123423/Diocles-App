// src/services/cloudflareApi.ts (R2 methods)

export class CloudflareApi {
  // ... existing code ...

  // Upload file to R2 (MEDIA_BUCKET)
  static async uploadFile(
    file: File | Blob,
    productId: string,
    imageOrder: number
  ): Promise<{ success: boolean; key: string; size: number; mimeType: string }> {
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
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    return await response.json();
  }

  // Upload backup to R2
  static async uploadBackup(
    backupFile: Blob
  ): Promise<{ success: boolean; key: string; size: number }> {
    if (!this.isOnline()) {
      throw new Error('OFFLINE: Cannot upload backup');
    }

    const formData = new FormData();
    formData.append('backup', backupFile);

    const response = await fetch(`${this.config.baseUrl}/api/r2/backup`, {
      method: 'POST',
      headers: {
        'X-Device-ID': this.config.deviceId,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Backup upload failed: ${response.status}`);
    }

    return await response.json();
  }

  // Get R2 file URL
  static getFileUrl(key: string): string {
    return `${this.config.baseUrl}/api/r2/files/${key}`;
  }

  // Delete R2 file
  static async deleteFile(key: string): Promise<boolean> {
    if (!this.isOnline()) return false;

    try {
      await this.request(`/r2/files/${key}`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  }

  // List backups
  static async listBackups(): Promise<any[]> {
    const result = await this.request('/r2/backups');
    return result.backups || [];
  }
}
