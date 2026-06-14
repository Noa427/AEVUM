-- NOTE 2026-06-14 : appliquée manuellement sur la base distante via le SQL Editor
-- Supabase (hors tracking supabase/migrations) — ne pas la rejouer en pensant
-- qu'elle est manquante.
--
-- Corrige deux dérives détectées entre le code et la base distante :
-- 1) valid_config_type n'avait pas été mis à jour depuis la migration 006 (27 types
--    manquants : addons F11/F13/F18, vocal_ia_active, templates J1/J3/J7, etc.)
-- 2) la migration 026 (formation_key + scope par formation) n'a jamais été appliquée

-- a) valid_config_type : aligner sur ALLOWED_CONFIG_TYPES (backend/src/schemas/client.ts) + stripe_webhook_secret
ALTER TABLE client_configs DROP CONSTRAINT IF EXISTS valid_config_type;
ALTER TABLE client_configs ADD CONSTRAINT valid_config_type CHECK (
  config_type IN (
    'stripe_webhook_secret',
    'sender_name',
    'template_onboarding_j0',
    'template_onboarding_j3',
    'template_onboarding_j7',
    'template_failed_payment',
    'template_failed_payment_j1',
    'template_failed_payment_j3',
    'template_failed_payment_j7',
    'upsell_enabled',
    'upsell_product_name',
    'upsell_url',
    'upsell_price',
    'support_email_enabled',
    'support_auto_reply',
    'politique_remboursement',
    'template_checkout_abandon',
    'template_testimonial_j30',
    'template_testimonial_j60',
    'testimonial_url',
    'template_predunning',
    'template_churn_reengagement',
    'template_coaching_j14',
    'rapport_video_active',
    'addon_f11',
    'addon_f13',
    'addon_f18',
    'vocal_ia_active'
  )
);

-- b) Rejouer 026 : normaliser formation_id, ajouter formation_key + contrainte d'unicité par formation
UPDATE client_configs
SET formation_id = NULL
WHERE config_type NOT LIKE 'template_%';

ALTER TABLE client_configs DROP CONSTRAINT IF EXISTS uq_client_config;

ALTER TABLE client_configs DROP COLUMN IF EXISTS formation_key;
ALTER TABLE client_configs
  ADD COLUMN formation_key UUID GENERATED ALWAYS AS
    (COALESCE(formation_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED;

ALTER TABLE client_configs DROP CONSTRAINT IF EXISTS uq_client_config_formation;
ALTER TABLE client_configs
  ADD CONSTRAINT uq_client_config_formation UNIQUE (client_id, config_type, formation_key);
