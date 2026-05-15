-- Add portal_token to clients (auto-generated, immutable)
alter table clients
  add column if not exists portal_token uuid default gen_random_uuid() unique;

alter table clients
  add column if not exists client_email text;

create index if not exists idx_clients_portal_token on clients(portal_token);

-- Extend client_configs to support per-client template overrides
alter table client_configs drop constraint valid_config_type;
alter table client_configs add constraint valid_config_type check (
  config_type in (
    'stripe_webhook_secret',
    'sender_name',
    'template_failed_payment',
    'template_onboarding_j0',
    'template_onboarding_j3',
    'template_onboarding_j7'
  )
);
