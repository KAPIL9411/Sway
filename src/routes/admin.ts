import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAdmin, requireAdminRole } from '../middleware/admin';
import { supabaseFetch, readJson, SupabaseError } from '../lib/supabase';
import { z } from 'zod';
import { logger } from '../lib/logger';

const admin = new Hono<AppEnv>();

// All admin routes require authentication + admin role
admin.use('/*', requireAdmin);

// ==========================================
// MODERATION QUEUE
// ==========================================

/**
 * Get pending moderation items
 * GET /api/admin/moderation
 */
admin.get('/moderation', async (c) => {
  const status = c.req.query('status') || 'pending';
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  const response = await supabaseFetch(
    c,
    `moderation_queue?select=id,content_type,content_id,reporter_id,reported_user_id,reason,details,status,reviewed_by,reviewed_at,resolution_notes,created_at&status=eq.${status}&order=created_at.desc&limit=${limit}&offset=${offset}`
  );

  const items = await readJson<any[]>(response);

  logger.info('Admin viewed moderation queue', {
    userId: c.get('user').id,
    status,
    count: items.length
  });

  return c.json({ items, count: items.length });
});

/**
 * Review a moderation item
 * PATCH /api/admin/moderation/:id
 */
const reviewSchema = z.object({
  action: z.enum(['approve', 'remove', 'dismiss']),
  notes: z.string().max(1000).optional()
});

admin.patch('/moderation/:id', async (c) => {
  const itemId = c.req.param('id');
  const adminId = c.get('user').id;
  
  const body = await c.req.json();
  const { action, notes } = reviewSchema.parse(body);

  // Get the moderation item
  const itemResponse = await supabaseFetch(
    c,
    `moderation_queue?select=*&id=eq.${itemId}`
  );
  const items = await readJson<any[]>(itemResponse);
  const item = items[0];

  if (!item) {
    return c.json({ error: 'Moderation item not found' }, 404);
  }

  if (item.status !== 'pending') {
    return c.json({ error: 'Item already reviewed' }, 400);
  }

  // Update moderation queue status
  const newStatus = action === 'approve' ? 'approved' : action === 'remove' ? 'removed' : 'dismissed';
  const updateResponse = await supabaseFetch(c, `moderation_queue?id=eq.${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: newStatus,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      resolution_notes: notes || null
    })
  });

  await readJson(updateResponse); // Ensure no errors

  // If action is 'remove', delete the content
  if (action === 'remove') {
    if (item.content_type === 'post') {
      await supabaseFetch(c, `posts?id=eq.${item.content_id}`, { method: 'DELETE' });
    } else if (item.content_type === 'message') {
      await supabaseFetch(c, `messages?id=eq.${item.content_id}`, { method: 'DELETE' });
    }
  }

  logger.info('Admin reviewed content', {
    userId: adminId,
    itemId,
    action,
    contentType: item.content_type
  });

  return c.json({ 
    success: true, 
    action,
    message: `Content ${action}d successfully` 
  });
});

// ==========================================
// USER MANAGEMENT
// ==========================================

/**
 * Search users
 * GET /api/admin/users
 */
admin.get('/users', async (c) => {
  const search = c.req.query('search') || '';
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  let query = `profiles?select=id,username,created_at,updated_at&order=created_at.desc&limit=${limit}&offset=${offset}`;

  if (search) {
    // URL encode the search term
    const encodedSearch = encodeURIComponent(`%${search}%`);
    query += `&username=ilike.${encodedSearch}`;
  }

  const response = await supabaseFetch(c, query);
  const users = await readJson<any[]>(response);

  return c.json({ users, count: users.length });
});

/**
 * Get user details including suspension status
 * GET /api/admin/users/:id
 */
admin.get('/users/:id', async (c) => {
  const userId = c.req.param('id');

  // Get profile
  const profileResponse = await supabaseFetch(c, `profiles?select=*&id=eq.${userId}`);
  const profiles = await readJson<any[]>(profileResponse);
  const profile = profiles[0];

  if (!profile) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Get active suspension
  const suspensionResponse = await supabaseFetch(
    c,
    `user_suspensions?select=*&user_id=eq.${userId}&expires_at=gt.${new Date().toISOString()}&order=created_at.desc&limit=1`
  );
  const suspensions = await readJson<any[]>(suspensionResponse);
  const suspension = suspensions[0] || null;

  // Get stats - use head:true for count
  const postCountResponse = await supabaseFetch(c, `posts?select=id&user_id=eq.${userId}`, {
    headers: { 'Prefer': 'count=exact' }
  });
  const postCountHeader = postCountResponse.headers.get('Content-Range');
  const postCount = postCountHeader ? parseInt(postCountHeader.split('/')[1]) : 0;

  const reportCountResponse = await supabaseFetch(c, `moderation_queue?select=id&reported_user_id=eq.${userId}`, {
    headers: { 'Prefer': 'count=exact' }
  });
  const reportCountHeader = reportCountResponse.headers.get('Content-Range');
  const reportCount = reportCountHeader ? parseInt(reportCountHeader.split('/')[1]) : 0;

  return c.json({
    profile,
    suspension,
    stats: {
      posts: postCount,
      reports: reportCount
    }
  });
});

/**
 * Suspend a user
 * POST /api/admin/users/:id/suspend
 * Requires: admin or superadmin role
 */
const suspendSchema = z.object({
  reason: z.string().min(1).max(500),
  duration_hours: z.number().min(1).max(8760), // Max 1 year
  notes: z.string().max(1000).optional()
});

admin.post('/users/:id/suspend', requireAdminRole('admin'), async (c) => {
  const userId = c.req.param('id');
  const adminId = c.get('user').id;
  
  const body = await c.req.json();
  const { reason, duration_hours, notes } = suspendSchema.parse(body);

  // Check if user exists
  const profileResponse = await supabaseFetch(c, `profiles?select=id&id=eq.${userId}`);
  const profiles = await readJson<any[]>(profileResponse);

  if (profiles.length === 0) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Check for active suspension
  const existingResponse = await supabaseFetch(
    c,
    `user_suspensions?select=id&user_id=eq.${userId}&expires_at=gt.${new Date().toISOString()}`
  );
  const existing = await readJson<any[]>(existingResponse);

  if (existing.length > 0) {
    return c.json({ error: 'User already suspended' }, 400);
  }

  // Calculate expiry
  const expiresAt = new Date(Date.now() + duration_hours * 60 * 60 * 1000);

  // Create suspension
  const insertResponse = await supabaseFetch(c, 'user_suspensions', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      suspended_by: adminId,
      reason,
      expires_at: expiresAt.toISOString(),
      notes: notes || null
    })
  });

  await readJson(insertResponse); // Ensure no errors

  logger.warn('User suspended', {
    userId: adminId,
    suspendedUserId: userId,
    reason,
    duration_hours
  });

  return c.json({ 
    success: true,
    message: 'User suspended successfully',
    expires_at: expiresAt.toISOString()
  });
});

/**
 * Lift user suspension
 * DELETE /api/admin/users/:id/suspend
 * Requires: admin or superadmin role
 */
admin.delete('/users/:id/suspend', requireAdminRole('admin'), async (c) => {
  const userId = c.req.param('id');
  const adminId = c.get('user').id;

  // Update all active suspensions to expire now
  const updateResponse = await supabaseFetch(
    c,
    `user_suspensions?user_id=eq.${userId}&expires_at=gt.${new Date().toISOString()}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ expires_at: new Date().toISOString() })
    }
  );

  await readJson(updateResponse); // Ensure no errors

  logger.info('User suspension lifted', {
    userId: adminId,
    suspendedUserId: userId
  });

  return c.json({ 
    success: true,
    message: 'Suspension lifted successfully' 
  });
});

