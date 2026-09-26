// functions/api/sync/pull.ts
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-ID',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function onRequestGet(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const since = url.searchParams.get('since') || new Date(0).toISOString();

  try {
    const state: any = {};

    // ---- SHOPS ----
    const shopsResult = await env.DB.prepare(
      'SELECT * FROM shops WHERE updated_at > ?'
    ).bind(since).all();
    state.shops = shopsResult.results;

    // ---- USERS (always pull ALL — permissions may change) ----
    const usersResult = await env.DB.prepare('SELECT * FROM users').all();
    state.users = usersResult.results;

    // ---- CATEGORIES ----
    const categoriesResult = await env.DB.prepare(
      'SELECT * FROM categories WHERE updated_at > ?'
    ).bind(since).all();
    state.categories = categoriesResult.results;

    // ---- PRODUCTS ----
    const productsResult = await env.DB.prepare(
      'SELECT * FROM products WHERE updated_at > ?'
    ).bind(since).all();
    state.products = productsResult.results;

    // ---- PRODUCT IMAGES ----
    const productImagesResult = await env.DB.prepare(
      'SELECT * FROM product_images WHERE updated_at > ?'
    ).bind(since).all();
    state.productImages = productImagesResult.results;

    // ---- SALES (updated_at, NOT created_at) ----
    // Critical: sale edits change the row without changing created_at,
    // so we must filter by updated_at to deliver approved edits to clients.
    const salesResult = await env.DB.prepare(
      'SELECT * FROM sales WHERE updated_at > ?'
    ).bind(since).all();
    state.sales = salesResult.results;

    // ---- SALE ITEMS (join on sales.updated_at) ----
    const saleItemsResult = await env.DB.prepare(`
      SELECT si.* FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.updated_at > ?
    `).bind(since).all();
    state.saleItems = saleItemsResult.results;

    // ---- PURCHASES ----
    const purchasesResult = await env.DB.prepare(
      'SELECT * FROM purchases WHERE created_at > ?'
    ).bind(since).all();
    state.purchases = purchasesResult.results;

    // ---- PURCHASE ITEMS ----
    const purchaseItemsResult = await env.DB.prepare(`
      SELECT pi.* FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      WHERE p.created_at > ?
    `).bind(since).all();
    state.purchaseItems = purchaseItemsResult.results;

    // ---- EXPENSES ----
    const expensesResult = await env.DB.prepare(
      'SELECT * FROM expenses WHERE created_at > ?'
    ).bind(since).all();
    state.expenses = expensesResult.results;

    // ---- INVENTORY MOVEMENTS ----
    const movementsResult = await env.DB.prepare(
      'SELECT * FROM inventory_movements WHERE created_at > ?'
    ).bind(since).all();
    state.movements = movementsResult.results;

    // ---- DEBTS ----
    const debtsResult = await env.DB.prepare(
      'SELECT * FROM debts WHERE updated_at > ?'
    ).bind(since).all();
    state.debts = debtsResult.results;

    // ---- SALE EDIT REQUESTS (always ALL) ----
    // Pending requests must always be visible; status changes matter.
    const saleEditRequestsResult = await env.DB.prepare(
      'SELECT * FROM sale_edit_requests'
    ).all();
    state.saleEditRequests = saleEditRequestsResult.results;

    // ---- DEBT PAYMENTS (always ALL) ----
    const debtPaymentsResult = await env.DB.prepare(
      'SELECT * FROM debt_payments'
    ).all();
    state.debtPayments = debtPaymentsResult.results;

    // ---- SETTINGS ----
    const settingsResult = await env.DB.prepare(
      'SELECT * FROM settings WHERE id = ?'
    ).bind('global').first();
    state.settings = settingsResult;

    return new Response(JSON.stringify({ success: true, data: state }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
