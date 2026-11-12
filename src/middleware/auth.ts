import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return c.json({ error: 'Missing bearer token' }, 401);

  // Validate token with Supabase Auth instead of trusting decoded JWT claims.
  const response = await fetch(`${c.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: c.env.SUPABASE_ANON_KEY, Authorization: header }
  });
  if (!response.ok) return c.json({ error: 'Invalid or expired session' }, 401);

  const user = await response.json() as { id?: string; aud?: string; role?: string };
  if (!user.id) return c.json({ error: 'Invalid session identity' }, 401);
  c.set('user', { id: user.id, aud: user.aud, role: user.role });
  await next();
};
