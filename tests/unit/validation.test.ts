import { describe, it, expect } from 'vitest';
import {
  usernameSchema,
  createPostSchema,
  createConnectionSchema,
  updateConnectionSchema,
  createMessageSchema,
  createReportSchema,
  createBlockSchema,
  paginationSchema,
  messagesPaginationSchema,
  validateCloudinaryUrl
} from '../../src/lib/validation';

describe('Validation Schemas', () => {
  describe('usernameSchema', () => {
    it('accepts valid usernames', () => {
      expect(() => usernameSchema.parse({ username: 'user123' })).not.toThrow();
      expect(() => usernameSchema.parse({ username: 'cool_guy' })).not.toThrow();
      expect(() => usernameSchema.parse({ username: 'ab' })).not.toThrow(); // min length
      expect(() => usernameSchema.parse({ username: 'a'.repeat(24) })).not.toThrow(); // max length
    });

    it('rejects invalid usernames', () => {
      expect(() => usernameSchema.parse({ username: 'a' })).toThrow(); // too short
      expect(() => usernameSchema.parse({ username: 'a'.repeat(25) })).toThrow(); // too long
      expect(() => usernameSchema.parse({ username: 'user@123' })).toThrow(); // invalid char
      expect(() => usernameSchema.parse({ username: 'user 123' })).toThrow(); // space
      expect(() => usernameSchema.parse({ username: '' })).toThrow(); // empty
    });
  });

  describe('createPostSchema', () => {
    it('accepts posts with content', () => {
      const result = createPostSchema.parse({ content: 'Hello world' });
      expect(result.content).toBe('Hello world');
    });

    it('accepts posts with image only', () => {
      const result = createPostSchema.parse({
        content: '',
        image_url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg'
      });
      expect(result.image_url).toBeTruthy();
    });

    it('rejects posts with neither content nor image', () => {
      expect(() => createPostSchema.parse({ content: '' })).toThrow();
      expect(() => createPostSchema.parse({ content: '   ' })).toThrow();
    });

    it('rejects posts exceeding length limit', () => {
      expect(() => createPostSchema.parse({ content: 'a'.repeat(2001) })).toThrow();
    });

    it('rejects invalid Cloudinary URLs', () => {
      expect(() => createPostSchema.parse({
        content: 'test',
        image_url: 'https://example.com/image.jpg'
      })).toThrow();
    });

    it('applies default tag', () => {
      const result = createPostSchema.parse({ content: 'test' });
      expect(result.tag).toBe('General');
    });
  });

  describe('createConnectionSchema', () => {
    it('accepts valid UUID', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = createConnectionSchema.parse({ receiver_id: uuid });
      expect(result.receiver_id).toBe(uuid);
    });

    it('rejects invalid UUID', () => {
      expect(() => createConnectionSchema.parse({ receiver_id: 'not-a-uuid' })).toThrow();
      expect(() => createConnectionSchema.parse({ receiver_id: '' })).toThrow();
    });
  });

  describe('updateConnectionSchema', () => {
    it('accepts accepted status', () => {
      const result = updateConnectionSchema.parse({ status: 'accepted' });
      expect(result.status).toBe('accepted');
    });

    it('accepts rejected status', () => {
      const result = updateConnectionSchema.parse({ status: 'rejected' });
      expect(result.status).toBe('rejected');
    });

    it('rejects invalid status', () => {
      expect(() => updateConnectionSchema.parse({ status: 'pending' })).toThrow();
      expect(() => updateConnectionSchema.parse({ status: 'invalid' })).toThrow();
    });
  });

  describe('createMessageSchema', () => {
    it('accepts valid messages', () => {
      const result = createMessageSchema.parse({ body: 'Hello!' });
      expect(result.body).toBe('Hello!');
    });

    it('trims whitespace', () => {
      const result = createMessageSchema.parse({ body: '  Hello!  ' });
      expect(result.body).toBe('Hello!');
    });

    it('rejects empty messages', () => {
      expect(() => createMessageSchema.parse({ body: '' })).toThrow();
      expect(() => createMessageSchema.parse({ body: '   ' })).toThrow();
    });

    it('rejects messages exceeding limit', () => {
      expect(() => createMessageSchema.parse({ body: 'a'.repeat(2001) })).toThrow();
    });
  });

  describe('createReportSchema', () => {
    it('accepts valid reports', () => {
      const result = createReportSchema.parse({
        target_type: 'post',
        target_id: '123e4567-e89b-12d3-a456-426614174000',
        reason: 'Spam',
        details: 'This is spam content'
      });
      expect(result.target_type).toBe('post');
    });

    it('accepts reports without details', () => {
      const result = createReportSchema.parse({
        target_type: 'profile',
        target_id: '123e4567-e89b-12d3-a456-426614174000',
        reason: 'Harassment'
      });
      expect(result.details).toBeUndefined();
    });

    it('rejects invalid target types', () => {
      expect(() => createReportSchema.parse({
        target_type: 'invalid',
        target_id: '123e4567-e89b-12d3-a456-426614174000',
        reason: 'Test'
      })).toThrow();
    });
  });

  describe('createBlockSchema', () => {
    it('accepts valid user ID', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = createBlockSchema.parse({ blocked_user_id: uuid });
      expect(result.blocked_user_id).toBe(uuid);
    });

    it('rejects invalid user ID', () => {
      expect(() => createBlockSchema.parse({ blocked_user_id: 'invalid' })).toThrow();
    });
  });

  describe('paginationSchema', () => {
    it('applies defaults', () => {
      const result = paginationSchema.parse({});
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
      expect(result.sort).toBe('latest');
    });

    it('enforces limits', () => {
      const result = paginationSchema.parse({ limit: 50, offset: 5 });
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(5);
    });

    it('rejects negative values', () => {
      expect(() => paginationSchema.parse({ offset: -1 })).toThrow();
    });

    it('rejects offset exceeding maximum', () => {
      expect(() => paginationSchema.parse({ offset: 20000 })).toThrow();
    });

    it('rejects limit exceeding maximum', () => {
      expect(() => paginationSchema.parse({ limit: 100 })).toThrow();
    });
  });

  describe('messagesPaginationSchema', () => {
    it('applies default limit', () => {
      const result = messagesPaginationSchema.parse({});
      expect(result.limit).toBe(50);
    });

    it('rejects limit exceeding 100', () => {
      expect(() => messagesPaginationSchema.parse({ limit: 200 })).toThrow();
    });
  });

  describe('validateCloudinaryUrl', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000';

    it('accepts valid user-owned URLs', () => {
      const url = `https://res.cloudinary.com/demo/image/upload/sway/${userId}/photo.jpg`;
      expect(validateCloudinaryUrl(url, userId)).toBe(true);
    });

    it('rejects URLs from wrong folder', () => {
      const url = `https://res.cloudinary.com/demo/image/upload/sway/other-user/photo.jpg`;
      expect(validateCloudinaryUrl(url, userId)).toBe(false);
    });

    it('rejects non-Cloudinary URLs', () => {
      const url = 'https://example.com/photo.jpg';
      expect(validateCloudinaryUrl(url, userId)).toBe(false);
    });

    it('rejects URLs without user folder', () => {
      const url = 'https://res.cloudinary.com/demo/image/upload/photo.jpg';
      expect(validateCloudinaryUrl(url, userId)).toBe(false);
    });
  });
});
