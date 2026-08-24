// functions/_worker.ts
export interface Env {
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
  AUTH_SECRET: string;
}

// R2 File Upload Endpoint
router.post('/r2/upload', async (request, env: Env) => {
  const contentType = request.headers.get('Content-Type') || '';
  
  if (!contentType.includes('multipart/form-data')) {
    return new Response(JSON.stringify({ error: 'Expected multipart/form-data' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const productId = formData.get('productId') as string;
  const imageOrder = formData.get('imageOrder') as string;

  if (!file || !productId) {
    return new Response(JSON.stringify({ error: 'Missing file or productId' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const key = `products/${productId}/${Date.now()}_${file.name}`;
  
  await env.MEDIA_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  return new Response(JSON.stringify({ 
    success: true, 
    key,
    size: file.size,
    mimeType: file.type 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

// R2 File Retrieval
router.get('/r2/files/:key', async (request, env: Env) => {
  const key = request.params.key;
  
  const object = await env.MEDIA_BUCKET.get(key);
  
  if (!object) {
    return new Response(JSON.stringify({ error: 'File not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(object.body, {
    headers,
  });
});

// R2 File Delete
router.delete('/r2/files/:key', async (request, env: Env) => {
  const key = request.params.key;
  
  await env.MEDIA_BUCKET.delete(key);
  
  return new Response(JSON.stringify({ success: true, deleted: key }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

// R2 Backup Upload (full database backup)
router.post('/r2/backup', async (request, env: Env) => {
  const contentType = request.headers.get('Content-Type') || '';
  
  if (!contentType.includes('multipart/form-data')) {
    return new Response(JSON.stringify({ error: 'Expected multipart/form-data' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const formData = await request.formData();
  const file = formData.get('backup') as File;
  const deviceId = request.headers.get('X-Device-ID') || 'unknown';

  if (!file) {
    return new Response(JSON.stringify({ error: 'Missing backup file' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const key = `backups/${deviceId}/${Date.now()}_backup.json`;
  
  await env.MEDIA_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: 'application/json' },
  });

  return new Response(JSON.stringify({ 
    success: true, 
    key,
    size: file.size 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

// List backups
router.get('/r2/backups', async (request, env: Env) => {
  const deviceId = request.headers.get('X-Device-ID') || 'unknown';
  
  const objects = await env.MEDIA_BUCKET.list({ prefix: `backups/${deviceId}/` });
  
  return new Response(JSON.stringify({ 
    success: true, 
    backups: objects.objects.map(obj => ({
      key: obj.key,
      size: obj.size,
      uploadedAt: obj.uploaded,
    }))
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
