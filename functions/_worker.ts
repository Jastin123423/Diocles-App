// functions/_worker.ts
import { Router } from 'itty-router';
import { Env, corsHeaders, jsonResponse, authenticate } from './_middleware';

const router = Router({ base: '/api' });

// ==========================================
// HEALTH CHECK
// ==========================================
router.get('/health', async (request, env: Env) => {
  const dbCheck = await env.DB.prepare('SELECT 1 as ok').first();
  
  return jsonResponse({
    status: 'healthy',
    database: dbCheck ? 'connected' : 'error',
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// AUTH ENDPOINTS
// ==========================================
router.post('/auth/login', async (request, env: Env) => {
  const body = await request.json();
  const { username, password } = body;

  if (!username || !password) {
    return jsonResponse({ error: 'Username and password required' }, 400);
  }

  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND status = ?'
  ).bind(username, 'ACTIVE').first();

  if (!user) {
    return jsonResponse({ error: 'Invalid credentials' }, 401);
  }

  // In production, verify password hash properly
  // For now, return user data
  return jsonResponse({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      color: user.color,
      status: user.status,
      assignedShopIds: JSON.parse(user.assigned_shop_ids || '[]'),
    },
    token: `token_${user.id}_${Date.now()}`,
  });
});

router.post('/auth/logout', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const body = await request.json();
  const { userId } = body;

  await env.DB.prepare(`
    INSERT INTO audit_logs (id, user_id, user_name, action, details, entity_type, entity_id, timestamp)
    VALUES (?, ?, ?, 'USER_LOGOUT', ?, 'AUTH', ?, ?)
  `).bind(
    crypto.randomUUID(),
    userId,
    'User',
    `User logged out`,
    userId,
    new Date().toISOString()
  ).run();

  return jsonResponse({ success: true });
});

// ==========================================
// SHOPS ENDPOINTS
// ==========================================
router.get('/shops', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let query = 'SELECT * FROM shops WHERE 1=1';
  const params: any[] = [];

  if (status && status !== 'ALL') {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return jsonResponse(results);
});

router.post('/shops', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const shop = await request.json();
  const id = shop.id || crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
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
    id,
    shop.name,
    shop.code || null,
    shop.description || null,
    shop.address || null,
    shop.phone || null,
    shop.status || 'ACTIVE',
    shop.color || null,
    shop.createdAt || now,
    now
  ).run();

  return jsonResponse({ success: true, id });
});

router.get('/shops/:id', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const { id } = request.params;
  const shop = await env.DB.prepare('SELECT * FROM shops WHERE id = ?').bind(id).first();

  if (!shop) {
    return jsonResponse({ error: 'Shop not found' }, 404);
  }

  return jsonResponse(shop);
});

