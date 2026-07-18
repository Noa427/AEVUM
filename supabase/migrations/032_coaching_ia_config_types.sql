-- Coaching J+14 généré par IA (au lieu d'un template statique) — ton/objectif configurables par client
-- Valeur = string libre, vide = défaut backend ('empathique' / 'encourager à reprendre la formation')

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
    'coaching_ia_ton',
    'coaching_ia_objectif',
    'rapport_video_active',
    'addon_f11',
    'addon_f13',
    'addon_f18',
    'vocal_ia_active',
    'delay_onboarding_j3',
    'delay_onboarding_j7',
    'delay_failed_payment_j3',
    'delay_failed_payment_j7'
  )
);
