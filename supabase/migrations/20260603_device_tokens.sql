-- ============================================================
-- Migration: Device Tokens for Push Notifications
-- Date: 2026-06-03
-- Description: Stores Expo push tokens per device/user. Used to fan out
--              "new order" notifications to staff (Hema Cereais employees).
--              The is_staff flag is cached at registration time so the
--              backend can filter staff tokens without joining auth.users
--              on every push fan-out.
-- ============================================================

CREATE TABLE IF NOT EXISTS device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL UNIQUE,
  platform text CHECK (platform IN ('ios', 'android', 'web')),
  is_staff boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_tokens_user_id_idx ON device_tokens(user_id);
CREATE INDEX IF NOT EXISTS device_tokens_is_staff_idx ON device_tokens(is_staff) WHERE is_staff = true;

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION set_device_tokens_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS device_tokens_set_updated_at ON device_tokens;
CREATE TRIGGER device_tokens_set_updated_at
  BEFORE UPDATE ON device_tokens
  FOR EACH ROW
  EXECUTE FUNCTION set_device_tokens_updated_at();

-- RLS: users can only access their own tokens. Service role (backend) bypasses RLS.
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_tokens_select_own ON device_tokens;
CREATE POLICY device_tokens_select_own ON device_tokens
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS device_tokens_insert_own ON device_tokens;
CREATE POLICY device_tokens_insert_own ON device_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS device_tokens_update_own ON device_tokens;
CREATE POLICY device_tokens_update_own ON device_tokens
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS device_tokens_delete_own ON device_tokens;
CREATE POLICY device_tokens_delete_own ON device_tokens
  FOR DELETE USING (auth.uid() = user_id);
