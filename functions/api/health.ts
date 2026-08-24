export async function onRequest(context: any) {
  const { env } = context;
  
  try {
    const dbCheck = await env.DB.prepare('SELECT 1 as ok').first();
    
    return new Response(JSON.stringify({
      status: 'healthy',
      database: dbCheck ? 'connected' : 'error',
      timestamp: new Date().toISOString(),
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({
      status: 'error',
      error: error.message,
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