router.put('/shops/:id', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const { id } = request.params;
  const shop = await request.json();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE shops SET
      name = ?,
      code = ?,
      description = ?,
      address = ?,
      phone = ?,
      status = ?,
      color = ?,
      updated_at = ?
    WHERE id = ?
  `).bind(
    shop.name,
    shop.code || null,
    shop.description || null,
    shop.address || null,
    shop.phone || null,
    shop.status || 'ACTIVE',
    shop.color || null,
    now,
    id
  ).run();

  return jsonResponse({ success: true, id });
});

// ==========================================
// PRODUCTS ENDPOINTS
// ==========================================
router.get('/products', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const url = new URL(request.url);
  const shopId = url.searchParams.get('shopId');
  const status = url.searchParams.get('status');
  const categoryId = url.searchParams.get('categoryId');
  const search = url.searchParams.get('search');

  let query = 'SELECT * FROM products WHERE 1=1';
  const params: any[] = [];

  if (shopId && shopId !== 'ALL') {
    query += ' AND shop_id = ?';
    params.push(shopId);
  }

  if (status && status !== 'ALL') {
    query += ' AND status = ?';
    params.push(status);
  }

  if (categoryId && categoryId !== 'ALL') {
    query += ' AND category_id = ?';
    params.push(categoryId);
  }

  if (search) {
    query += ' AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  query += ' ORDER BY created_at DESC';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return jsonResponse(results);
});

router.post('/products', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const product = await request.json();
  const id = product.id || crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
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
    id,
    product.shopId,
    product.name,
    product.sku,
    product.barcode || null,
    product.categoryId,
    product.sellingPrice || 0,
    product.proposedSellingPrice || null,
    product.purchasePrice || 0,
    product.currentStock || 0,
    product.minStock || 5,
    product.unit || 'pcs',
    product.status || 'ACTIVE',
    product.createdAt || now,
    now
  ).run();

  return jsonResponse({ success: true, id });
});

router.get('/products/:id', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const { id } = request.params;
  const product = await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first();

  if (!product) {
    return jsonResponse({ error: 'Product not found' }, 404);
  }

  // Get product images
  const { results: images } = await env.DB.prepare(
    'SELECT * FROM product_images WHERE product_id = ? ORDER BY image_order'
  ).bind(id).all();

  return jsonResponse({ ...product, images });
});

router.put('/products/:id', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const { id } = request.params;
  const product = await request.json();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE products SET
      shop_id = ?,
      name = ?,
      sku = ?,
      barcode = ?,
      category_id = ?,
      selling_price = ?,
      proposed_selling_price = ?,
      purchase_price = ?,
      current_stock = ?,
      min_stock = ?,
      unit = ?,
      status = ?,
      updated_at = ?
    WHERE id = ?
  `).bind(
    product.shopId,
    product.name,
    product.sku,
    product.barcode || null,
    product.categoryId,
    product.sellingPrice || 0,
    product.proposedSellingPrice || null,
    product.purchasePrice || 0,
    product.currentStock || 0,
    product.minStock || 5,
    product.unit || 'pcs',
    product.status || 'ACTIVE',
    now,
    id
  ).run();

  return jsonResponse({ success: true, id });
});

// ==========================================
// CATEGORIES ENDPOINTS
// ==========================================
router.get('/categories', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const url = new URL(request.url);
  const shopId = url.searchParams.get('shopId');

  let query = 'SELECT * FROM categories WHERE 1=1';
  const params: any[] = [];

  if (shopId && shopId !== 'ALL') {
    query += ' AND shop_id = ?';
    params.push(shopId);
  }

  query += ' ORDER BY name';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return jsonResponse(results);
});

router.post('/categories', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const category = await request.json();
  const id = category.id || crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
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
    id,
    category.shopId,
    category.name,
    category.icon || null,
    category.color || null,
    category.status || 'ACTIVE',
    category.createdAt || now,
    now
  ).run();

  return jsonResponse({ success: true, id });
});

// ==========================================
// SALES ENDPOINTS
// ==========================================
router.get('/sales', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const url = new URL(request.url);
  const shopId = url.searchParams.get('shopId');
  const sellerId = url.searchParams.get('sellerId');
  const status = url.searchParams.get('status');
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const search = url.searchParams.get('search');

  let query = 'SELECT * FROM sales WHERE 1=1';
  const params: any[] = [];

  if (shopId && shopId !== 'ALL') {
    query += ' AND shop_id = ?';
    params.push(shopId);
  }

  if (sellerId && sellerId !== 'ALL') {
    query += ' AND seller_id = ?';
    params.push(sellerId);
  }

  if (status && status !== 'ALL') {
    query += ' AND status = ?';
    params.push(status);
  }

  if (startDate) {
    query += ' AND created_at >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND created_at <= ?';
    params.push(endDate);
  }

  if (search) {
    query += ' AND (receipt_number LIKE ? OR seller_name LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm);
  }

  query += ' ORDER BY created_at DESC LIMIT 100';

  const { results } = await env.DB.prepare(query).bind(...params).all();

  // Get items for each sale
  const salesWithItems = await Promise.all(
    results.map(async (sale: any) => {
      const { results: items } = await env.DB.prepare(
        'SELECT * FROM sale_items WHERE sale_id = ?'
      ).bind(sale.id).all();
      return { ...sale, items };
    })
  );

  return jsonResponse(salesWithItems);
});

