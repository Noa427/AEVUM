-- supabase/migrations/028_ai_quota.sql
-- NOTE 2026-06-14 : appliquée manuellement sur la base distante via le SQL Editor
-- Supabase (hors tracking supabase/migrations) — ne pas la rejouer en pensant
-- qu'elle est manquante.
--
-- Quota IA mensuel par client (NULL = utilise le défaut global settings.ai_quota_eur_month_default)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ai_quota_eur_month NUMERIC(10,2);
