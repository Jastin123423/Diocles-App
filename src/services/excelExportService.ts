// src/services/excelExportService.ts
import * as XLSX from 'xlsx';
import { db } from '../db/storage';
import { Product } from '../types';

export interface ExcelExportResult {
  success: boolean;
  fileName: string;
  sheetCount?: number;
  rowCount?: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// These 4 headers match ExcelImportService.detectHeaders() exactly
// ─────────────────────────────────────────────────────────────
const IMPORT_HEADERS = ['Product Name', 'Buying Price', 'Selling Price', 'Quantity'];

function todayStamp(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function autoColWidths(rows: any[][]): { wch: number }[] {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, idx) => {
      const len = String(cell ?? '').length;
      widths[idx] = Math.max(widths[idx] || 0, len);
    });
  }
  return widths.map(w => ({ wch: Math.min(w + 2, 45) }));
}

/**
 * Builds the 4-column data row for a single product.
 * Same order as IMPORT_HEADERS.
 */
function productToRow(p: Product): (string | number)[] {
  return [
    p.name || '',
    p.purchasePrice ?? 0,
    p.sellingPrice ?? 0,
    p.currentStock ?? 0,
  ];
}

/**
 * Makes a sheet name safe for Excel:
 * - Max 31 chars
 * - Cannot contain: \ / ? * [ ] :
 * - Cannot be blank
 */
function sanitizeSheetName(raw: string): string {
  let s = String(raw || '').trim();
  s = s.replace(/[\\/?*[\]:]/g, '_');
  if (!s) s = 'Sheet';
  if (s.length > 31) s = s.slice(0, 31);
  return s;
}

/**
 * Ensures unique sheet names within a workbook (Excel rejects duplicates).
 */
function uniqueSheetName(existing: Set<string>, raw: string): string {
  let base = sanitizeSheetName(raw);
  if (!existing.has(base)) {
    existing.add(base);
    return base;
  }
  let i = 2;
  while (true) {
    const candidate = `${base.slice(0, 28)}_${i}`;
    if (!existing.has(candidate)) {
      existing.add(candidate);
      return candidate;
    }
    i++;
  }
}

export class ExcelExportService {
  // ─────────────────────────────────────────────────────────────
  // GROUP 1: All Products — 4 columns, single sheet
  // ─────────────────────────────────────────────────────────────
  public static exportAllProducts(shopId: string = 'ALL'): ExcelExportResult {
    try {
      const all = db.getProducts();
      const filtered =
        shopId === 'ALL' ? all : all.filter(p => p.shopId === shopId);

      if (filtered.length === 0) {
        return { success: false, fileName: '', error: 'No products to export.' };
      }

      const aoa: any[][] = [IMPORT_HEADERS, ...filtered.map(productToRow)];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = autoColWidths(aoa);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Products');

      const fileName = `products_${todayStamp()}.xlsx`;
      XLSX.writeFile(wb, fileName);

      return { success: true, fileName, sheetCount: 1, rowCount: filtered.length };
    } catch (err: any) {
      return { success: false, fileName: '', error: err.message || 'Export failed.' };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // GROUP 2: By Shop — 4 columns, one sheet per shop
  // ─────────────────────────────────────────────────────────────
  public static exportByShop(): ExcelExportResult {
    try {
      const products = db.getProducts();
      const shops = db.getShops();

      if (products.length === 0 || shops.length === 0) {
        return { success: false, fileName: '', error: 'No products or shops to export.' };
      }

      const wb = XLSX.utils.book_new();
      const usedSheetNames = new Set<string>();
      let totalRows = 0;

      for (const shop of shops) {
        const shopProducts = products.filter(p => p.shopId === shop.id);
        const sheetName = uniqueSheetName(usedSheetNames, shop.name || shop.code || 'Shop');

        if (shopProducts.length === 0) {
          // Empty shops still get a headers-only sheet for clarity
          const aoa: any[][] = [IMPORT_HEADERS];
          const ws = XLSX.utils.aoa_to_sheet(aoa);
          ws['!cols'] = autoColWidths(aoa);
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
          continue;
        }

        const aoa: any[][] = [IMPORT_HEADERS, ...shopProducts.map(productToRow)];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = autoColWidths(aoa);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        totalRows += shopProducts.length;
      }

      const fileName = `products_by_shop_${todayStamp()}.xlsx`;
      XLSX.writeFile(wb, fileName);

      return {
        success: true,
        fileName,
        sheetCount: usedSheetNames.size,
        rowCount: totalRows,
      };
    } catch (err: any) {
      return { success: false, fileName: '', error: err.message || 'Export failed.' };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // GROUP 3: By Category — 4 columns, one sheet per category
  // ─────────────────────────────────────────────────────────────
  public static exportByCategory(shopId: string = 'ALL'): ExcelExportResult {
    try {
      const allProducts = db.getProducts();
      const products =
        shopId === 'ALL' ? allProducts : allProducts.filter(p => p.shopId === shopId);

      const categories = db.getCategories() || [];

      if (products.length === 0) {
        return { success: false, fileName: '', error: 'No products to export.' };
      }

      // Group products by category
      const byCat = new Map<string, Product[]>();
      for (const p of products) {
        const key = p.categoryId || '__UNCATEGORIZED__';
        if (!byCat.has(key)) byCat.set(key, []);
        byCat.get(key)!.push(p);
      }

      const wb = XLSX.utils.book_new();
      const usedSheetNames = new Set<string>();
      let totalRows = 0;

      // Sort: named categories first (alphabetical), then Uncategorized last
      const catEntries = Array.from(byCat.entries()).sort(([a], [b]) => {
        if (a === '__UNCATEGORIZED__') return 1;
        if (b === '__UNCATEGORIZED__') return -1;
        const nameA = categories.find(c => c.id === a)?.name || a;
        const nameB = categories.find(c => c.id === b)?.name || b;
        return nameA.localeCompare(nameB);
      });

      for (const [catId, catProducts] of catEntries) {
        const catName =
          catId === '__UNCATEGORIZED__'
            ? 'Uncategorized'
            : categories.find(c => c.id === catId)?.name || 'Unknown';

        const sheetName = uniqueSheetName(usedSheetNames, catName);

        const aoa: any[][] = [IMPORT_HEADERS, ...catProducts.map(productToRow)];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = autoColWidths(aoa);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        totalRows += catProducts.length;
      }

      const fileName = `products_by_category_${todayStamp()}.xlsx`;
      XLSX.writeFile(wb, fileName);

      return {
        success: true,
        fileName,
        sheetCount: usedSheetNames.size,
        rowCount: totalRows,
      };
    } catch (err: any) {
      return { success: false, fileName: '', error: err.message || 'Export failed.' };
    }
  }
}
