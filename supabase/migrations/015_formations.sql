-- 1. Formations table
CREATE TABLE formations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  stripe_product_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_formations_client ON formations(client_id);

-- 2. Add formation_id FK columns (nullable — backward compatible)
ALTER TABLE client_configs ADD COLUMN IF NOT EXISTS formation_id UUID REFERENCES formations(id) ON DELETE SET NULL;
ALTER TABLE custom_automations ADD COLUMN IF NOT EXISTS formation_id UUID REFERENCES formations(id) ON DELETE SET NULL;
ALTER TABLE email_tracking ADD COLUMN IF NOT EXISTS formation_id UUID REFERENCES formations(id) ON DELETE SET NULL;
ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS formation_id UUID REFERENCES formations(id) ON DELETE SET NULL;

-- 3. Create "Par défaut" formation for every existing client
INSERT INTO formations (id, client_id, name, created_at)
SELECT gen_random_uuid(), id, 'Par défaut', now()
FROM clients;

-- 4. Link all existing rows to their client's "Par défaut" formation
-- Safe: each client has exactly one formation at this point
UPDATE client_configs
SET formation_id = (SELECT id FROM formations WHERE client_id = client_configs.client_id ORDER BY created_at ASC LIMIT 1)
WHERE formation_id IS NULL;

UPDATE custom_automations
SET formation_id = (SELECT id FROM formations WHERE client_id = custom_automations.client_id ORDER BY created_at ASC LIMIT 1)
WHERE formation_id IS NULL;

UPDATE pending_tasks
SET formation_id = (SELECT id FROM formations WHERE client_id = pending_tasks.client_id ORDER BY created_at ASC LIMIT 1)
WHERE formation_id IS NULL;

UPDATE email_tracking
SET formation_id = (SELECT id FROM formations WHERE client_id = email_tracking.client_id ORDER BY created_at ASC LIMIT 1)
WHERE formation_id IS NULL;
