import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import app from '../../src/index';
import { testEnv, testUser, createAuthHeader } from '../helpers/test-env';

describe('Validation Error Handling', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    // Mock successful auth by default
    global.fetch = vi.fn((url: any) => {
      if (url.includes('/auth/v1/user')) {
        return Promise.resolve(new Response(JSON.stringify(testUser), { status: 200 }));
      }
      return Promise.resolve(new Response('[]', { status: 200 }));
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('POST /api/posts', () => {
    it('rejects post without content or image', async () => {
      const req = new Request('http://localhost/api/posts', {
        method: 'POST',
        headers: {
          'Authorization': createAuthHeader(),
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({ content: '' })
      });
      
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(400);
      
      const data = await res.json();
      expect(data.error).toContain('Validation failed');
    });

    it('rejects post exceeding character limit', async () => {
      const req = new Request('http://localhost/api/posts', {
        method: 'POST',
        headers: {
          'Authorization': createAuthHeader(),
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({ content: 'a'.repeat(2001) })
      });
      
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(400);
    });

    it('rejects invalid image URL', async () => {
      const req = new Request('http://localhost/api/posts', {
        method: 'POST',
        headers: {
          'Authorization': createAuthHeader(),
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({
          content: 'test',
          image_url: 'https://example.com/image.jpg'
        })
      });
      
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/me', () => {
    it('rejects username that is too short', async () => {
      const req = new Request('http://localhost/api/me', {
        method: 'PATCH',
        headers: {
          'Authorization': createAuthHeader(),
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({ username: 'a' })
      });
      
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(400);
      
      const data = await res.json();
      expect(data.error).toContain('Validation failed');
    });

    it('rejects username that is too long', async () => {
      const req = new Request('http://localhost/api/me', {
        method: 'PATCH',
        headers: {
          'Authorization': createAuthHeader(),
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({ username: 'a'.repeat(25) })
      });
      
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(400);
    });

    it('rejects username with invalid characters', async () => {
      const req = new Request('http://localhost/api/me', {
        method: 'PATCH',
        headers: {
          'Authorization': createAuthHeader(),
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({ username: 'user@123' })
      });
      
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/connections', () => {
    it('rejects invalid receiver_id format', async () => {
      const req = new Request('http://localhost/api/connections', {
        method: 'POST',
        headers: {
          'Authorization': createAuthHeader(),
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({ receiver_id: 'not-a-uuid' })
      });
      
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(400);
    });

    it('rejects self-connection', async () => {
      const req = new Request('http://localhost/api/connections', {
        method: 'POST',
        headers: {
          'Authorization': createAuthHeader(),
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({ receiver_id: testUser.id })
      });
      
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(400);
      
      const data = await res.json();
      expect(data.error).toContain('yourself');
    });
  });

  describe('POST /api/conversations/:id/messages', () => {
    it('rejects empty message', async () => {
      const conversationId = '123e4567-e89b-12d3-a456-426614174000';
      const req = new Request(`http://localhost/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': createAuthHeader(),
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({ body: '' })
      });
      
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(400);
    });

    it('rejects message exceeding limit', async () => {
      const conversationId = '123e4567-e89b-12d3-a456-426614174000';
      const req = new Request(`http://localhost/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': createAuthHeader(),
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({ body: 'a'.repeat(2001) })
      });
      
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/reports', () => {
    it('rejects invalid target_type', async () => {
      const req = new Request('http://localhost/api/reports', {
        method: 'POST',
        headers: {
          'Authorization': createAuthHeader(),
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({
          target_type: 'invalid',
          target_id: '123e4567-e89b-12d3-a456-426614174000',
          reason: 'Test'
        })
      });
      
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(400);
    });

    it('rejects report without reason', async () => {
      const req = new Request('http://localhost/api/reports', {
        method: 'POST',
        headers: {
          'Authorization': createAuthHeader(),
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({
          target_type: 'post',
          target_id: '123e4567-e89b-12d3-a456-426614174000'
        })
      });
      
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/blocks', () => {
    it('rejects self-block', async () => {
      const req = new Request('http://localhost/api/blocks', {
        method: 'POST',
        headers: {
          'Authorization': createAuthHeader(),
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({ blocked_user_id: testUser.id })
      });
      
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(400);
      
      const data = await res.json();
      expect(data.error).toContain('yourself');
    });

    it('rejects invalid user ID format', async () => {
      const req = new Request('http://localhost/api/blocks', {
        method: 'POST',
        headers: {
          'Authorization': createAuthHeader(),
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({ blocked_user_id: 'not-a-uuid' })
      });
      
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(400);
    });
  });

  describe('Invalid JSON', () => {
    it('handles malformed JSON gracefully', async () => {
      const req = new Request('http://localhost/api/posts', {
        method: 'POST',
        headers: {
          'Authorization': createAuthHeader(),
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000'
        },
        body: '{invalid json}'
      });
      
      const res = await app.fetch(req, testEnv);
      expect(res.status).toBe(400);
      
      const data = await res.json();
      expect(data.error).toContain('Invalid JSON');
    });
  });
});
