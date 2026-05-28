ALTER TABLE clients
  ADD COLUMN whatsapp_phone_number_id TEXT,
  ADD COLUMN whatsapp_access_token    TEXT,
  ADD COLUMN whatsapp_active          BOOLEAN NOT NULL DEFAULT false;
