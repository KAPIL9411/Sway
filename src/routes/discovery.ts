import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { readJson, supabaseFetch, SupabaseError } from '../lib/supabase';
import { paginationSchema } from '../lib/validation';

const route = new Hono<AppEnv>();

interface PublicProfile {
  id: string;
  username: string | null;
  created_at: string;
}

route.get('/', async c => {
  try {
    const query = paginationSchema.parse({
      limit: c.req.query('limit'),
      offset: c.req.query('offset')
    });
    
    const userId = c.get('user').id;

    // Get list of users with exclusions:
    // 1. Not current user
    // 2. Not blocked by current user
    // 3. Not blocking current user
    // 4. Have a username (have completed profile)
    
    // First get blocked user IDs (both directions)
    const blockedResponse = await supabaseFetch(
      c,
      `blocks?or=(blocker_id.eq.${userId},blocked_user_id.eq.${userId})&select=blocker_id,blocked_user_id`
    );
    const blocks = await readJson<Array<{ blocker_id: string; blocked_user_id: string }>>(blockedResponse);
    
    const excludedIds = new Set<string>([userId]); // Exclude self
    blocks.forEach(block => {
      excludedIds.add(block.blocker_id);
      excludedIds.add(block.blocked_user_id);
    });

    // Get existing connection user IDs (optional filter)
    const showConnected = c.req.query('include_connected') === 'true';
    if (!showConnected) {
      const connectionsResponse = await supabaseFetch(
        c,
        `connections?or=(sender_id.eq.${userId},receiver_id.eq.${userId})&select=sender_id,receiver_id`
      );
      const connections = await readJson<Array<{ sender_id: string; receiver_id: string }>>(connectionsResponse);
      connections.forEach(conn => {
        excludedIds.add(conn.sender_id);
        excludedIds.add(conn.receiver_id);
      });
    }

    // Build exclusion filter
    const excludedIdsArray = Array.from(excludedIds);
    const exclusionFilter = excludedIdsArray.length > 0
      ? `&id=not.in.(${excludedIdsArray.join(',')})`
      : '';

    // Query profiles with username (completed profiles only)
    const response = await supabaseFetch(
      c,
      `profiles?select=id,username,created_at&username=not.is.null${exclusionFilter}&order=created_at.desc&limit=${query.limit}&offset=${query.offset}`
    );
    
    const rows = await readJson<PublicProfile[]>(response);
    
    return c.json({
      users: rows,
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

export default route;
