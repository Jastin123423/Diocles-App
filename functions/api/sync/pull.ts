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

    const shopsResult = await env.DB.prepare('SELECT * FROM shops WHERE updated_at > ?').bind(since).all();
    state.shops = shopsResult.results;

    const usersResult = await env.DB.prepare('SELECT * FROM users WHERE updated_at > ?').bind(since).all();
    state.users = usersResult.results;

    const categoriesResult = await env.DB.prepare('SELECT * FROM categories WHERE updated_at > ?').bind(since).all();
    state.categories = categoriesResult.results;

    const productsResult = await env.DB.prepare('SELECT * FROM products WHERE updated_at > ?').bind(since).all();
    state.products = productsResult.results;

    const salesResult = await env.DB.prepare('SELECT * FROM sales WHERE created_at > ?').bind(since).all();
    state.sales = salesResult.results;

    // Get sale items
    const saleItemsResult = await env.DB.prepare(`
      SELECT si.* FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.created_at > ?
    `).bind(since).all();
    state.saleItems = saleItemsResult.results;

    const purchasesResult = await env.DB.prepare('SELECT * FROM purchases WHERE created_at > ?').bind(since).all();
    state.purchases = purchasesResult.results;

    // Get purchase items
    const purchaseItemsResult = await env.DB.prepare(`
      SELECT pi.* FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      WHERE p.created_at > ?
    `).bind(since).all();
    state.purchaseItems = purchaseItemsResult.results;

    const expensesResult = await env.DB.prepare('SELECT * FROM expenses WHERE created_at > ?').bind(since).all();
    state.expenses = expensesResult.results;

    const movementsResult = await env.DB.prepare('SELECT * FROM inventory_movements WHERE created_at > ?').bind(since).all();
    state.movements = movementsResult.results;

    const debtsResult = await env.DB.prepare('SELECT * FROM debts WHERE updated_at > ?').bind(since).all();
    state.debts = debtsResult.results;

    const settingsResult = await env.DB.prepare('SELECT * FROM settings WHERE id = ?').bind('global').first();
    state.settings = settingsResult;

    return new Response(JSON.stringify({ success: true, data: state }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