router.post('/sales', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const sale = await request.json();
  const id = sale.id || crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO sales (
        id, receipt_number, shop_id, shop_name, seller_id, seller_name,
        subtotal, discount, tax, total, cost_of_goods, gross_profit,
        payment_method, amount_received, change, status, notes, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      id,
      sale.receiptNumber,
      sale.shopId,
      sale.shopName || null,
      sale.sellerId,
      sale.sellerName,
      sale.subtotal || 0,
      sale.discount || 0,
      sale.tax || 0,
      sale.total || 0,
      sale.costOfGoods || 0,
      sale.grossProfit || 0,
      sale.paymentMethod,
      sale.amountReceived || 0,
      sale.change || 0,
      sale.status || 'COMPLETED',
      sale.notes || null,
      sale.createdAt || now
    ),
    ...(sale.items || []).map((item: any) =>
      env.DB.prepare(`
        INSERT INTO sale_items (
          id, sale_id, shop_id, product_id, product_name, sku,
          unit_price, purchase_price, quantity, discount, total
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).bind(
        item.id || crypto.randomUUID(),
        id,
        item.shopId || sale.shopId,
        item.productId,
        item.productName,
        item.sku,
        item.unitPrice || 0,
        item.purchasePrice || 0,
        item.quantity || 0,
        item.discount || 0,
        item.total || 0
      )
    )
  ]);

  return jsonResponse({ success: true, id });
});

router.post('/sales/:id/void', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const { id } = request.params;
  const { voidReason, voidedBy } = await request.json();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE sales SET
      status = 'VOIDED',
      void_reason = ?,
      voided_at = ?,
      voided_by = ?
    WHERE id = ?
  `).bind(voidReason, now, voidedBy, id).run();

  return jsonResponse({ success: true, id });
});

// ==========================================
// PURCHASES ENDPOINTS
// ==========================================
router.get('/purchases', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const url = new URL(request.url);
  const shopId = url.searchParams.get('shopId');

  let query = 'SELECT * FROM purchases WHERE 1=1';
  const params: any[] = [];

  if (shopId && shopId !== 'ALL') {
    query += ' AND shop_id = ?';
    params.push(shopId);
  }

  query += ' ORDER BY created_at DESC LIMIT 100';

  const { results } = await env.DB.prepare(query).bind(...params).all();

  const purchasesWithItems = await Promise.all(
    results.map(async (purchase: any) => {
      const { results: items } = await env.DB.prepare(
        'SELECT * FROM purchase_items WHERE purchase_id = ?'
      ).bind(purchase.id).all();
      return { ...purchase, items };
    })
  );

  return jsonResponse(purchasesWithItems);
});

router.post('/purchases', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const purchase = await request.json();
  const id = purchase.id || crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO purchases (
        id, purchase_number, shop_id, shop_name, supplier_name, date,
        total_amount, payment_status, notes, invoice_number,
        created_by_user_id, created_by_name, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      id,
      purchase.purchaseNumber,
      purchase.shopId,
      purchase.shopName || null,
      purchase.supplierName,
      purchase.date || now,
      purchase.totalAmount || 0,
      purchase.paymentStatus || 'PAID',
      purchase.notes || null,
      purchase.invoiceNumber || null,
      purchase.createdByUserId,
      purchase.createdByName,
      purchase.createdAt || now
    ),
    ...(purchase.items || []).map((item: any) =>
      env.DB.prepare(`
        INSERT INTO purchase_items (
          id, purchase_id, product_id, product_name, quantity, unit_cost, total
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).bind(
        item.id || crypto.randomUUID(),
        id,
        item.productId,
        item.productName,
        item.quantity || 0,
        item.unitCost || 0,
        item.total || 0
      )
    )
  ]);

  return jsonResponse({ success: true, id });
});

// ==========================================
// EXPENSES ENDPOINTS
// ==========================================
router.get('/expenses', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const url = new URL(request.url);
  const shopId = url.searchParams.get('shopId');
  const category = url.searchParams.get('category');

  let query = 'SELECT * FROM expenses WHERE 1=1';
  const params: any[] = [];

  if (shopId && shopId !== 'ALL') {
    query += ' AND shop_id = ?';
    params.push(shopId);
  }

  if (category && category !== 'ALL') {
    query += ' AND category = ?';
    params.push(category);
  }

  query += ' ORDER BY created_at DESC LIMIT 100';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return jsonResponse(results);
});

router.post('/expenses', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const expense = await request.json();
  const id = expense.id || crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO expenses (
      id, shop_id, shop_name, is_company_expense, category, description,
      title, amount, payment_method, date, reference, notes,
      created_by_user_id, created_by_name, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).bind(
    id,
    expense.shopId || null,
    expense.shopName || null,
    expense.isCompanyExpense ? 1 : 0,
    expense.category,
    expense.description || '',
    expense.title || null,
    expense.amount || 0,
    expense.paymentMethod || 'CASH',
    expense.date || now,
    expense.reference || null,
    expense.notes || null,
    expense.createdByUserId,
    expense.createdByName,
    expense.createdAt || now
  ).run();

  return jsonResponse({ success: true, id });
});

// ==========================================
// INVENTORY ENDPOINTS
// ==========================================
router.get('/inventory/movements', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const url = new URL(request.url);
  const productId = url.searchParams.get('productId');
  const shopId = url.searchParams.get('shopId');

  let query = 'SELECT * FROM inventory_movements WHERE 1=1';
  const params: any[] = [];

  if (productId) {
    query += ' AND product_id = ?';
    params.push(productId);
  }

  if (shopId && shopId !== 'ALL') {
    query += ' AND shop_id = ?';
    params.push(shopId);
  }

  query += ' ORDER BY created_at DESC LIMIT 200';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return jsonResponse(results);
});

router.post('/inventory/movements', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const movement = await request.json();
  const id = movement.id || crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO inventory_movements (
        id, shop_id, shop_name, product_id, product_name,
        previous_qty, change_qty, new_qty, type, reason, cost_value,
        reference_id, user_id, user_name, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      id,
      movement.shopId,
      movement.shopName || null,
      movement.productId,
      movement.productName,
      movement.previousQty || 0,
      movement.changeQty || 0,
      movement.newQty || 0,
      movement.type,
      movement.reason,
      movement.costValue || null,
      movement.referenceId || null,
      movement.userId,
      movement.userName,
      movement.createdAt || now
    ),
    env.DB.prepare(`
      UPDATE products SET
        current_stock = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(movement.newQty, now, movement.productId)
  ]);

  return jsonResponse({ success: true, id });
});

