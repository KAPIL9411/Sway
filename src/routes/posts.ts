import { Hono } from 'hono';
import type { AppEnv, Post } from '../types';
import { readJson, supabaseFetch, SupabaseError } from '../lib/supabase';
import { createPostSchema, paginationSchema, validateCloudinaryUrl } from '../lib/validation';
import { postCreationLimit } from '../middleware/ratelimit';
import { moderateText, defaultModerationConfig } from '../lib/moderation';

const route = new Hono<AppEnv>();

// Apply rate limiting to post creation
route.post('/', postCreationLimit);

route.get('/', async c => {
  try {
    // Validate query parameters
    const query = paginationSchema.parse({
      sort: c.req.query('sort'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset')
    });
    
    const userId = c.get('user').id;
    
    // Build query to exclude blocked users
    // This filters out posts from users you've blocked or who have blocked you
    const blockedQuery = `posts?select=id,user_id,content,image_url,tag,created_at,profiles(username)&user_id.not.in.(SELECT blocked_user_id FROM blocks WHERE blocker_id = '${userId}' UNION SELECT blocker_id FROM blocks WHERE blocked_user_id = '${userId}')&order=created_at.desc&limit=${query.limit}&offset=${query.offset}`;
    
    const response = await supabaseFetch(c, blockedQuery);
    const rows = await readJson<Post[]>(response);
    
    return c.json({
      posts: rows,
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

route.post('/', async c => {
  try {
    const body = await c.req.json();
    const validated = createPostSchema.parse(body);
    const userId = c.get('user').id;

    // Additional validation: verify Cloudinary URL belongs to this user
    if (validated.image_url && !validateCloudinaryUrl(validated.image_url, userId)) {
      return c.json({ error: 'Image URL does not belong to your account' }, 403);
    }

    // Content moderation
    const moderationConfig = {
      ...defaultModerationConfig,
      enabled: c.env.MODERATION_ENABLED === 'true',
      apiKey: c.env.OPENAI_API_KEY
    };

    if (validated.content) {
      const moderationResult = await moderateText(validated.content, moderationConfig);
      
      if (moderationResult.action === 'block') {
        return c.json({ 
          error: 'Content violates community guidelines',
          reason: moderationResult.reason 
        }, 400);
      }

      if (moderationResult.action === 'review') {
        // Add to moderation queue (if table exists)
        // For now, allow but flag for review
        console.warn('[Moderation] Content flagged for review:', {
          userId,
          content: validated.content.substring(0, 100),
          categories: moderationResult.categories
        });
      }
    }

    const response = await supabaseFetch(c, 'posts', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: userId,
        content: validated.content,
        image_url: validated.image_url ?? null,
        tag: validated.tag
      })
    });
    
    const rows = await readJson<Post[]>(response);
    return c.json({ post: rows[0] ?? null }, 201);
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

route.patch('/:id', async c => {
  try {
    const postId = c.req.param('id');
    const body = await c.req.json();
    const validated = createPostSchema.parse(body);
    const userId = c.get('user').id;

    // Validate Cloudinary URL if provided
    if (validated.image_url && !validateCloudinaryUrl(validated.image_url, userId)) {
      return c.json({ error: 'Image URL does not belong to your account' }, 403);
    }

    // Content moderation
    const moderationConfig = {
      ...defaultModerationConfig,
      enabled: c.env.MODERATION_ENABLED === 'true',
      apiKey: c.env.OPENAI_API_KEY
    };

    if (validated.content) {
      const moderationResult = await moderateText(validated.content, moderationConfig);
      
      if (moderationResult.action === 'block') {
        return c.json({ 
          error: 'Content violates community guidelines',
          reason: moderationResult.reason 
        }, 400);
      }
    }

    // Update post (RLS ensures only owner can update)
    const response = await supabaseFetch(
      c,
      `posts?id=eq.${postId}&user_id=eq.${userId}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          content: validated.content,
          image_url: validated.image_url ?? null,
          tag: validated.tag
        })
      }
    );
    
    const rows = await readJson<Post[]>(response);
    if (!rows.length) {
      return c.json({ error: 'Post not found or you do not have permission to edit it' }, 404);
    }
    
    return c.json({ post: rows[0] });
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

route.delete('/:id', async c => {
  try {
    const postId = c.req.param('id');
    const userId = c.get('user').id;

    // Delete post (RLS ensures only owner can delete)
    const response = await supabaseFetch(
      c,
      `posts?id=eq.${postId}&user_id=eq.${userId}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' }
      }
    );
    
    const rows = await readJson<Post[]>(response);
    if (!rows.length) {
      return c.json({ error: 'Post not found or you do not have permission to delete it' }, 404);
    }
    
    return c.json({ message: 'Post deleted successfully', post: rows[0] });
  } catch (err) {
    if (err instanceof SupabaseError) {
      return c.json({ error: err.message }, err.status as any);
    }
    throw err;
  }
});

export default route;
