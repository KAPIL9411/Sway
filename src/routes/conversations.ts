import { Hono } from 'hono';
import type { AppEnv, Message } from '../types';
import { readJson, supabaseFetch, SupabaseError } from '../lib/supabase';
import { createMessageSchema, messagesPaginationSchema } from '../lib/validation';
import { messageLimit } from '../middleware/ratelimit';

const route = new Hono<AppEnv>();

// Apply rate limiting to message sending
route.post('/:id/messages', messageLimit);

route.get('/', async c => {
  try {
    const userId = c.get('user').id;
    const response = await supabaseFetch(
      c,
      `conversation_members?select=conversation_id,conversations(id,created_at,last_message_at)&user_id=eq.${userId}`
    );
    const rows = await readJson<unknown[]>(response);
    return c.json({ conversations: rows });
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

route.get('/:id/messages', async c => {
  try {
    const query = messagesPaginationSchema.parse({
      limit: c.req.query('limit')
    });
    
    const conversationId = c.req.param('id');
    const userId = c.get('user').id;
    
    // RLS will enforce membership, but we'll explicitly check for better error message
    const membershipCheck = await supabaseFetch(
      c,
      `conversation_members?select=user_id&conversation_id=eq.${conversationId}&user_id=eq.${userId}`
    );
    const membership = await readJson<Array<{ user_id: string }>>(membershipCheck);
    
    if (membership.length === 0) {
      return c.json({ error: 'You are not a member of this conversation' }, 403);
    }

    const response = await supabaseFetch(
      c,
      `messages?select=id,conversation_id,sender_id,body,created_at&conversation_id=eq.${conversationId}&order=created_at.desc&limit=${query.limit}`
    );
    const rows = await readJson<Message[]>(response);
    
    // Return in chronological order (oldest first)
    return c.json({ messages: rows.reverse() });
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

route.post('/:id/messages', async c => {
  try {
    const body = await c.req.json();
    const validated = createMessageSchema.parse(body);
    const conversationId = c.req.param('id');
    const userId = c.get('user').id;

    // Check membership before attempting to send
    const membershipCheck = await supabaseFetch(
      c,
      `conversation_members?select=user_id&conversation_id=eq.${conversationId}&user_id=eq.${userId}`
    );
    const membership = await readJson<Array<{ user_id: string }>>(membershipCheck);
    
    if (membership.length === 0) {
      return c.json({ error: 'You are not a member of this conversation' }, 403);
    }

    // TODO: Add block enforcement - check if other participant has blocked this user
    
    const response = await supabaseFetch(c, 'messages', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        conversation_id: conversationId,
        sender_id: userId,
        body: validated.body
      })
    });
    
    const rows = await readJson<Message[]>(response);
    return c.json({ message: rows[0] ?? null }, 201);
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

export default route;
