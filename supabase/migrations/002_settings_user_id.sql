-- Ajout user_id sur la table settings pour multi-tenant readiness
alter table settings add column if not exists user_id uuid;

-- Index pour les requêtes filtrées par user
create index if not exists idx_settings_user_id on settings(user_id);
