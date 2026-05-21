# Cron Robustesse — 5 fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Éliminer les deux points CRITIQUE (jobs bloqués, double exécution) et les trois points FRAGILE (logging, custom automations sans replay, Claude sans retry) dans le cron backend.

**Architecture:** Récupération automatique des tâches bloquées au démarrage cron ; atomicité via RPC PostgreSQL ; logging DB systématique ; pending_task de fallback pour custom automations ; retry exponentiel dans le client Claude.

**Tech Stack:** Node.js/Express/TypeScript, Supabase (supabase.rpc), PostgreSQL PL/pgSQL, @anthropic-ai/sdk

---

### Task 1 — Fix 1 : Recovery des tâches bloquées en processing

**Files:**
- Modify: `backend/src/cron.ts` (début de `runScheduledJobs`)

- [ ] Ajouter `recoverStuckTasks()` dans cron.ts, appelée au début de `runScheduledJobs`

```typescript
async function recoverStuckTasks(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('pending_tasks')
    .update({ status: 'pending' })
    .eq('status', 'processing')
    .lt('created_at', cutoff)
    .select('id')
  if (!error && data && data.length > 0)
    console.log(`[cron] ${data.length} tâche(s) bloquée(s) en processing remises en pending`)
}
```

- [ ] Appeler `recoverStuckTasks()` en premier dans `runScheduledJobs()`, avant la requête des jobs.

---

### Task 2 — Fix 2 : Atomicité insert pending_task + scheduled_job done via RPC

**Files:**
- Create: `supabase/migrations/010_create_task_for_job_rpc.sql`
- Modify: `backend/src/cron.ts` (`handleStandardJob`, `handleUpsellJob`)

- [ ] Créer la migration SQL (à appliquer manuellement dans Supabase SQL Editor) :

```sql
CREATE OR REPLACE FUNCTION create_task_for_job(
  p_job_id        uuid,
  p_client_id     uuid,
  p_task_type     text,
  p_context_json  jsonb,
  p_prompt_template text,
  p_status        text,
  p_ai_response   text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_task_id uuid;
BEGIN
  INSERT INTO pending_tasks (client_id, task_type, context_json, prompt_template, ai_response, status)
  VALUES (p_client_id, p_task_type, p_context_json, p_prompt_template, p_ai_response, p_status)
  RETURNING id INTO v_task_id;

  UPDATE scheduled_jobs SET status = 'done' WHERE id = p_job_id;

  RETURN v_task_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] Remplacer les deux appels séparés dans `handleStandardJob` par un seul `supabase.rpc()`.

- [ ] Remplacer les deux appels séparés dans `handleUpsellJob` (mode manuel + mode auto) par `supabase.rpc()`.

---

### Task 3 — Fix 3 : Logging DB des erreurs cron standard

**Files:**
- Modify: `backend/src/cron.ts` (catch block de la boucle `runScheduledJobs`)

- [ ] Dans le `catch` de la boucle `for (const job of jobs)`, ajouter l'insert activity_logs après l'update scheduled_jobs.

---

### Task 4 — Fix 4 : Custom automations — pending_task en cas d'échec

**Files:**
- Create: `supabase/migrations/011_add_custom_automation_task_type.sql`
- Modify: `backend/src/cron.ts` (catch block de `runCustomAutomations`)

- [ ] Migration : étendre la contrainte valid_task_type pour inclure 'custom_automation'.
- [ ] Dans le catch de `runCustomAutomations`, créer une pending_task avec status='failed' et le contenu de l'email dans ai_response.

---

### Task 5 — Fix 5 : Claude retry avec backoff exponentiel

**Files:**
- Modify: `backend/src/services/claude.ts`

- [ ] Ajouter `withRetry()` et envelopper `callClaude` et `callClaudeChat`.
- [ ] Ne retenter que sur les statuts transitoires (429, 500, 502, 503, 529) et erreurs réseau.
- [ ] Max 3 tentatives, backoff : 1s → 2s → 4s.
