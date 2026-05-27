-- Activation RLS sur email_tracking, formations, client_blacklist
--
-- Le backend utilise SUPABASE_SERVICE_ROLE_KEY qui bypass le RLS nativement.
-- Ces tables n'utilisent pas Supabase Auth (auth.uid() = NULL) donc des policies
-- basées sur client_id ne sont pas applicables via ce mécanisme.
--
-- L'activation RLS sans policy permissive bloque tout accès direct via la clé
-- anon ou authenticated — le service_role conserve un accès complet.

ALTER TABLE email_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE formations ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_blacklist ENABLE ROW LEVEL SECURITY;
