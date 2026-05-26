CREATE TABLE client_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  reason TEXT,
  blacklisted_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT client_blacklist_unique UNIQUE (client_id, email)
);

CREATE INDEX idx_client_blacklist_client ON client_blacklist(client_id);
CREATE INDEX idx_client_blacklist_email ON client_blacklist(client_id, email);
