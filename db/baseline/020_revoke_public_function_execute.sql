-- Keep public-schema functions server-side only.
-- The application uses direct PostgreSQL access through pg/DATABASE_URL and
-- does not expose application functions through the Supabase Data API.

BEGIN;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public
FROM PUBLIC, anon, authenticated;

-- PostgreSQL grants EXECUTE on newly created functions to PUBLIC by default.
-- Remove that default so future public-schema functions remain non-public.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

COMMIT;
