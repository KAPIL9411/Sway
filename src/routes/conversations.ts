import { Hono } from 'hono';
import type { AppEnv, Message } from '../types';
import { readJson, supabaseFetch, SupabaseError } from '../lib/supabase';
import { createMessageSchema, messagesPaginationSchema } from '../lib/validation';
import { messageLimit } from '../middleware/ratelimit';
import { moderateText, defaultModerationConfig } from '../lib/moderation';

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

    // Get other conversation members to check blocks
    const membersResponse = await supabaseFetch(
      c,
      `conversation_members?select=user_id&conversation_id=eq.${conversationId}&user_id=neq.${userId}`
    );
    const otherMembers = await readJson<Array<{ user_id: string }>>(membersResponse);

    // Check if there's a mutual block with any member
    if (otherMembers.length > 0) {
      const otherUserIds = otherMembers.map(m => m.user_id).join(',');
      const blockCheck = await supabaseFetch(
        c,
        `blocks?or=(and(blocker_id.eq.${userId},blocked_user_id.in.(${otherUserIds})),and(blocker_id.in.(${otherUserIds}),blocked_user_id.eq.${userId}))&select=blocker_id`
      );
      const blocks = await readJson<Array<{ blocker_id: string }>>(blockCheck);
      
      if (blocks.length > 0) {
        return c.json({ error: 'Cannot send message due to block' }, 403);
      }
    }

    // Content moderation
    const moderationConfig = {
      ...defaultModerationConfig,
      enabled: c.env.MODERATION_ENABLED === 'true',
      apiKey: c.env.OPENAI_API_KEY
    };

    const moderationResult = await moderateText(validated.body, moderationConfig);
    
    if (moderationResult.action === 'block') {
      return c.json({ 
        error: 'Message violates community guidelines',
        reason: moderationResult.reason 
      }, 400);
    }

    if (moderationResult.action === 'review') {
      console.warn('[Moderation] Message flagged for review:', {
        userId,
        conversationId,
        message: validated.body.substring(0, 50),
        categories: moderationResult.categories
      });
    }
    
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
