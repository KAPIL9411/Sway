import { Hono } from 'hono';
import type { AppEnv, Profile } from '../types';
import { readJson, supabaseFetch, SupabaseError } from '../lib/supabase';
import { usernameSchema } from '../lib/validation';

const route = new Hono<AppEnv>();

route.get('/', async c => {
  try {
    const userId = c.get('user').id;
    const response = await supabaseFetch(c, `profiles?id=eq.${userId}&select=id,username,created_at,updated_at`);
    const rows = await readJson<Profile[]>(response);
    
    if (!rows.length) {
      const created = await supabaseFetch(c, 'profiles', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ id: userId })
      });
      const result = await readJson<Profile[]>(created);
      return c.json({ profile: result[0] ?? null });
    }
    return c.json({ profile: rows[0] });
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

route.patch('/', async c => {
  try {
    const body = await c.req.json();
    const validated = usernameSchema.parse(body);
    
    const response = await supabaseFetch(c, `profiles?id=eq.${c.get('user').id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ username: validated.username })
    });
    const rows = await readJson<Profile[]>(response);
    
    if (!rows.length) {
      return c.json({ error: 'Profile not found' }, 404);
    }
    
    return c.json({ profile: rows[0] });
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err; // ZodError will be caught by global handler
  }
});

export default route;
