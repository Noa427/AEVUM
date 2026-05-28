ALTER TABLE email_tracking
  ADD COLUMN channel TEXT NOT NULL DEFAULT 'email';

CREATE INDEX idx_email_tracking_channel
  ON email_tracking(client_id, channel);
