// src/services/productImageSync.ts
import { CloudflareApi } from './cloudflareApi';
import { Product, ProductImage } from '../types';

export class ProductImageSync {
  
  // Check if image needs sync
  static needsSync(image: ProductImage): boolean {
    return !image.syncStatus || image.syncStatus === 'LOCAL_ONLY' || image.syncStatus === 'MODIFIED_LOCALLY';
  }

  // Sync product images to R2
  static async syncProductImages(product: Product): Promise<{
    success: boolean;
    syncedCount: number;
    failedCount: number;
  }> {
    if (!product.images || product.images.length === 0) {
      return { success: true, syncedCount: 0, failedCount: 0 };
    }

    let synced = 0;
    let failed = 0;

    for (const image of product.images) {
      if (!this.needsSync(image)) continue;

      try {
        // Convert base64 to Blob
        const blob = this.base64ToBlob(image.dataUrl, image.mimeType);
        
        // Upload to R2
        const result = await CloudflareApi.uploadFile(
          blob,
          product.id,
          image.imageOrder
        );

        if (result.success) {
          synced++;
          // Update image with R2 key and sync status
          image.r2Key = result.key;
          image.syncStatus = 'SYNCED';
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to sync image ${image.imageId}:`, error);
        failed++;
        image.syncStatus = 'LOCAL_ONLY';
      }
    }

    return { success: failed === 0, syncedCount: synced, failedCount: failed };
  }

  // Convert base64 data URL to Blob
  private static base64ToBlob(dataUrl: string, mimeType: string): Blob {
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    
    return new Blob([array], { type: mimeType });
  }

  // Get image URL from R2
  static getCloudImageUrl(image: ProductImage): string {
    if (image.r2Key) {
      return CloudflareApi.getFileUrl(image.r2Key);
    }
    return image.dataUrl; // Fallback to local
  }
}
