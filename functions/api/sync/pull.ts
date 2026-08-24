export async function onRequestGet(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const since = url.searchParams.get('since') || new Date(0).toISOString();
  
  try {
    const state: any = {};

    const shopsResult = await env.DB.prepare('SELECT * FROM shops WHERE updated_at > ?').bind(since).all();
    state.shops = shopsResult.results;

    const productsResult = await env.DB.prepare('SELECT * FROM products WHERE updated_at > ?').bind(since).all();
    state.products = productsResult.results;

    const categoriesResult = await env.DB.prepare('SELECT * FROM categories WHERE updated_at > ?').bind(since).all();
    state.categories = categoriesResult.results;

    const salesResult = await env.DB.prepare('SELECT * FROM sales WHERE created_at > ?').bind(since).all();
    state.sales = salesResult.results;

    const expensesResult = await env.DB.prepare('SELECT * FROM expenses WHERE created_at > ?').bind(since).all();
    state.expenses = expensesResult.results;

    const movementsResult = await env.DB.prepare('SELECT * FROM inventory_movements WHERE created_at > ?').bind(since).all();
    state.movements = movementsResult.results;

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
