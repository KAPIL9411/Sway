-- Transactional connection acceptance + conversation creation
-- Run this migration after 0001_initial_schema.sql

CREATE OR REPLACE FUNCTION public.accept_connection_request(connection_request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  connection_row record;
  new_conversation_id uuid;
  result json;
BEGIN
  -- Lock the connection row for update
  SELECT * INTO connection_row
  FROM connections
  WHERE id = connection_request_id
  FOR UPDATE;

  -- Verify the connection exists
  IF connection_row IS NULL THEN
    RAISE EXCEPTION 'Connection request not found';
  END IF;

  -- Verify the caller is the receiver
  IF connection_row.receiver_id != auth.uid() THEN
    RAISE EXCEPTION 'You are not authorized to respond to this connection request';
  END IF;

  -- Verify it's still pending
  IF connection_row.status != 'pending' THEN
    RAISE EXCEPTION 'Connection request is not pending (current status: %)', connection_row.status;
  END IF;

  -- Check for mutual blocks
  IF EXISTS (
    SELECT 1 FROM blocks
    WHERE (blocker_id = connection_row.sender_id AND blocked_user_id = connection_row.receiver_id)
       OR (blocker_id = connection_row.receiver_id AND blocked_user_id = connection_row.sender_id)
  ) THEN
    RAISE EXCEPTION 'Cannot accept connection due to block';
  END IF;

  -- Update connection status to accepted
  UPDATE connections
  SET status = 'accepted'
  WHERE id = connection_request_id;

  -- Check if a conversation already exists between these users
  -- (in case of race condition or manual data manipulation)
  SELECT c.id INTO new_conversation_id
  FROM conversations c
  INNER JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = connection_row.sender_id
  INNER JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = connection_row.receiver_id
  LIMIT 1;

  -- If no conversation exists, create one
  IF new_conversation_id IS NULL THEN
    INSERT INTO conversations (created_at, last_message_at)
    VALUES (now(), now())
    RETURNING id INTO new_conversation_id;

    -- Add both members
    INSERT INTO conversation_members (conversation_id, user_id, joined_at)
    VALUES
      (new_conversation_id, connection_row.sender_id, now()),
      (new_conversation_id, connection_row.receiver_id, now());
  END IF;

  -- Build result JSON
  result := json_build_object(
    'connection', row_to_json(connection_row),
    'conversation_id', new_conversation_id
  );

  RETURN result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.accept_connection_request(uuid) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.accept_connection_request IS
  'Atomically accepts a connection request and creates a conversation between sender and receiver. Only the receiver can call this function.';


-- Reject connection request (simpler, no conversation creation)
CREATE OR REPLACE FUNCTION public.reject_connection_request(connection_request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  connection_row record;
  result json;
BEGIN
  -- Lock the connection row for update
  SELECT * INTO connection_row
  FROM connections
  WHERE id = connection_request_id
  FOR UPDATE;

  -- Verify the connection exists
  IF connection_row IS NULL THEN
    RAISE EXCEPTION 'Connection request not found';
  END IF;

  -- Verify the caller is the receiver
  IF connection_row.receiver_id != auth.uid() THEN
    RAISE EXCEPTION 'You are not authorized to respond to this connection request';
  END IF;

  -- Verify it's still pending
  IF connection_row.status != 'pending' THEN
    RAISE EXCEPTION 'Connection request is not pending (current status: %)', connection_row.status;
  END IF;

  -- Update connection status to rejected
  UPDATE connections
  SET status = 'rejected'
  WHERE id = connection_request_id;

  -- Refresh the row to get updated status
  SELECT * INTO connection_row
  FROM connections
  WHERE id = connection_request_id;

  -- Build result JSON
  result := json_build_object(
    'connection', row_to_json(connection_row)
  );

  RETURN result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.reject_connection_request(uuid) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.reject_connection_request IS
  'Rejects a connection request. Only the receiver can call this function.';
