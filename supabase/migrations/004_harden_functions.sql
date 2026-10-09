-- 004_harden_functions.sql
-- Fixes Supabase security advisor warnings on the SECURITY DEFINER helpers:
-- pin search_path, and stop exposing them as public RPC endpoints.

ALTER FUNCTION public.fn_complaints_status_change() SET search_path = public;
ALTER FUNCTION public.get_officer_role() SET search_path = public;
ALTER FUNCTION public.get_officer_department_id() SET search_path = public;

-- The trigger function is only ever run by the trigger itself.
REVOKE EXECUTE ON FUNCTION public.fn_complaints_status_change() FROM PUBLIC, anon, authenticated;

-- The RLS helpers are evaluated inside policies for signed-in officers, so
-- `authenticated` keeps EXECUTE; anonymous callers lose it.
REVOKE EXECUTE ON FUNCTION public.get_officer_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_officer_department_id() FROM PUBLIC, anon;
