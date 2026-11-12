import { describe, it, expect } from 'vitest';
import { SupabaseError } from '../../src/lib/supabase';

describe('SupabaseError', () => {
  it('creates error with correct properties', () => {
    const error = new SupabaseError(404, 'not_found', 'Resource not found');
    
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SupabaseError');
    expect(error.status).toBe(404);
    expect(error.code).toBe('not_found');
    expect(error.message).toBe('Resource not found');
  });

  it('maintains error stack trace', () => {
    const error = new SupabaseError(500, 'internal', 'Something went wrong');
    expect(error.stack).toBeDefined();
  });

  it('can be caught and checked with instanceof', () => {
    try {
      throw new SupabaseError(403, 'forbidden', 'Access denied');
    } catch (err) {
      expect(err).toBeInstanceOf(SupabaseError);
      if (err instanceof SupabaseError) {
        expect(err.status).toBe(403);
        expect(err.code).toBe('forbidden');
      }
    }
  });

  it('supports different status codes', () => {
    const errors = [
      new SupabaseError(400, 'bad_request', 'Bad request'),
      new SupabaseError(401, 'unauthorized', 'Unauthorized'),
      new SupabaseError(403, 'forbidden', 'Forbidden'),
      new SupabaseError(404, 'not_found', 'Not found'),
      new SupabaseError(409, 'conflict', 'Conflict'),
      new SupabaseError(500, 'internal', 'Internal error')
    ];

    expect(errors.map(e => e.status)).toEqual([400, 401, 403, 404, 409, 500]);
  });
});
