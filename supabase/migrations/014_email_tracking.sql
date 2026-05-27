CREATE TABLE email_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  student_email TEXT NOT NULL,
  config_type TEXT NOT NULL,
  automation_id UUID REFERENCES custom_automations(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  click_url TEXT
);

CREATE INDEX idx_email_tracking_client ON email_tracking(client_id);
CREATE INDEX idx_email_tracking_student ON email_tracking(client_id, student_email);
