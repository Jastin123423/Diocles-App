export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-ID',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ 
    message: 'Sync push endpoint. Use POST method.',
    example: { deviceId: 'test', operations: [] }
  }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function onRequestPost(context: any) {
  const { request, env } = context;
  
  try {
    const { deviceId, operations } = await request.json();
    
    if (!operations || !Array.isArray(operations)) {
      return new Response(JSON.stringify({ error: 'Invalid sync payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const results = [];
    const errors = [];

    for (const op of operations) {
      try {
        const result = await processOperation(env.DB, op);
        results.push({ id: op.id, success: true, ...result });
      } catch (error: any) {
        errors.push({ id: op.id, error: error.message });
      }
    }

    return new Response(JSON.stringify({
      success: errors.length === 0,
      processedCount: results.length,
      failedCount: errors.length,
      results,
      errors,
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

async function processOperation(db: any, op: any) {
  const { operation, payload } = op;

  switch (operation) {
    case 'CREATE_SHOP':
    case 'UPDATE_SHOP':
    case 'TOGGLE_SHOP_STATUS':
      await upsertShop(db, payload);
      break;
    
    case 'CREATE_PRODUCT':
    case 'UPDATE_PRODUCT':
    case 'TOGGLE_PRODUCT_STATUS':
      await upsertProduct(db, payload);
      break;
    
    case 'CREATE_CATEGORY':
    case 'UPDATE_CATEGORY':
      await upsertCategory(db, payload);
      break;
    
    case 'CREATE_SALE':
      await createSale(db, payload);
      break;
    
    case 'VOID_SALE':
      await voidSale(db, payload);
      break;
    
    case 'CREATE_PURCHASE':
      await createPurchase(db, payload);
      break;
    
    case 'CREATE_EXPENSE':
      await createExpense(db, payload);
      break;
    
    case 'CREATE_SELLER':
    case 'UPDATE_SELLER':
      await upsertUser(db, payload);
      break;
    
    case 'STOCK_ADJUSTMENT':
      await recordStockAdjustment(db, payload);
      break;
    
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }

  return { entityType: op.entityType, entityId: op.entityId };
}

async function upsertShop(db: any, shop: any) {
  await db.prepare(`
    INSERT INTO shops (id, name, code, description, address, phone, status, color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      code = excluded.code,
      description = excluded.description,
      address = excluded.address,
      phone = excluded.phone,
      status = excluded.status,
      color = excluded.color,
      updated_at = excluded.updated_at
  `).bind(
    shop.id, shop.name, shop.code || null, shop.description || null,
    shop.address || null, shop.phone || null, shop.status || 'ACTIVE',
    shop.color || null, shop.createdAt || new Date().toISOString(),
    shop.updatedAt || new Date().toISOString()
  ).run();
}

async function upsertProduct(db: any, product: any) {
  await db.prepare(`
    INSERT INTO products (
      id, shop_id, name, sku, barcode, category_id,
      selling_price, proposed_selling_price, purchase_price,
      current_stock, min_stock, unit, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      shop_id = excluded.shop_id,
      name = excluded.name,
      sku = excluded.sku,
      barcode = excluded.barcode,
      category_id = excluded.category_id,
      selling_price = excluded.selling_price,
      proposed_selling_price = excluded.proposed_selling_price,
      purchase_price = excluded.purchase_price,
      current_stock = excluded.current_stock,
      min_stock = excluded.min_stock,
      unit = excluded.unit,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).bind(
    product.id, product.shopId, product.name, product.sku, product.barcode || null,
    product.categoryId, product.sellingPrice || 0, product.proposedSellingPrice || null,
    product.purchasePrice || 0, product.currentStock || 0, product.minStock || 5,
    product.unit || 'pcs', product.status || 'ACTIVE',
    product.createdAt || new Date().toISOString(), product.updatedAt || new Date().toISOString()
  ).run();
}

async function upsertCategory(db: any, category: any) {
  await db.prepare(`
    INSERT INTO categories (id, shop_id, name, icon, color, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      shop_id = excluded.shop_id,
      name = excluded.name,
      icon = excluded.icon,
      color = excluded.color,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).bind(
    category.id, category.shopId, category.name, category.icon || null,
    category.color || null, category.status || 'ACTIVE',
    category.createdAt || new Date().toISOString(), category.updatedAt || new Date().toISOString()
  ).run();
}

async function createSale(db: any, sale: any) {
  await db.prepare(`
    INSERT INTO sales (
      id, receipt_number, shop_id, shop_name, seller_id, seller_name,
      subtotal, discount, tax, total, cost_of_goods, gross_profit,
      payment_method, amount_received, change, status, notes, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).bind(
    sale.id, sale.receiptNumber, sale.shopId, sale.shopName || null,
    sale.sellerId, sale.sellerName, sale.subtotal || 0, sale.discount || 0,
    sale.tax || 0, sale.total || 0, sale.costOfGoods || 0, sale.grossProfit || 0,
    sale.paymentMethod, sale.amountReceived || 0, sale.change || 0,
    sale.status || 'COMPLETED', sale.notes || null, sale.createdAt || new Date().toISOString()
  ).run();

  for (const item of (sale.items || [])) {
    await db.prepare(`
      INSERT INTO sale_items (
        id, sale_id, shop_id, product_id, product_name, sku,
        unit_price, purchase_price, quantity, discount, total
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      item.id || crypto.randomUUID(), sale.id, item.shopId || sale.shopId,
      item.productId, item.productName, item.sku, item.unitPrice || 0,
      item.purchasePrice || 0, item.quantity || 0, item.discount || 0, item.total || 0
    ).run();
  }
}

async function voidSale(db: any, payload: any) {
  await db.prepare(`
    UPDATE sales SET status = 'VOIDED', void_reason = ?, voided_at = ?, voided_by = ?
    WHERE id = ?
  `).bind(
    payload.voidReason || '', payload.voidedAt || new Date().toISOString(),
    payload.voidedBy || '', payload.saleId || payload.id
  ).run();
}

async function createPurchase(db: any, purchase: any) {
  await db.prepare(`
    INSERT INTO purchases (
      id, purchase_number, shop_id, shop_name, supplier_name, date,
      total_amount, payment_status, notes, invoice_number,
      created_by_user_id, created_by_name, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).bind(
    purchase.id, purchase.purchaseNumber, purchase.shopId, purchase.shopName || null,
    purchase.supplierName, purchase.date || new Date().toISOString().slice(0, 10),
    purchase.totalAmount || 0, purchase.paymentStatus || 'PAID', purchase.notes || null,
    purchase.invoiceNumber || null, purchase.createdByUserId, purchase.createdByName,
    purchase.createdAt || new Date().toISOString()
  ).run();

  for (const item of (purchase.items || [])) {
    await db.prepare(`
      INSERT INTO purchase_items (id, purchase_id, product_id, product_name, quantity, unit_cost, total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      item.id || crypto.randomUUID(), purchase.id, item.productId, item.productName,
      item.quantity || 0, item.unitCost || 0, item.total || 0
    ).run();
  }
}

async function createExpense(db: any, expense: any) {
  await db.prepare(`
    INSERT INTO expenses (
      id, shop_id, shop_name, is_company_expense, category, description,
      title, amount, payment_method, date, reference, notes,
      created_by_user_id, created_by_name, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).bind(
    expense.id, expense.shopId || null, expense.shopName || null,
    expense.isCompanyExpense ? 1 : 0, expense.category, expense.description || '',
    expense.title || null, expense.amount || 0, expense.paymentMethod || 'CASH',
    expense.date || new Date().toISOString().slice(0, 10), expense.reference || null,
    expense.notes || null, expense.createdByUserId, expense.createdByName,
    expense.createdAt || new Date().toISOString()
  ).run();
}

async function upsertUser(db: any, user: any) {
  await db.prepare(`
    INSERT INTO users (
      id, username, name, role, password_hash, color, status,
      assigned_shop_ids, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      color = excluded.color,
      status = excluded.status,
      assigned_shop_ids = excluded.assigned_shop_ids,
      updated_at = excluded.updated_at
  `).bind(
    user.id, user.username || user.id, user.name, user.role || 'SELLER',
    user.passwordHash || '', user.color || 'blue', user.status || 'ACTIVE',
    JSON.stringify(user.assignedShopIds || []),
    user.createdAt || new Date().toISOString(), user.updatedAt || new Date().toISOString()
  ).run();
}

async function recordStockAdjustment(db: any, movement: any) {
  await db.prepare(`
    INSERT INTO inventory_movements (
      id, shop_id, shop_name, product_id, product_name,
      previous_qty, change_qty, new_qty, type, reason, cost_value,
      reference_id, user_id, user_name, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).bind(
    movement.id || crypto.randomUUID(), movement.shopId, movement.shopName || null,
    movement.productId, movement.productName, movement.previousQty || 0,
    movement.changeQty || 0, movement.newQty || 0, movement.type || 'ADJUSTMENT',
    movement.reason || '', movement.costValue || null, movement.referenceId || null,
    movement.userId, movement.userName, movement.createdAt || new Date().toISOString()
  ).run();

  await db.prepare(`
    UPDATE products SET current_stock = ?, updated_at = ? WHERE id = ?
  `).bind(movement.newQty, new Date().toISOString(), movement.productId).run();
}
