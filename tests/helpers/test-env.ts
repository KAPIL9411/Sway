import type { Bindings } from '../../src/types';

export const testEnv: Bindings = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  CLOUDINARY_CLOUD_NAME: 'test-cloud',
  CLOUDINARY_UPLOAD_PRESET: 'test-preset',
  CLOUDINARY_API_SECRET: 'test-secret',
  CLOUDINARY_API_KEY: 'test-api-key',
  ALLOWED_ORIGINS: 'http://localhost:3000'
};

export const testUser = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  aud: 'authenticated',
  role: 'authenticated'
};

export const testUser2 = {
  id: '223e4567-e89b-12d3-a456-426614174001',
  aud: 'authenticated',
  role: 'authenticated'
};

export function createAuthHeader(userId: string = testUser.id): string {
  // In real tests, this would be a valid JWT, but for unit tests we'll use a placeholder
  return `Bearer test-token-${userId}`;
}

export function mockSupabaseAuthResponse(user: typeof testUser) {
  return new Response(JSON.stringify(user), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function mockSupabaseErrorResponse(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function mockSupabaseSuccessResponse<T>(data: T) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
