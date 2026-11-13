import { Context, Next } from 'hono';
import type { AppEnv } from '../types';
import { supabaseFetch, readJson, SupabaseError } from '../lib/supabase';

/**
 * Middleware to check if the authenticated user has admin privileges
 */
export async function requireAdmin(c: Context<AppEnv>, next: Next) {
  const userId = c.get('user')?.id;
  
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Check if user has admin role
  const response = await supabaseFetch(
    c, 
    `admin_roles?select=role&user_id=eq.${userId}`
  );
  
  const rows = await readJson<Array<{ role: string }>>(response);

  if (rows.length === 0) {
    return c.json({ error: 'Forbidden: Admin access required' }, 403);
  }

  // Store admin role in context for potential role-based checks
  c.set('adminRole', rows[0].role);
  
  await next();
}

/**
 * Middleware to check if user has a specific admin role or higher
 */
export function requireAdminRole(minRole: 'moderator' | 'admin' | 'superadmin') {
  const roleHierarchy = { moderator: 1, admin: 2, superadmin: 3 };
  
  return async (c: Context<AppEnv>, next: Next) => {
    const userRole = c.get('adminRole') as string | undefined;
    
    if (!userRole) {
      return c.json({ error: 'Forbidden: Admin access required' }, 403);
    }

    const userLevel = roleHierarchy[userRole as keyof typeof roleHierarchy] || 0;
    const requiredLevel = roleHierarchy[minRole];

    if (userLevel < requiredLevel) {
      return c.json({ 
        error: `Forbidden: ${minRole} role or higher required` 
      }, 403);
    }

    await next();
  };
}
