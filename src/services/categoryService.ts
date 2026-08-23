import { db } from '../db/storage';
import { Category, User } from '../types';
import { generateUUID } from '../utils/crypto';

export class CategoryService {
  public static getCategories(activeOnly = false): Category[] {
    const cats = db.getCategories();
    if (activeOnly) {
      return cats.filter(c => c.status !== 'INACTIVE');
    }
    return cats;
  }

  public static createCategory(
    data: { name: string; icon?: string; color?: string },
    currentUser: User
  ): { success: boolean; category?: Category; error?: string } {
    if (currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Permission Denied: Only Admin can create categories.' };
    }

    if (!data.name.trim()) {
      return { success: false, error: 'Category name is required.' };
    }

    const categories = db.getCategories();
    if (categories.some(c => c.name.toLowerCase() === data.name.trim().toLowerCase())) {
      return { success: false, error: 'A category with this name already exists.' };
    }

    const newCategory: Category = {
      id: `cat-${generateUUID().slice(0, 8)}`,
      name: data.name.trim(),
      icon: data.icon || 'Package',
      color: data.color || '#3b82f6',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.saveCategories([...categories, newCategory]);

    db.addAuditLog({
      id: generateUUID(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'CREATE_CATEGORY',
      details: `Created category '${newCategory.name}'`,
      entityType: 'SETTINGS',
      entityId: newCategory.id,
      timestamp: new Date().toISOString(),
    });

    return { success: true, category: newCategory };
  }

  public static updateCategory(
    id: string,
    data: { name?: string; icon?: string; color?: string; status?: 'ACTIVE' | 'INACTIVE' },
    currentUser: User
  ): { success: boolean; category?: Category; error?: string } {
    if (currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Permission Denied: Only Admin can edit categories.' };
    }

    const categories = db.getCategories();
    const index = categories.findIndex(c => c.id === id);
    if (index === -1) {
      return { success: false, error: 'Category not found.' };
    }

    if (data.name && data.name.trim()) {
      const duplicate = categories.some(
        c => c.id !== id && c.name.toLowerCase() === data.name!.trim().toLowerCase()
      );
      if (duplicate) {
        return { success: false, error: 'Another category with this name already exists.' };
      }
    }

    const updatedCategory: Category = {
      ...categories[index],
      ...data,
      name: data.name ? data.name.trim() : categories[index].name,
      updatedAt: new Date().toISOString(),
    };

    categories[index] = updatedCategory;
    db.saveCategories([...categories]);

    db.addAuditLog({
      id: generateUUID(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'UPDATE_CATEGORY',
      details: `Updated category '${updatedCategory.name}' (Status: ${updatedCategory.status})`,
      entityType: 'SETTINGS',
      entityId: updatedCategory.id,
      timestamp: new Date().toISOString(),
    });

    return { success: true, category: updatedCategory };
  }

  public static toggleCategoryStatus(
    id: string,
    currentUser: User
  ): { success: boolean; category?: Category; error?: string } {
    const category = db.getCategories().find(c => c.id === id);
    if (!category) {
      return { success: false, error: 'Category not found.' };
    }

    const newStatus = category.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
    return this.updateCategory(id, { status: newStatus }, currentUser);
  }
}
