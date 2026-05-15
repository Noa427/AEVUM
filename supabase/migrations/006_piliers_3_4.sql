-- Pilier 3 (Support IA) + Pilier 4 (Upsell) — new client_configs types
alter table client_configs drop constraint if exists valid_config_type;
alter table client_configs add constraint valid_config_type check (
  config_type in (
    'stripe_webhook_secret',
    'sender_name',
    'template_failed_payment',
    'template_onboarding_j0',
    'template_onboarding_j3',
    'template_onboarding_j7',
    'support_email_enabled',
    'support_auto_reply',
    'politique_remboursement',
    'upsell_enabled',
    'upsell_product_name',
    'upsell_url',
    'upsell_price'
  )
);
