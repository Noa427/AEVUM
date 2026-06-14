-- Rapports IA hebdomadaires business AEVUM (MRR, churn, anomalies)
CREATE TABLE business_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  metrics_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_business_reports_user_created ON business_reports (user_id, created_at DESC);

ALTER TABLE business_reports ENABLE ROW LEVEL SECURITY;
