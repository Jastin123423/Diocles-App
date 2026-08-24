// functions/_worker.ts (SIMPLE TEST - No imports)
export default {
  async fetch(request: Request, env: any) {
    const url = new URL(request.url);
    
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ 
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString() 
      }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }
};
