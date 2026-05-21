-- Étend la contrainte valid_task_type pour inclure les tâches issues des custom_automations.
-- Nécessaire pour créer des pending_tasks de fallback en cas d'échec d'envoi.
ALTER TABLE pending_tasks DROP CONSTRAINT IF EXISTS valid_task_type;
ALTER TABLE pending_tasks ADD CONSTRAINT valid_task_type CHECK (
  task_type IN (
    'failed_payment',
    'onboarding_j0',
    'onboarding_j3',
    'onboarding_j7',
    'upsell',
    'custom_automation'
  )
);
