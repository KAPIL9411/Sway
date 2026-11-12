# Sway Backend Testing Guide

This document explains the testing strategy, how to run tests, and what's covered.

## Test Structure

```
tests/
├── unit/                      # Unit tests for individual modules
│   ├── validation.test.ts     # Zod schema validation tests
│   └── supabase.test.ts       # Error handling tests
├── integration/               # Integration tests for API endpoints
│   ├── health.test.ts         # Health check and basic middleware
│   ├── auth.test.ts           # Authentication middleware tests
│   └── validation-errors.test.ts  # Input validation error cases
└── helpers/                   # Test utilities
    └── test-env.ts            # Mock environment and helpers
```

## Running Tests

### Run all tests
```bash
npm test
```

### Watch mode (re-run on file changes)
```bash
npm run test:watch
```

### With UI
```bash
npm run test:ui
```

### With coverage report
```bash
npm run test:coverage
```

## Test Coverage

### Unit Tests (33 tests)

**Validation Schemas (`validation.test.ts`)**
- Username validation (length, characters)
- Post creation (content/image requirement, length limits)
- Connection requests (UUID format, self-connection prevention)
- Message validation (emptiness, length limits)
- Report validation (target types, required fields)
- Block validation (UUID format, self-blocking prevention)
- Pagination limits (defaults, boundaries)
- Cloudinary URL validation (ownership, domain)

**Error Handling (`supabase.test.ts`)**
- SupabaseError class properties
- Error stack traces
- instanceof checks
- Multiple status codes

### Integration Tests (31 tests)

**Health & Middleware (`health.test.ts`)**
- Health endpoint without auth ✓
- 404 handler ✓
- Request body size limits (100KB) ✓
- Origin validation (CORS) ✓

**Authentication (`auth.test.ts`)**
- Missing Authorization header rejection ✓
- Malformed Authorization header rejection ✓
- Invalid token rejection ✓
- Missing user ID in token rejection ✓
- Valid token acceptance ✓
- Token validation on all protected routes ✓

**Validation Errors (`validation-errors.test.ts`)**
- POST /api/posts
  - Rejects posts without content or image ✓
  - Rejects posts exceeding character limit ✓
  - Rejects invalid image URLs ✓
- PATCH /api/me
  - Rejects short usernames ✓
  - Rejects long usernames ✓
  - Rejects invalid characters ✓
- POST /api/connections
  - Rejects invalid receiver_id format ✓
  - Rejects self-connection ✓
- POST /api/conversations/:id/messages
  - Rejects empty messages ✓
  - Rejects messages exceeding limit ✓
- POST /api/reports
  - Rejects invalid target_type ✓
  - Rejects reports without reason ✓
- POST /api/blocks
  - Rejects self-block ✓
  - Rejects invalid user ID format ✓
- General
  - Handles malformed JSON gracefully ✓

## What's NOT Tested Yet

These require a real Supabase instance or more complex mocking:

### Database Operations
- Profile creation via auth trigger
- Username uniqueness enforcement
- Post creation with RLS
- Connection request workflows
- Conversation creation via RPC
- Message sending with RLS
- Block enforcement in queries
- Report creation

### Business Logic
- Transactional connection acceptance
- Conversation member management
- Block relationship queries
- Feed filtering by blocks
- Cloudinary signature generation

### Performance & Load
- Concurrent request handling
- Rate limiting behavior (when implemented)
- Database query performance
- Pagination efficiency

## Manual Testing with Supabase

For end-to-end testing, you need a real Supabase project:

### Setup
1. Create a test Supabase project
2. Run both migrations:
   - `supabase/migrations/0001_initial_schema.sql`
   - `supabase/migrations/0002_accept_connection_rpc.sql`
3. Enable anonymous auth in Supabase Auth settings
4. Create `.dev.vars` with real credentials
5. Run `npm run dev`

### Test Scenarios

See `tests/TEST_PLAN.md` for the complete manual testing checklist.

Key scenarios to test manually:
1. Anonymous user sign-in via Supabase client
2. Profile creation and username setting
3. Post creation and feed retrieval
4. Connection request workflow (send → accept → conversation created)
5. Messaging between connected users
6. Block enforcement (blocked users don't see each other's posts)
7. Report submission
8. Cloudinary upload flow

## Adding New Tests

### Unit Test Template
```typescript
import { describe, it, expect } from 'vitest';
import { yourFunction } from '../../src/path';

describe('YourFeature', () => {
  it('does something expected', () => {
    const result = yourFunction(input);
    expect(result).toBe(expected);
  });

  it('handles edge case', () => {
    expect(() => yourFunction(badInput)).toThrow();
  });
});
```

### Integration Test Template
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import app from '../../src/index';
import { testEnv, createAuthHeader } from '../helpers/test-env';

describe('Your Route', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    // Mock Supabase responses
    global.fetch = vi.fn((url: any) => {
      // Your mocks here
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('handles request correctly', async () => {
    const req = new Request('http://localhost/api/your-route', {
      method: 'POST',
      headers: {
        'Authorization': createAuthHeader(),
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      },
      body: JSON.stringify({ data: 'test' })
    });
    
    const res = await app.fetch(req, testEnv);
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data).toHaveProperty('expectedField');
  });
});
```

## CI/CD Integration

Add to your GitHub Actions workflow:

```yaml
- name: Run tests
  run: npm test

- name: Generate coverage
  run: npm run test:coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/coverage-final.json
```

## Test Results Summary

✅ **64 tests passing**
- 33 unit tests
- 31 integration tests

✅ **Test coverage includes:**
- Input validation (all schemas)
- Error handling
- Authentication enforcement
- Authorization checks
- Edge cases and boundaries

⚠️ **Not covered:**
- Database operations (requires real Supabase)
- RPC function behavior
- Realtime subscriptions
- Complex block enforcement queries

## Best Practices

1. **Keep tests isolated** - Each test should be independent
2. **Mock external dependencies** - Don't rely on real Supabase in unit tests
3. **Test edge cases** - Empty strings, very long strings, invalid formats
4. **Test error paths** - Not just happy paths
5. **Use descriptive test names** - Should explain what's being tested
6. **Keep tests fast** - Unit tests should run in milliseconds
7. **Update tests with code** - Tests are documentation

## Debugging Tests

### Run a single test file
```bash
npm test -- validation.test.ts
```

### Run tests matching a pattern
```bash
npm test -- -t "username validation"
```

### Get verbose output
```bash
npm test -- --reporter=verbose
```

### Debug with Chrome DevTools
```bash
npm run test:ui
```
Then open the provided URL in Chrome.

## Known Issues

1. **Cloudflare Workers environment** - Current tests run in Node.js, not Workers runtime
   - Consider using Miniflare for more realistic testing
2. **Supabase mocking** - Currently uses simple fetch mocks
   - Consider using a test Supabase instance for integration tests
3. **No load testing** - Performance under concurrent load is untested

## Next Steps

To achieve comprehensive test coverage:

1. **Add integration tests with real Supabase**
   - Use a disposable test project
   - Test RPC functions
   - Verify RLS policies

2. **Add e2e tests**
   - Full user journeys
   - Multi-user scenarios
   - Block enforcement verification

3. **Add performance tests**
   - Load testing with k6 or Artillery
   - Database query performance
   - API response times

4. **Add security tests**
   - SQL injection attempts
   - Auth bypass attempts
   - IDOR vulnerability checks
