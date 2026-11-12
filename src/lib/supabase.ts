import type { Context } from 'hono';
import type { AppEnv } from '../types';

export class SupabaseError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'SupabaseError';
  }
}

export async function supabaseFetch(
  c: Context<AppEnv>, path: string, init: RequestInit = {}
): Promise<Response> {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  const headers = new Headers(init.headers);
  headers.set('apikey', c.env.SUPABASE_ANON_KEY);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`${c.env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
}

export async function supabaseRPC<T = any>(
  c: Context<AppEnv>,
  functionName: string,
  params: Record<string, any> = {}
): Promise<T> {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  const headers = new Headers();
  headers.set('apikey', c.env.SUPABASE_ANON_KEY);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${c.env.SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params)
  });

  return readJson<T>(response);
}

export async function readJson<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!response.ok) {
    // Parse Supabase error format
    let parsed: any;
    try {
      parsed = JSON.parse(body);
    } catch {
      // Body is not JSON
    }

    // Map common Supabase/Postgres errors to user-friendly messages
    if (response.status === 409) {
      throw new SupabaseError(409, 'duplicate', 'This resource already exists');
    }
    if (response.status === 404) {
      throw new SupabaseError(404, 'not_found', 'Resource not found');
    }
    
    // Check for Postgres error codes
    if (parsed?.code === '42501' || parsed?.code === 'PGRST301') {
      throw new SupabaseError(403, 'forbidden', 'You do not have permission for this action');
    }
    if (parsed?.code === '23505') { // unique_violation
      throw new SupabaseError(409, 'duplicate', 'This resource already exists');
    }
    if (parsed?.code === '23503') { // foreign_key_violation
      throw new SupabaseError(400, 'invalid_reference', 'Referenced resource does not exist');
    }
    if (parsed?.code === '23514') { // check_violation
      throw new SupabaseError(400, 'constraint_violation', 'Data does not meet requirements');
    }

    // Handle RPC function errors (RAISE EXCEPTION)
    if (parsed?.message) {
      throw new SupabaseError(response.status, parsed.code || 'rpc_error', parsed.message);
    }

    // Generic fallback
    throw new SupabaseError(
      response.status,
      parsed?.code || 'unknown',
      parsed?.message || 'Database operation failed'
    );
  }
  return body ? JSON.parse(body) as T : {} as T;
}
