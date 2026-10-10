-- Add closed-access identity tables without changing the historical baseline.
CREATE TABLE IF NOT EXISTS allowed_emails (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT allowed_emails_email_normalized CHECK (
    email = lower(btrim(email)) AND email <> ''
  )
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $year95_user_profile_auth_fk$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_user_id_fkey'
      AND conrelid = 'user_profiles'::regclass
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END
$year95_user_profile_auth_fk$;

ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE allowed_emails FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE user_profiles FROM PUBLIC;

DO $year95_repository_privileges$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE allowed_emails FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE user_profiles FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE allowed_emails FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE user_profiles FROM authenticated';
  END IF;
END
$year95_repository_privileges$;
