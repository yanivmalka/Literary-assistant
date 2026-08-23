-- Tighten the wallet RPC after reconciling deployed privileges.
-- The client calls this function only with an authenticated Supabase session.
-- Explicitly revoke any legacy direct grant from anon; keep authenticated access.

REVOKE ALL ON FUNCTION public.get_quill_wallet() FROM anon;
REVOKE ALL ON FUNCTION public.get_quill_wallet() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quill_wallet() TO authenticated;
