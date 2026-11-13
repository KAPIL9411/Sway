import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { readJson, supabaseFetch, SupabaseError } from '../lib/supabase';
import { paginationSchema } from '../lib/validation';

const route = new Hono<AppEnv>();

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: any;
  is_read: boolean;
  created_at: string;
}

route.get('/', async c => {
  try {
    const query = paginationSchema.parse({
      limit: c.req.query('limit'),
      offset: c.req.query('offset')
    });
    
    const userId = c.get('user').id;
    const unreadOnly = c.req.query('unread_only') === 'true';

    const unreadFilter = unreadOnly ? '&is_read=eq.false' : '';
    
    const response = await supabaseFetch(
      c,
      `notifications?user_id=eq.${userId}${unreadFilter}&order=created_at.desc&limit=${query.limit}&offset=${query.offset}`
    );
    
    const rows = await readJson<Notification[]>(response);
    
    // Get unread count
    const countResponse = await supabaseFetch(
      c,
      `notifications?user_id=eq.${userId}&is_read=eq.false&select=count`,
      {
        headers: { Prefer: 'count=exact' }
      }
    );
    const countData = await countResponse.text();
    let unreadCount = 0;
    try {
      const range = countResponse.headers.get('Content-Range');
      if (range) {
        const match = range.match(/\/(\d+)$/);
        if (match) unreadCount = parseInt(match[1]);
      }
    } catch (e) {
      // Fallback if count parsing fails
    }
    
    return c.json({
      notifications: rows,
      unread_count: unreadCount,
      limit: query.limit,
      offset: query.offset
    });
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

route.patch('/:id/read', async c => {
  try {
    const notificationId = c.req.param('id');
    const userId = c.get('user').id;

    const response = await supabaseFetch(
      c,
      `notifications?id=eq.${notificationId}&user_id=eq.${userId}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ is_read: true })
      }
    );
    
    const rows = await readJson<Notification[]>(response);
    if (!rows.length) {
      return c.json({ error: 'Notification not found' }, 404);
    }
    
    return c.json({ notification: rows[0] });
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

route.post('/read-all', async c => {
  try {
    const userId = c.get('user').id;

    const response = await supabaseFetch(
      c,
      `notifications?user_id=eq.${userId}&is_read=eq.false`,
      {
        method: 'PATCH',
        body: JSON.stringify({ is_read: true })
      }
    );
    
    return c.json({ message: 'All notifications marked as read' });
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

export default route;
