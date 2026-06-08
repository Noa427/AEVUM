-- Active RLS sur les tables qui en étaient dépourvues — bloque l'accès via les clés
-- anon/authenticated ; le backend continue d'opérer via service_role (bypass RLS natif).
-- Pas de CREATE POLICY : aucun accès direct côté client n'est attendu sur ces tables.

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
