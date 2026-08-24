export async function onRequestPost(context: any) {
  const { request, env } = context;
  
  try {
    const { deviceId, operations } = await request.json();
    
    if (!operations || !Array.isArray(operations)) {
      return new Response(JSON.stringify({ error: 'Invalid sync payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function processOperation(db: any, op: any) {
  const { operation, payload } = op;

  switch (operation) {
    case 'CREATE_PRODUCT':
      await db.prepare(`
        INSERT INTO products (id, shop_id, name, sku, barcode, category_id, selling_price, purchase_price, current_stock, min_stock, unit, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name
      `).bind(
        payload.id, payload.shopId, payload.name, payload.sku, payload.barcode,
        payload.categoryId, payload.sellingPrice, payload.purchasePrice,
        payload.currentStock, payload.minStock, payload.unit, payload.status,
        payload.createdAt, payload.updatedAt
      ).run();
      break;
    
    case 'CREATE_SALE':
      await db.prepare(`
        INSERT INTO sales (id, receipt_number, shop_id, seller_id, seller_name, total, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).bind(
        payload.id, payload.receiptNumber, payload.shopId, payload.sellerId,
        payload.sellerName, payload.total, payload.status, payload.createdAt
      ).run();
      break;
    
    case 'CREATE_SHOP':
      await db.prepare(`
        INSERT INTO shops (id, name, code, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name
      `).bind(payload.id, payload.name, payload.code, payload.status, payload.createdAt, payload.updatedAt).run();
      break;
    
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }

  return { entityType: op.entityType, entityId: op.entityId };
}
