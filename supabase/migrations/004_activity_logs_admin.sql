-- client_id nullable pour les logs admin (pas liés à un client spécifique)
alter table activity_logs alter column client_id drop not null;

-- user_id pour tracer quel admin a fait la requête
alter table activity_logs add column if not exists user_id uuid;

-- category pour distinguer email_ops vs admin_access
alter table activity_logs add column if not exists category text;