router.get('/inventory/valuation', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const url = new URL(request.url);
  const shopId = url.searchParams.get('shopId');

  let query = `
    SELECT 
      COUNT(*) as total_products,
      SUM(current_stock) as total_units,
      SUM(current_stock * purchase_price) as total_cost_value,
      SUM(current_stock * selling_price) as total_retail_value,
      SUM(CASE WHEN current_stock <= min_stock THEN 1 ELSE 0 END) as low_stock_count,
      SUM(CASE WHEN current_stock <= 0 THEN 1 ELSE 0 END) as out_of_stock_count
    FROM products
    WHERE status = 'ACTIVE'
  `;
  const params: any[] = [];

  if (shopId && shopId !== 'ALL') {
    query += ' AND shop_id = ?';
    params.push(shopId);
  }

  const valuation = await env.DB.prepare(query).bind(...params).first();
  
  return jsonResponse({
    totalProducts: valuation?.total_products || 0,
    totalUnitsInStock: valuation?.total_units || 0,
    totalCostValue: valuation?.total_cost_value || 0,
    totalRetailValue: valuation?.total_retail_value || 0,
    lowStockCount: valuation?.low_stock_count || 0,
    outOfStockCount: valuation?.out_of_stock_count || 0,
    potentialProfit: (valuation?.total_retail_value || 0) - (valuation?.total_cost_value || 0),
  });
});

// ==========================================
// DEBTS ENDPOINTS
// ==========================================
router.get('/debts', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const status = url.searchParams.get('status');

  let query = 'SELECT * FROM debts WHERE 1=1';
  const params: any[] = [];

  if (type && type !== 'ALL') {
    query += ' AND type = ?';
    params.push(type);
  }

  if (status && status !== 'ALL') {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC';

  const { results } = await env.DB.prepare(query).bind(...params).all();

  // Get payments for each debt
  const debtsWithPayments = await Promise.all(
    results.map(async (debt: any) => {
      const { results: payments } = await env.DB.prepare(
        'SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY payment_date DESC'
      ).bind(debt.id).all();
      return { ...debt, payments };
    })
  );

  return jsonResponse(debtsWithPayments);
});

