import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import app from '../../src/index';
import { testEnv, testUser, createAuthHeader } from '../helpers/test-env';

describe('Authentication Middleware', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejects requests without Authorization header', async () => {
    const req = new Request('http://localhost/api/me', {
      method: 'GET',
      headers: {
        'Origin': 'http://localhost:3000'
      }
    });
    
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(401);
    
    const data = await res.json();
    expect(data.error).toContain('bearer token');
  });

  it('rejects requests with malformed Authorization header', async () => {
    const req = new Request('http://localhost/api/me', {
      method: 'GET',
      headers: {
        'Authorization': 'NotBearer token',
        'Origin': 'http://localhost:3000'
      }
    });
    
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(401);
    
    const data = await res.json();
    expect(data.error).toContain('bearer token');
  });

  it('rejects requests with invalid token', async () => {
    // Mock Supabase returning 401
    global.fetch = vi.fn((url: any) => {
      if (url.includes('/auth/v1/user')) {
        return Promise.resolve(new Response('Unauthorized', { status: 401 }));
      }
      return Promise.resolve(new Response('Not found', { status: 404 }));
    }) as any;

    const req = new Request('http://localhost/api/me', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer invalid-token',
        'Origin': 'http://localhost:3000'
      }
    });
    
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(401);
    
    const data = await res.json();
    expect(data.error).toContain('Invalid or expired session');
  });

  it('rejects token with missing user ID', async () => {
    // Mock Supabase returning valid response but no ID
    global.fetch = vi.fn((url: any) => {
      if (url.includes('/auth/v1/user')) {
        return Promise.resolve(new Response(JSON.stringify({
          aud: 'authenticated',
          role: 'authenticated'
          // Missing id field
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('Not found', { status: 404 }));
    }) as any;

    const req = new Request('http://localhost/api/me', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-token',
        'Origin': 'http://localhost:3000'
      }
    });
    
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(401);
    
    const data = await res.json();
    expect(data.error).toContain('Invalid session identity');
  });

  it('accepts valid token and proceeds to route', async () => {
    // Mock valid auth and profile response
    global.fetch = vi.fn((url: any) => {
      if (url.includes('/auth/v1/user')) {
        return Promise.resolve(new Response(JSON.stringify(testUser), { status: 200 }));
      }
      if (url.includes('profiles')) {
        return Promise.resolve(new Response(JSON.stringify([{
          id: testUser.id,
          username: 'testuser',
          created_at: new Date().toISOString()
        }]), { status: 200 }));
      }
      return Promise.resolve(new Response('Not found', { status: 404 }));
    }) as any;

    const req = new Request('http://localhost/api/me', {
      method: 'GET',
      headers: {
        'Authorization': createAuthHeader(),
        'Origin': 'http://localhost:3000'
      }
    });
    
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data).toHaveProperty('profile');
    expect(data.profile).toHaveProperty('id');
  });

  it('validates token on every protected route', async () => {
    // Mock invalid auth
    global.fetch = vi.fn((url: any) => {
      if (url.includes('/auth/v1/user')) {
        return Promise.resolve(new Response('Unauthorized', { status: 401 }));
      }
      return Promise.resolve(new Response('Not found', { status: 404 }));
    }) as any;

    const protectedRoutes = [
      '/api/me',
      '/api/posts',
      '/api/connections',
      '/api/conversations',
      '/api/uploads/sign'
    ];

    for (const route of protectedRoutes) {
      const req = new Request(`http://localhost${route}`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer invalid-token',
          'Origin': 'http://localhost:3000'
        }
      });
      
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(401);
    }
  });
});
