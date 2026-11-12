import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './types';
import { requireAuth } from './middleware/auth';
import { SupabaseError } from './lib/supabase';
import { ZodError } from 'zod';
import me from './routes/me';
import posts from './routes/posts';
import connections from './routes/connections';
import conversations from './routes/conversations';
import safety from './routes/safety';
import uploads from './routes/uploads';

const app = new Hono<AppEnv>();
app.get('/health', c => c.json({ status: 'ok', service: 'sway-backend' }));

// Body size limit middleware
app.use('/api/*', async (c, next) => {
  const contentLength = c.req.header('Content-Length');
  if (contentLength && parseInt(contentLength) > 1024 * 100) { // 100KB max
    return c.json({ error: 'Request body too large (max 100KB)' }, 413);
  }
  await next();
});

// Origin validation and CORS
app.use('/api/*', async (c, next) => {
  const allowed = c.env.ALLOWED_ORIGINS.split(',').map((x: string) => x.trim());
  const origin = c.req.header('Origin');
  if (origin && !allowed.includes(origin)) return c.json({ error: 'Origin not allowed' }, 403);
  await next();
});
app.use('/api/*', cors({
  origin: ['*'], // Allow all - we check manually above
  allowMethods: ['GET','POST','PATCH','OPTIONS'],
  allowHeaders: ['Content-Type','Authorization']
}));

app.use('/api/*', requireAuth);
app.route('/api/me', me);
app.route('/api/posts', posts);
app.route('/api/connections', connections);
app.route('/api/conversations', conversations);
app.route('/api', safety);
app.route('/api/uploads', uploads);

app.notFound(c => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  // Handle known error types
  if (err instanceof SupabaseError) {
    return c.json({ error: err.message }, err.status as any);
  }
  
  if (err instanceof ZodError) {
    const firstError = err.issues[0];
    return c.json({
      error: 'Validation failed',
      details: firstError?.message || 'Invalid request data'
    }, 400);
  }

  // JSON parsing errors
  if (err instanceof SyntaxError && err.message.includes('JSON')) {
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }

  // Log unexpected errors
  console.error('[Unhandled Error]', {
    message: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method
  });
  
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
