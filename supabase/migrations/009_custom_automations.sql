CREATE TABLE custom_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('delay_after_purchase', 'specific_date', 'payment_failed', 'manual')),
  trigger_delay_days INTEGER,
  trigger_date TIMESTAMPTZ,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_custom_automations_client ON custom_automations(client_id);
CREATE INDEX idx_custom_automations_active ON custom_automations(active) WHERE active = true;