router.post('/debts', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const debt = await request.json();
  const id = debt.id || crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO debts (
      id, type, debtor_name, product_description, amount, paid_amount,
      remaining_amount, due_date, contact, notes, status,
      created_by_user_id, created_by_name, shop_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      debtor_name = excluded.debtor_name,
      product_description = excluded.product_description,
      amount = excluded.amount,
      paid_amount = excluded.paid_amount,
      remaining_amount = excluded.remaining_amount,
      due_date = excluded.due_date,
      contact = excluded.contact,
      notes = excluded.notes,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).bind(
    id,
    debt.type,
    debt.debtorName,
    debt.productDescription || null,
    debt.amount || 0,
    debt.paidAmount || 0,
    debt.remainingAmount || debt.amount || 0,
    debt.dueDate || null,
    debt.contact || null,
    debt.notes || null,
    debt.status || 'PENDING',
    debt.createdByUserId,
    debt.createdByName,
    debt.shopId || null,
    debt.createdAt || now,
    now
  ).run();

  return jsonResponse({ success: true, id });
});

router.post('/debts/:id/payments', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const { id } = request.params;
  const payment = await request.json();
  const paymentId = payment.id || crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO debt_payments (
        id, debt_id, amount, payment_date, payment_method,
        paid_by_user_id, paid_by_name, notes, remaining_after, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      paymentId,
      id,
      payment.amount || 0,
      payment.paymentDate || now,
      payment.paymentMethod || null,
      payment.paidByUserId,
      payment.paidByName,
      payment.notes || null,
      payment.remainingAfter || 0,
      now
    ),
    env.DB.prepare(`
      UPDATE debts SET
        paid_amount = ?,
        remaining_amount = ?,
        status = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(
      payment.totalPaidSoFar,
      payment.remainingAfter,
      payment.newStatus || 'PARTIALLY_PAID',
      now,
      id
    )
  ]);

  return jsonResponse({ success: true, id: paymentId });
});

// ==========================================
// NOTIFICATIONS ENDPOINTS
// ==========================================
router.get('/notifications', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const role = url.searchParams.get('role');

  let query = 'SELECT * FROM notifications WHERE 1=1';
  const params: any[] = [];

  if (role === 'ADMIN') {
    query += ' AND (target_role IN (?, ?) OR is_global = 1)';
    params.push('ADMIN', 'ALL');
  } else if (role === 'SELLER') {
    query += ' AND (target_role IN (?, ?) OR is_global = 1)';
    params.push('SELLER', 'ALL');
  }

  query += ' ORDER BY created_at DESC LIMIT 100';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return jsonResponse(results);
});

router.post('/notifications', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const notification = await request.json();
  const id = notification.id || crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO notifications (
      id, type, category, title, message, is_global,
      target_shop_id, target_shop_name, target_user_ids,
      target_role, related_entity_id, related_entity_type,
      created_at, read_by_user_ids
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    notification.type,
    notification.category || 'INFO',
    notification.title,
    notification.message,
    notification.isGlobal ? 1 : 0,
    notification.targetShopId || null,
    notification.targetShopName || null,
    JSON.stringify(notification.targetUserIds || []),
    notification.targetRole || 'ALL',
    notification.relatedEntityId || null,
    notification.relatedEntityType || null,
    notification.createdAt || now,
    JSON.stringify(notification.readByUserIds || [])
  ).run();

  return jsonResponse({ success: true, id });
});

router.post('/notifications/read', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const { notificationId, userId } = await request.json();

  const notification = await env.DB.prepare(
    'SELECT * FROM notifications WHERE id = ?'
  ).bind(notificationId).first();

  if (!notification) {
    return jsonResponse({ error: 'Notification not found' }, 404);
  }

  const readByUserIds = JSON.parse(notification.read_by_user_ids || '[]');
  if (!readByUserIds.includes(userId)) {
    readByUserIds.push(userId);
  }

  await env.DB.prepare(
    'UPDATE notifications SET read_by_user_ids = ? WHERE id = ?'
  ).bind(JSON.stringify(readByUserIds), notificationId).run();

  return jsonResponse({ success: true });
});

// ==========================================
// SETTINGS ENDPOINTS
// ==========================================
router.get('/settings', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const settings = await env.DB.prepare(
    'SELECT * FROM settings WHERE id = ?'
  ).bind('global').first();

  return jsonResponse(settings);
});

router.put('/settings', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const settings = await request.json();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE settings SET
      business_name = ?,
      tagline = ?,
      address = ?,
      phone = ?,
      email = ?,
      currency_symbol = ?,
      currency_code = ?,
      tax_rate_percent = ?,
      enable_tax = ?,
      receipt_header_note = ?,
      receipt_footer_note = ?,
      receipt_paper_width = ?,
      low_stock_threshold_default = ?,
      updated_at = ?
    WHERE id = 'global'
  `).bind(
    settings.businessName,
    settings.tagline || null,
    settings.address || null,
    settings.phone || null,
    settings.email || null,
    settings.currencySymbol || 'TSh',
    settings.currencyCode || 'TZS',
    settings.taxRatePercent || 0,
    settings.enableTax ? 1 : 0,
    settings.receiptHeaderNote || null,
    settings.receiptFooterNote || null,
    settings.receiptPaperWidth || '80mm',
    settings.lowStockThresholdDefault || 5,
    now
  ).run();

  return jsonResponse({ success: true });
});