// ==========================================
// ADMIN ROLE MANAGEMENT
// ==========================================

/**
 * List all admins
 * GET /api/admin/roles
 * Requires: superadmin role
 */
admin.get('/roles', requireAdminRole('superadmin'), async (c) => {
  const response = await supabaseFetch(
    c,
    'admin_roles?select=user_id,role,granted_by,granted_at,profiles!admin_roles_user_id_fkey(username)&order=granted_at.desc'
  );

  const admins = await readJson<any[]>(response);

  return c.json({ admins });
});

/**
 * Grant admin role
 * POST /api/admin/roles
 * Requires: superadmin role
 */
const grantRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['moderator', 'admin', 'superadmin'])
});

admin.post('/roles', requireAdminRole('superadmin'), async (c) => {
  const adminId = c.get('user').id;
  const body = await c.req.json();
  const { user_id, role } = grantRoleSchema.parse(body);

  // Check if user exists
  const profileResponse = await supabaseFetch(c, `profiles?select=id&id=eq.${user_id}`);
  const profiles = await readJson<any[]>(profileResponse);

  if (profiles.length === 0) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Check if already has a role
  const existingResponse = await supabaseFetch(c, `admin_roles?select=role&user_id=eq.${user_id}`);
  const existing = await readJson<any[]>(existingResponse);

  if (existing.length > 0) {
    return c.json({ error: 'User already has an admin role' }, 400);
  }

  // Grant role
  const insertResponse = await supabaseFetch(c, 'admin_roles', {
    method: 'POST',
    body: JSON.stringify({
      user_id,
      role,
      granted_by: adminId
    })
  });

  await readJson(insertResponse); // Ensure no errors

  logger.warn('Admin role granted', {
    userId: adminId,
    grantedTo: user_id,
    role
  });

  return c.json({ 
    success: true,
    message: `${role} role granted successfully` 
  });
});

/**
 * Revoke admin role
 * DELETE /api/admin/roles/:userId
 * Requires: superadmin role
 */
admin.delete('/roles/:userId', requireAdminRole('superadmin'), async (c) => {
  const targetUserId = c.req.param('userId');
  const adminId = c.get('user').id;

  // Prevent self-revocation
  if (targetUserId === adminId) {
    return c.json({ error: 'Cannot revoke your own admin role' }, 400);
  }

  const deleteResponse = await supabaseFetch(c, `admin_roles?user_id=eq.${targetUserId}`, {
    method: 'DELETE'
  });

  await readJson(deleteResponse); // Ensure no errors

  logger.warn('Admin role revoked', {
    userId: adminId,
    revokedFrom: targetUserId
  });

  return c.json({ 
    success: true,
    message: 'Admin role revoked successfully' 
  });
});

export default admin;
