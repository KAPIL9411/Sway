import { Hono } from 'hono';
import type { AppEnv, Connection } from '../types';
import { readJson, supabaseFetch, supabaseRPC, SupabaseError } from '../lib/supabase';
import { createConnectionSchema, updateConnectionSchema } from '../lib/validation';
import { connectionRequestLimit } from '../middleware/ratelimit';

const route = new Hono<AppEnv>();

// Apply rate limiting to connection requests
route.post('/', connectionRequestLimit);

route.get('/', async c => {
  try {
    const userId = c.get('user').id;
    const response = await supabaseFetch(
      c,
      `connections?select=*&or=(sender_id.eq.${userId},receiver_id.eq.${userId})&order=created_at.desc`
    );
    const rows = await readJson<Connection[]>(response);
    return c.json({ connections: rows });
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

route.post('/', async c => {
  try {
    const body = await c.req.json();
    const validated = createConnectionSchema.parse(body);
    const userId = c.get('user').id;
    
    // Prevent self-connection
    if (validated.receiver_id === userId) {
      return c.json({ error: 'Cannot send connection request to yourself' }, 400);
    }

    // Check for mutual blocks before allowing connection request
    const blockCheckQuery = `blocks?or=(and(blocker_id.eq.${userId},blocked_user_id.eq.${validated.receiver_id}),and(blocker_id.eq.${validated.receiver_id},blocked_user_id.eq.${userId}))&select=blocker_id`;
    const blockResponse = await supabaseFetch(c, blockCheckQuery);
    const blocks = await readJson<Array<{ blocker_id: string }>>(blockResponse);
    
    if (blocks.length > 0) {
      return c.json({ error: 'Cannot send connection request to this user' }, 403);
    }

    // Create connection request
    const response = await supabaseFetch(c, 'connections', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        sender_id: userId,
        receiver_id: validated.receiver_id
      })
    });
    
    const rows = await readJson<Connection[]>(response);
    return c.json({ connection: rows[0] ?? null }, 201);
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

route.patch('/:id', async c => {
  try {
    const body = await c.req.json();
    const validated = updateConnectionSchema.parse(body);
    const connectionId = c.req.param('id');

    // Use transactional RPC functions for accept/reject
    if (validated.status === 'accepted') {
      const result = await supabaseRPC<{ connection: Connection; conversation_id: string }>(
        c,
        'accept_connection_request',
        { connection_request_id: connectionId }
      );
      
      return c.json({
        connection: result.connection,
        conversation_id: result.conversation_id
      });
    } else {
      // rejected
      const result = await supabaseRPC<{ connection: Connection }>(
        c,
        'reject_connection_request',
        { connection_request_id: connectionId }
      );
      
      return c.json({ connection: result.connection });
    }
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

export default route;