// ==========================================
// SYNC ENDPOINTS
// ==========================================
router.post('/sync/push', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const { deviceId, operations } = await request.json();

  if (!operations || !Array.isArray(operations)) {
    return jsonResponse({ error: 'Invalid sync payload' }, 400);
  }

  const results = [];
  const errors = [];

  for (const op of operations) {
    try {
      const result = await processSyncOperation(env.DB, op);
      results.push({ id: op.id, success: true, ...result });
      
      // Track in sync queue
      await env.DB.prepare(`
        INSERT INTO sync_queue_tracking (
          id, operation, entity_type, entity_id, payload,
          status, device_id, created_at, processed_at
        )
        VALUES (?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?)
      `).bind(
        op.id,
        op.operation,
        op.entityType,
        op.entityId,
        JSON.stringify(op.payload),
        deviceId,
        new Date().toISOString(),
        new Date().toISOString()
      ).run();
    } catch (error: any) {
      errors.push({ id: op.id, error: error.message });
      
      await env.DB.prepare(`
        INSERT INTO sync_queue_tracking (
          id, operation, entity_type, entity_id, payload,
          status, error_message, device_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, 'FAILED', ?, ?, ?)
      `).bind(
        op.id,
        op.operation,
        op.entityType,
        op.entityId,
        JSON.stringify(op.payload),
        error.message,
        deviceId,
        new Date().toISOString()
      ).run();
    }
  }

  return jsonResponse({
    success: errors.length === 0,
    processedCount: results.length,
    failedCount: errors.length,
    results,
    errors,
  });
});

router.get('/sync/pull', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const url = new URL(request.url);
  const since = url.searchParams.get('since') || new Date(0).toISOString();
  const shopId = url.searchParams.get('shopId');

  const data = await pullCloudState(env.DB, since, shopId);
  return jsonResponse({ success: true, data });
});

