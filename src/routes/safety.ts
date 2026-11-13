import { Hono } from 'hono';
import type { AppEnv, Report, Block } from '../types';
import { readJson, supabaseFetch, SupabaseError } from '../lib/supabase';
import { createReportSchema, createBlockSchema } from '../lib/validation';
import { reportLimit } from '../middleware/ratelimit';

const route = new Hono<AppEnv>();

// Apply rate limiting to reports
route.post('/reports', reportLimit);

route.post('/reports', async c => {
  try {
    const body = await c.req.json();
    const validated = createReportSchema.parse(body);
    const userId = c.get('user').id;

    const response = await supabaseFetch(c, 'reports', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        reporter_id: userId,
        target_type: validated.target_type,
        target_id: validated.target_id,
        reason: validated.reason,
        details: validated.details ?? null
      })
    });
    
    const rows = await readJson<Report[]>(response);
    return c.json({ report: rows[0] ?? null }, 201);
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

route.post('/blocks', async c => {
  try {
    const body = await c.req.json();
    const validated = createBlockSchema.parse(body);
    const userId = c.get('user').id;

    // Prevent blocking yourself
    if (validated.blocked_user_id === userId) {
      return c.json({ error: 'Cannot block yourself' }, 400);
    }

    const response = await supabaseFetch(c, 'blocks', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        blocker_id: userId,
        blocked_user_id: validated.blocked_user_id
      })
    });
    
    const rows = await readJson<Block[]>(response);
    return c.json({ block: rows[0] ?? null }, 201);
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

route.get('/blocks', async c => {
  try {
    const userId = c.get('user').id;
    
    const response = await supabaseFetch(
      c,
      `blocks?blocker_id=eq.${userId}&select=blocked_user_id,created_at,profiles!blocks_blocked_user_id_fkey(id,username)`
    );
    
    const rows = await readJson<unknown[]>(response);
    return c.json({ blocks: rows });
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

route.delete('/blocks/:blockedUserId', async c => {
  try {
    const blockedUserId = c.req.param('blockedUserId');
    const userId = c.get('user').id;

    const response = await supabaseFetch(
      c,
      `blocks?blocker_id=eq.${userId}&blocked_user_id=eq.${blockedUserId}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' }
      }
    );
    
    const rows = await readJson<Block[]>(response);
    if (!rows.length) {
      return c.json({ error: 'Block not found' }, 404);
    }
    
    return c.json({ message: 'User unblocked successfully', block: rows[0] });
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

export default route;
