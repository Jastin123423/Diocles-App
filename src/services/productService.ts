import { db } from '../db/storage';
import { Product, ProductImage, ProductStatus, User } from '../types';
import { generateUUID } from '../utils/crypto';
import { normalizeProductImages } from '../utils/imageUtils';

export class ProductService {
  public static getProducts(options?: {
    shopId?: string;
    categoryId?: string;
    search?: string;
    status?: ProductStatus | 'ALL';
    lowStockOnly?: boolean;
  }): Product[] {
    let products = db.getProducts();

    if (options?.shopId && options.shopId !== 'ALL') {
      products = products.filter(p => p.shopId === options.shopId);
    }

    if (options?.status && options.status !== 'ALL') {
      products = products.filter(p => p.status === options.status);
    }

    if (options?.categoryId && options.categoryId !== 'ALL') {
      products = products.filter(p => p.categoryId === options.categoryId);
    }

    if (options?.search) {
      const q = options.search.toLowerCase().trim();
      products = products.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q)
      );
    }

    if (options?.lowStockOnly) {
      products = products.filter(p => p.currentStock <= p.minStock);
    }

    return products;
  }

  public static getProductById(id: string): Product | undefined {
    return db.getProducts().find(p => p.id === id);
  }

  public static getProductByBarcode(barcode: string, shopId?: string): Product | undefined {
    return db.getProducts().find(p => {
      const match = p.barcode === barcode && p.status === 'ACTIVE';
      if (!match) return false;
      if (shopId && shopId !== 'ALL') return p.shopId === shopId;
      return true;
    });
  }

  /**
   * Seller or Admin can create a new product.
   * Associated with the target shop.
   */
  public static createProduct(
    data: {
      shopId: string;
      name: string;
      sku?: string;
      barcode?: string;
      categoryId: string;
      sellingPrice: number;
      purchasePrice?: number;
      currentStock: number;
      minStock?: number;
      unit?: string;
      status?: ProductStatus;
      images?: ProductImage[];
      imageUrl?: string;
    },
    currentUser: User
  ): { success: boolean; product?: Product; error?: string } {
    if (!data.name?.trim()) {
      return { success: false, error: 'Product name is required.' };
    }

    if (!data.shopId) {
      return { success: false, error: 'Shop assignment is required for the product.' };
    }

    const shop = db.getShops().find(s => s.id === data.shopId);
    if (!shop) {
      return { success: false, error: 'Selected shop does not exist.' };
    }

    if (data.sellingPrice === undefined || data.sellingPrice < 0) {
      return { success: false, error: 'Valid selling price is required.' };
    }

    const products = db.getProducts();
    const cleanSku = data.sku?.trim() || `SKU-${Date.now().toString().slice(-6)}`;
    const cleanBarcode = data.barcode?.trim() || `${Math.floor(100000000000 + Math.random() * 900000000000)}`;

    // SKU uniqueness within the shop
    const duplicateSku = products.find(
      p => p.shopId === data.shopId && p.sku.toLowerCase() === cleanSku.toLowerCase()
    );
    if (duplicateSku) {
      return { success: false, error: `SKU '${cleanSku}' already exists in this shop.` };
    }

    const productId = generateUUID();
    const normalizedImages = data.images && data.images.length > 0
      ? normalizeProductImages(data.images.map(img => ({ ...img, productId })))
      : undefined;

    const mainImageUrl = normalizedImages && normalizedImages.length > 0
      ? (normalizedImages[0].thumbnailUrl || normalizedImages[0].dataUrl)
      : data.imageUrl;

    const newProduct: Product = {
      id: productId,
      shopId: data.shopId,
      name: data.name.trim(),
      sku: cleanSku,
      barcode: cleanBarcode,
      categoryId: data.categoryId || 'cat-supplies',
      sellingPrice: Number(data.sellingPrice),
      purchasePrice: Number(data.purchasePrice || 0),
      currentStock: Number(data.currentStock || 0),
      minStock: Number(data.minStock ?? 5),
      unit: data.unit?.trim() || 'pcs',
      status: data.status || 'ACTIVE',
      images: normalizedImages,
      imageUrl: mainImageUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [newProduct, ...products];
    db.saveProducts(updated);

    // If initial stock is greater than 0, record initial inventory movement with shopId
    if (newProduct.currentStock > 0) {
      db.saveMovements([
        {
          id: generateUUID(),
          shopId: newProduct.shopId,
          shopName: shop.name,
          productId: newProduct.id,
          productName: newProduct.name,
          previousQty: 0,
          changeQty: newProduct.currentStock,
          newQty: newProduct.currentStock,
          type: 'ADJUSTMENT',
          reason: `Initial stock opening in ${shop.name} by ${currentUser.name}`,
          userId: currentUser.id,
          userName: currentUser.name,
          createdAt: new Date().toISOString(),
        },
        ...db.getMovements(),
      ]);
    }

    // Sync queue item
    db.enqueueSync({
      id: generateUUID(),
      operation: 'CREATE_PRODUCT',
      entityType: 'PRODUCT',
      entityId: newProduct.id,
      payload: newProduct,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });

    // Audit log
    db.addAuditLog({
      id: generateUUID(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'CREATE_PRODUCT',
      details: `Created product '${newProduct.name}' in [${shop.name}] (SKU: ${newProduct.sku}, Stock: ${newProduct.currentStock})`,
      entityType: 'PRODUCT',
      entityId: newProduct.id,
      timestamp: new Date().toISOString(),
    });

    return { success: true, product: newProduct };
  }

  /**
   * Only Admin can edit existing products.
   */
  public static updateProduct(
    id: string,
    updates: Partial<Omit<Product, 'id' | 'createdAt'>>,
    currentUser: User
  ): { success: boolean; product?: Product; error?: string } {
    if (currentUser.role !== 'ADMIN') {
      return {
        success: false,
        error: 'Permission Denied: Sellers cannot edit existing products. Please request an Administrator.',
      };
    }

    const products = db.getProducts();
    const index = products.findIndex(p => p.id === id);
    if (index === -1) {
      return { success: false, error: 'Product not found.' };
    }

    const current = products[index];
    const targetShopId = updates.shopId || current.shopId;

    // If SKU changed, check uniqueness within shop
    if (updates.sku && updates.sku !== current.sku) {
      const dup = products.find(
        p => p.id !== id && p.shopId === targetShopId && p.sku.toLowerCase() === updates.sku!.toLowerCase()
      );
      if (dup) {
        return { success: false, error: `SKU '${updates.sku}' is already assigned in this shop.` };
      }
    }

    let finalImages = updates.images !== undefined ? updates.images : current.images;
    if (finalImages && finalImages.length > 0) {
      finalImages = normalizeProductImages(finalImages.map(img => ({ ...img, productId: id })));
    } else {
      finalImages = undefined;
    }

    const finalImageUrl = finalImages && finalImages.length > 0
      ? (finalImages[0].thumbnailUrl || finalImages[0].dataUrl)
      : (updates.imageUrl !== undefined ? updates.imageUrl : (finalImages ? undefined : current.imageUrl));

    const updatedProduct: Product = {
      ...current,
      ...updates,
      images: finalImages,
      imageUrl: finalImageUrl,
      updatedAt: new Date().toISOString(),
    };

    products[index] = updatedProduct;
    db.saveProducts(products);

    // Sync queue
    db.enqueueSync({
      id: generateUUID(),
      operation: 'UPDATE_PRODUCT',
      entityType: 'PRODUCT',
      entityId: id,
      payload: updatedProduct,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });

    // Audit log
    db.addAuditLog({
      id: generateUUID(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'UPDATE_PRODUCT',
      details: `Updated product '${updatedProduct.name}' (Price: $${updatedProduct.sellingPrice})`,
      entityType: 'PRODUCT',
      entityId: id,
      timestamp: new Date().toISOString(),
    });

    return { success: true, product: updatedProduct };
  }

  /**
   * Toggle Product Active/Inactive status.
   * Admin only. Permanent deletion is avoided to preserve historical sales.
   */
  public static toggleProductStatus(
    id: string,
    newStatus: ProductStatus,
    currentUser: User
  ): { success: boolean; error?: string } {
    if (currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Permission Denied: Only Admin can change product status.' };
    }

    return this.updateProduct(id, { status: newStatus }, currentUser);
  }
}
