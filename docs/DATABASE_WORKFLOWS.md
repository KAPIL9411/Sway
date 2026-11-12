# Required database workflow before chat launch

The current API intentionally does not pretend that accepting a connection automatically
creates a conversation. Implement a Postgres function (or trusted Worker transaction) that:

1. Locks the pending connection row.
2. Verifies `auth.uid()` is the receiver.
3. Changes status to accepted.
4. Creates one conversation.
5. Adds sender and receiver to `conversation_members`.
6. Returns the conversation ID.
7. Is idempotent and cannot be called by unrelated users.

Also add a block-aware visibility rule: users who have blocked each other should not see
each other's posts or send connections/messages. Current starter tables support blocks,
but feed filtering and complete block enforcement still need implementation.
