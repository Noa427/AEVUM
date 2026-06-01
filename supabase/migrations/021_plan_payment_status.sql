-- supabase/migrations/021_plan_payment_status.sql
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'standard'
    CHECK (plan IN ('standard', 'premium')),
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'active'
    CHECK (payment_status IN ('active', 'unpaid'));