// ==========================================
// R2 ENDPOINTS
// ==========================================
router.post('/r2/upload', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const productId = formData.get('productId') as string;
  const imageOrder = formData.get('imageOrder') as string;

  if (!file || !productId) {
    return jsonResponse({ error: 'Missing file or productId' }, 400);
  }

  const key = `products/${productId}/${Date.now()}_${file.name}`;
  
  await env.MEDIA_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Save image metadata to D1
  const imageId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO product_images (
      image_id, product_id, image_order, version, r2_key,
      filename, mime_type, file_size, sync_status, created_at, updated_at
    )
    VALUES (?, ?, ?, 1, ?, ?, ?, ?, 'SYNCED', ?, ?)
  `).bind(
    imageId,
    productId,
    parseInt(imageOrder) || 0,
    key,
    file.name,
    file.type,
    file.size,
    new Date().toISOString(),
    new Date().toISOString()
  ).run();

  return jsonResponse({
    success: true,
    imageId,
    key,
    size: file.size,
    mimeType: file.type,
  });
});

router.get('/r2/files/:key', async (request, env: Env) => {
  const key = request.params.key;
  
  const object = await env.MEDIA_BUCKET.get(key);
  
  if (!object) {
    return jsonResponse({ error: 'File not found' }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return new Response(object.body, { headers });
});

router.delete('/r2/files/:key', async (request, env: Env) => {
  const auth = await authenticate(request, env);
  if (auth) return auth;

  const key = request.params.key;
  
  await env.MEDIA_BUCKET.delete(key);
  
  // Also delete from D1
  await env.DB.prepare(
    'DELETE FROM product_images WHERE r2_key = ?'
  ).bind(key).run();

  return jsonResponse({ success: true, deleted: key });
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================
async function processSyncOperation(db: D1Database, op: any) {
  const { operation, entityType, entityId, payload } = op;

  switch (operation) {
    case 'CREATE_SHOP':
    case 'UPDATE_SHOP':
      return upsertShop(db, payload);
    
    case 'CREATE_PRODUCT':
    case 'UPDATE_PRODUCT':
    case 'TOGGLE_PRODUCT_STATUS':
      return upsertProduct(db, payload);
    
    case 'CREATE_SALE':
      return createSale(db, payload);
    
    case 'VOID_SALE':
      return voidSale(db, payload);
    
    case 'CREATE_PURCHASE':
      return createPurchase(db, payload);
    
    case 'CREATE_EXPENSE':
      return createExpense(db, payload);
    
    case 'CREATE_SELLER':
    case 'UPDATE_SELLER':
      return upsertUser(db, payload);
    
    case 'STOCK_ADJUSTMENT':
      return recordStockAdjustment(db, payload);
    
    case 'UPDATE_SETTINGS':
      return updateSettings(db, payload);
    
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

// [Previous helper functions remain the same...]

async function pullCloudState(db: D1Database, since: string, shopId?: string) {
  const state: any = {};

  const shopsResult = await db.prepare(
    'SELECT * FROM shops WHERE updated_at > ?'
  ).bind(since).all();
  state.shops = shopsResult.results;

  const usersResult = await db.prepare(
    'SELECT * FROM users WHERE updated_at > ?'
  ).bind(since).all();
  state.users = usersResult.results.map((u: any) => ({
    ...u,
    assignedShopIds: JSON.parse(u.assigned_shop_ids || '[]')
  }));

  const categoriesResult = await db.prepare(
    'SELECT * FROM categories WHERE updated_at > ?'
  ).bind(since).all();
  state.categories = categoriesResult.results;

  let productsQuery = 'SELECT * FROM products WHERE updated_at > ?';
  const productParams: any[] = [since];
  if (shopId && shopId !== 'ALL') {
    productsQuery += ' AND shop_id = ?';
    productParams.push(shopId);
  }
  const productsResult = await db.prepare(productsQuery).bind(...productParams).all();
  state.products = productsResult.results;

  const salesResult = await db.prepare(
    'SELECT * FROM sales WHERE created_at > ?'
  ).bind(since).all();
  state.sales = salesResult.results;

  const saleItemsResult = await db.prepare(`
    SELECT si.* FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE s.created_at > ?
  `).bind(since).all();
  state.saleItems = saleItemsResult.results;

  const purchasesResult = await db.prepare(
    'SELECT * FROM purchases WHERE created_at > ?'
  ).bind(since).all();
  state.purchases = purchasesResult.results;

  const purchaseItemsResult = await db.prepare(`
    SELECT pi.* FROM purchase_items pi
    JOIN purchases p ON pi.purchase_id = p.id
    WHERE p.created_at > ?
  `).bind(since).all();
  state.purchaseItems = purchaseItemsResult.results;

  const expensesResult = await db.prepare(
    'SELECT * FROM expenses WHERE created_at > ?'
  ).bind(since).all();
  state.expenses = expensesResult.results;

  const movementsResult = await db.prepare(
    'SELECT * FROM inventory_movements WHERE created_at > ?'
  ).bind(since).all();
  state.movements = movementsResult.results;

  const debtsResult = await db.prepare(
    'SELECT * FROM debts WHERE updated_at > ?'
  ).bind(since).all();
  state.debts = debtsResult.results;

  const settingsResult = await db.prepare(
    'SELECT * FROM settings WHERE id = ?'
  ).bind('global').first();
  state.settings = settingsResult;

  return state;
}

// Export handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      return await router.handle(request, env, ctx);
    } catch (error: any) {
      console.error('Worker error:', error);
      return jsonResponse({ 
        error: error.message || 'Internal Server Error',
        stack: env.ENVIRONMENT === 'development' ? error.stack : undefined
      }, 500);
    }
  }
};
