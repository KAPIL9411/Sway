import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../../src/index';
import { testEnv } from '../helpers/test-env';

describe('Health Endpoint', () => {
  it('GET /health returns 200 without auth', async () => {
    const req = new Request('http://localhost/health', { method: 'GET' });
    const res = await app.fetch(req, testEnv);
    
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data).toEqual({
      status: 'ok',
      service: 'sway-backend'
    });
  });

  it('GET /health has correct content type', async () => {
    const req = new Request('http://localhost/health', { method: 'GET' });
    const res = await app.fetch(req, testEnv);
    
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });
});

describe('404 Handler', () => {
  it('returns 404 for unknown routes', async () => {
    const req = new Request('http://localhost/does-not-exist', { method: 'GET' });
    const res = await app.fetch(req, testEnv);
    
    expect(res.status).toBe(404);
    
    const data = await res.json();
    expect(data).toHaveProperty('error');
    expect(data.error).toBe('Not found');
  });
});

describe('Request Body Size Limit', () => {
  it('rejects requests with body over 100KB', async () => {
    const largeBody = 'x'.repeat(101 * 1024); // 101KB
    const req = new Request('http://localhost/api/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': largeBody.length.toString(),
        'Authorization': 'Bearer test-token',
        'Origin': 'http://localhost:3000'
      },
      body: largeBody
    });
    
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(413);
    
    const data = await res.json();
    expect(data.error).toContain('too large');
  });
});

describe('Origin Validation', () => {
  it('rejects requests from disallowed origins', async () => {
    const req = new Request('http://localhost/api/me', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-token',
        'Origin': 'https://evil.com'
      }
    });
    
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(403);
    
    const data = await res.json();
    expect(data.error).toContain('Origin not allowed');
  });

  it('allows requests from allowed origins', async () => {
    // Mock the Supabase auth check
    global.fetch = vi.fn((url: any) => {
      if (url.includes('/auth/v1/user')) {
        return Promise.resolve(new Response(JSON.stringify({
          id: '123e4567-e89b-12d3-a456-426614174000',
          aud: 'authenticated'
        }), { status: 200 }));
      }
      // Mock profile endpoint
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }) as any;

    const req = new Request('http://localhost/api/me', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-token',
        'Origin': 'http://localhost:3000'
      }
    });
    
    const res = await app.fetch(req, testEnv);
    // Should pass origin check (403 would mean origin rejected)
    expect(res.status).not.toBe(403);
  });
});
