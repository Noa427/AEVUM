-- client_configs et settings n'ont jamais eu RLS activé (oubli depuis 001).
-- Même rationale que 016/025 : pas de policy permissive, le service_role
-- (utilisé exclusivement par le backend) bypass RLS nativement ; ceci bloque
-- uniquement un accès direct via les clés anon/authenticated.

ALTER TABLE client_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
